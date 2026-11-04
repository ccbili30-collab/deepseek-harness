/**
 * Copy/import allocation for card identifiers and immutable payload files.
 * Known widget JSON carries local identifiers; opaque extensions retain bytes.
 * @module noven-cards/transfer
 */
import { createHash } from 'node:crypto'
import { mintId, type ContentDocument, type ContentModule } from './model.ts'
import { cardDocuments, cardModules, cardPayloadRefs } from './document-graph.ts'

/** Payload IO uses the source and destination root-card directories respectively. */
export interface CardTransfer {
  readonly rootId: string
  /** Stored root address for self-references; differs from rootId for an internal-character copy. */
  readonly targetCardId?: string
  readonly readPayload: (ref: string) => Promise<Uint8Array>
  readonly writePayload: (bytes: Uint8Array) => Promise<string>
}

const STRUCTURED_WIDGETS = new Set(['collection', 'timeline', 'map', 'relation', 'scene'])
const RESOURCE_KEYS = new Set(['resourceId', 'visualKey', 'avatar', 'imageResourceId'])
const MODULE_KEYS = new Set(['moduleId', 'mapModuleId'])
const LOCAL_KEYS = new Set(['id', 'from', 'to', 'itemId', 'fieldId', 'objectId', 'markerId'])
const ID_LISTS: Record<string, readonly (readonly string[])[]> = {
  collection: [['items'], ['noven', 'fields']],
  timeline: [['noven', 'events'], ['noven', 'eras'], ['noven', 'marks']],
  map: [['objects'], ['markers'], ['noven', 'objects'], ['noven', 'markers']],
  relation: [['nodes'], ['edges']],
  scene: [['objects']],
  layout: [['tiles']],
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

/** Allocate widget-local ids separately, since different modules can both contain `ev-0`. */
function payloadIds(value: unknown, type: string): Map<string, string> {
  const ids = new Map<string, string>()
  for (const path of ID_LISTS[type] ?? []) {
    let list: unknown = value
    for (const key of path) list = object(list)?.[key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const id = object(entry)?.id
      if (typeof id === 'string' && !ids.has(id)) ids.set(id, mintId())
    }
  }
  return ids
}

/**
 * Allocate every owned identifier before rewriting references, then transfer files.
 * References to external cards stay external. Known widget data and layout extensions
 * remap their references; ordinary text retains bytes except local card-image links.
 * @param source - Complete card or character document.
 * @param io - Destination identity and source/destination payload operations.
 * @returns Independent document with transferred files and consistent references.
 */
export async function transferCardDocument(source: ContentDocument, io: CardTransfer): Promise<ContentDocument> {
  const ids = new Map<string, string>([[source.id, io.rootId]])
  const own = (id: string): void => { if (!ids.has(id)) ids.set(id, mintId()) }
  for (const document of cardDocuments(source)) {
    own(document.id)
    document.resources.forEach(resource => own(resource.id))
  }
  for (const { module } of cardModules(source)) {
    own(module.id)
    module.blocks.forEach(block => own(block.id))
  }
  const mapped = (id: string): string => ids.get(id) ?? id
  const cardAddress = (id: string): string => id === source.id ? io.targetCardId ?? io.rootId : mapped(id)
  const bytes = new Map<string, Uint8Array>()
  for (const ref of cardPayloadRefs(source)) bytes.set(ref, await io.readPayload(ref))

  const widgets = new Map<string, { ref: string, data: unknown, ids: Map<string, string> }>()
  for (const { module } of cardModules(source)) {
    if (!STRUCTURED_WIDGETS.has(module.widget?.type ?? '')) continue
    const block = module.blocks.find(candidate => candidate.kind === 'text')
    if (block?.kind !== 'text') continue
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.get(block.content)))
    widgets.set(module.id, { ref: block.content, data, ids: payloadIds(data, module.widget?.type ?? '') })
  }
  const layouts = new Map<string, { data: unknown, ids: Map<string, string> }>()
  for (const owner of cardDocuments(source)) {
    for (const [key, ref] of Object.entries(owner.extensions)) {
      if (!key.startsWith('noven.layout.')) continue
      const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.get(ref)))
      layouts.set(ref, { data, ids: payloadIds(data, 'layout') })
    }
  }
  const emptyIds = new Map<string, string>()
  const local = (id: string, scope: ReadonlyMap<string, string>): string => scope.get(id) ?? mapped(id)
  const imageLinks = (text: string): string => text.replace(
    /card-image:([a-zA-Z0-9_-]+)(?:#([a-zA-Z0-9_-]+))?/gu,
    (_match, resourceId: string, blockId?: string) =>
      `card-image:${mapped(resourceId)}${blockId === undefined ? '' : `#${mapped(blockId)}`}`,
  )
  const rewrite = (value: unknown, scope: ReadonlyMap<string, string>, dictionary = false): unknown => {
    if (Array.isArray(value)) return value.map(entry => rewrite(entry, scope))
    const record = object(value)
    if (record === undefined) return value
    if (typeof record.cardId === 'string' && !ids.has(record.cardId)) return structuredClone(record)
    const sourceModuleId = typeof record.moduleId === 'string' ? record.moduleId
      : typeof record.mapModuleId === 'string' ? record.mapModuleId : undefined
    const referentScope = sourceModuleId === undefined ? scope : widgets.get(sourceModuleId)?.ids ?? scope
    return Object.fromEntries(Object.entries(record).map(([key, entry]) => {
      const newKey = dictionary ? local(key, scope) : key
      if (key === 'presentation') return [newKey, structuredClone(entry)]
      if (typeof entry === 'string') {
        if (key === 'cardId') return [newKey, cardAddress(entry)]
        if (RESOURCE_KEYS.has(key) || MODULE_KEYS.has(key)) return [newKey, mapped(entry)]
        if (key === 'id') return [newKey, scope.get(entry) ?? entry]
        if (LOCAL_KEYS.has(key)) return [newKey, local(entry, referentScope)]
      }
      return [newKey, rewrite(entry, referentScope, key === 'values' || dictionary)]
    }))
  }
  const written = new Map<string, string>()
  const write = async (ref: string, replacement?: string): Promise<string> => {
    const original = bytes.get(ref)
    if (original === undefined) throw new Error(`卡片载荷不存在：${ref}`)
    const data = replacement === undefined ? original : new TextEncoder().encode(replacement)
    const key = `${ref}:${createHash('sha256').update(data).digest('hex')}`
    const hit = written.get(key)
    if (hit !== undefined) return hit
    const next = await io.writePayload(data)
    written.set(key, next)
    return next
  }
  const text = async (ref: string): Promise<string> => {
    const raw = new TextDecoder().decode(bytes.get(ref))
    const next = imageLinks(raw)
    return write(ref, next === raw ? undefined : next)
  }
  const structured = async (ref: string, data: unknown, scope: ReadonlyMap<string, string>): Promise<string> => {
    const next = rewrite(data, scope)
    return write(ref, JSON.stringify(next) === JSON.stringify(data) ? undefined : `${JSON.stringify(next, null, 2)}\n`)
  }
  const modules = async (tree: readonly ContentModule[]): Promise<ContentModule[]> => {
    const result: ContentModule[] = []
    for (const module of tree) {
      const widgetData = widgets.get(module.id)
      const externalSource = module.widget?.source !== undefined && !ids.has(module.widget.source.cardId)
      const sourceScope = module.widget?.source === undefined || externalSource ? emptyIds
        : widgets.get(module.widget.source.moduleId)?.ids ?? emptyIds
      const blocks = []
      for (const block of module.blocks) {
        blocks.push(block.kind === 'text' ? {
          ...block, id: mapped(block.id),
          content: widgetData?.ref === block.content
            ? await structured(block.content, widgetData.data, widgetData.ids)
            : await text(block.content),
        } : {
          ...block, id: mapped(block.id), resourceId: mapped(block.resourceId),
          ...(block.caption === undefined ? {} : { caption: await text(block.caption) }),
        })
      }
      result.push({
        ...module, id: mapped(module.id), blocks,
        characterIds: module.characterIds.map(mapped),
        children: await modules(module.children),
        ...(module.widget === undefined ? {} : { widget: {
          ...structuredClone(module.widget),
          ...(module.widget.source === undefined ? {} : {
            source: externalSource ? module.widget.source : {
              cardId: cardAddress(module.widget.source.cardId),
              moduleId: mapped(module.widget.source.moduleId),
            },
          }),
          ...(module.widget.filter === undefined ? {} : {
            filter: externalSource ? module.widget.filter : { characters: module.widget.filter.characters?.map(id => local(id, sourceScope)) },
          }),
          ...(module.widget.overrides === undefined ? {} : {
            overrides: externalSource ? module.widget.overrides : object(rewrite(module.widget.overrides, sourceScope)),
          }),
        } }),
      })
    }
    return result
  }
  const document = async (original: ContentDocument): Promise<ContentDocument> => {
    const resources = []
    for (const resource of original.resources) {
      resources.push({ ...resource, id: mapped(resource.id), content: await write(resource.content) })
    }
    const extensions: Record<string, string> = {}
    for (const [key, ref] of Object.entries(original.extensions)) {
      const layout = layouts.get(ref)
      extensions[key] = layout !== undefined
        ? await structured(ref, layout.data, layout.ids)
        : await write(ref)
    }
    const internalCharacters = []
    for (const character of original.internalCharacters) internalCharacters.push(await document(character))
    return {
      ...original, id: mapped(original.id), resources, extensions,
      modules: await modules(original.modules), internalCharacters,
      appearance: {
        ...original.appearance,
        ...(original.appearance.avatarResourceId === undefined ? {} : { avatarResourceId: mapped(original.appearance.avatarResourceId) }),
        ...(original.appearance.coverResourceId === undefined ? {} : { coverResourceId: mapped(original.appearance.coverResourceId) }),
        ...(original.appearance.logoResourceId === undefined ? {} : { logoResourceId: mapped(original.appearance.logoResourceId) }),
      },
    }
  }
  return document(source)
}
