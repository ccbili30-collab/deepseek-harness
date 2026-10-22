/**
 * /api/noven-cards — the card editor's HTTP face. GET hydrates one card's
 * effective document (draft when present, else head) with text payloads and
 * image refs resolved; POST applies the same EditorCommand set the tools use,
 * sourced HUMAN, then commits — plus draft commit/discard and card creation.
 * @module noven-cards/routes
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ledgerDir } from 'noven-ledger'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { emptyCardDocument, findTarget, mintId, type ContentDocument, type ContentModule } from './model.ts'
import { CardStore, DraftConflict, EditConflict, type CardDraft, type SavedCard } from './store.ts'
import { buildPresetDocument, loadPreset } from './presets.ts'
import { buildReferenceIndex } from './refs.ts'
import { applyAndCommit, type EditorCommand } from './editor.ts'
import { isModulePreset } from './module-presets.ts'
import { deleteCustomModule, listCustomModules, normalizeCustomModule, saveCustomModule } from './custom-modules.ts'
import { decodeCollection, decodeMap, decodeRelation, decodeScene, decodeTimeline } from './formats.ts'
import { buildExportPackage, importExchange, importForeignFile } from './exchange.ts'
import { appendDiagnostics } from './diagnostics.ts'
import { acceptProposal, proposalChanges, proposalPreview, rejectProposal } from './proposals.ts'
import { aiTrustOf, setAiTrust, type AiTrust } from './trust.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** Hard cap on one request — an import package dominates; editor ops stay far under it. */
const MAX_BODY_BYTES = 64 * 1024 * 1024

/** One session's workspace root; live headers first, persisted headers for dormant sessions. */
async function cwdForSession(ctx: Context, sessionId: SessionId): Promise<string | undefined> {
  const live = ctx.sessions.get(sessionId)?.header
  const stored = live === undefined
    ? await ctx.get('sessionPersistence')?.stat(sessionId)
    : undefined
  return (live ?? stored?.header)?.cwd
}

/** Workspace root for the card store: `session` maps to its cwd; `root` addresses a project directly. */
export async function rootFor(request: Request, ctx: Context): Promise<{ root: string } | Response> {
  const url = new URL(request.url)
  const session = url.searchParams.get('session') as SessionId | null
  const root = (session === null ? undefined : await cwdForSession(ctx, session))
    ?? url.searchParams.get('root') ?? undefined
  if (root === undefined || root.length === 0) {
    return new Response('unknown session', { status: 404, headers: JSON_HEADERS })
  }
  return { root }
}

/** Carry a moved card's manifest cardMeta entry to the target project's ledger; a missing manifest or entry is a no-op. */
async function transferCardMeta(srcRoot: string, dstRoot: string, cardId: string): Promise<void> {
  const manifestPath = async (root: string): Promise<string> => join(await ledgerDir(root), 'library.json')
  const readManifest = async (root: string): Promise<Record<string, unknown> | undefined> => {
    try { return JSON.parse(await readFile(await manifestPath(root), 'utf8')) as Record<string, unknown> } catch { return undefined }
  }
  const writeManifest = async (root: string, lib: Record<string, unknown>): Promise<void> => {
    const path = await manifestPath(root)
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.noven-tmp`
    await writeFile(tmp, `${JSON.stringify(lib, null, 2)}\n`)
    await rename(tmp, path)
  }
  const src = await readManifest(srcRoot)
  const meta = (src?.cardMeta as Record<string, unknown> | undefined)?.[cardId]
  if (src === undefined || meta === undefined) return
  const srcMeta = { ...(src.cardMeta as Record<string, unknown>) }
  delete srcMeta[cardId]
  await writeManifest(srcRoot, { ...src, cardMeta: srcMeta, revision: (typeof src.revision === 'number' ? src.revision : 0) + 1 })
  const dst = await readManifest(dstRoot) ?? { version: 1, revision: 0, works: [], cardMeta: {}, ignored: [] }
  await writeManifest(dstRoot, {
    ...dst,
    cardMeta: { ...(dst.cardMeta as Record<string, unknown> | undefined ?? {}), [cardId]: meta },
    revision: (typeof dst.revision === 'number' ? dst.revision : 0) + 1,
  })
}

interface HydratedBlock {
  readonly kind: 'text' | 'image'
  readonly id: string
  readonly text?: string
  /** Text block's content ref: send it back as `expectedContent` so a write only conflicts if this block changed meanwhile. */
  readonly ref?: string
  readonly resourceId?: string
  readonly caption?: string
}

interface HydratedModule {
  readonly id: string
  readonly name: string
  readonly blocks: readonly HydratedBlock[]
  readonly children: readonly HydratedModule[]
  /** Characters placed inside this module, in placement order. */
  readonly characterIds: readonly string[]
  readonly layout: string
  /** 预制模块：type 决定渲染器；data 是首个文字块 JSON 按类型解码后的结构。 */
  readonly widget?: {
    readonly type: string
    readonly height?: number
    readonly data?: unknown
    readonly source?: { readonly cardId: string, readonly moduleId: string }
    readonly view?: string
    readonly filter?: { readonly characters?: readonly string[] }
    readonly overrides?: Record<string, unknown>
    readonly mapStage?: 'blank' | 'terrain' | 'world'
    readonly mapSummary?: Record<string, unknown>
    readonly mapTerrainSummary?: Record<string, unknown>
    readonly snapshot?: { readonly cardName: string, readonly moduleName: string, readonly widget: { readonly type: string, readonly data?: unknown }, readonly resources?: Record<string, { readonly base64: string, readonly mediaType: string }> }
  }
  /** Options round-trip fields: `module_options` rewrites them wholesale, so the client must echo the current values back. */
  readonly tags: readonly string[]
  readonly use?: ContentModule['use']
  readonly routing?: ContentModule['routing']
  readonly temporality?: ContentModule['temporality']
}

/** 预制模块的解码表：widget.type → 首个文字块 JSON 的结构化解码器。 */
const WIDGET_DECODERS: Record<string, (raw: string | undefined) => unknown> = {
  timeline: decodeTimeline,
  collection: decodeCollection,
  map: decodeMap,
  relation: decodeRelation,
  scene: decodeScene,
}

/** Resolve one module tree's text payloads and captions to plain text. */
async function hydrateModules(store: CardStore, cardId: string, modules: readonly ContentModule[]): Promise<HydratedModule[]> {
  const text = async (ref: string): Promise<string> => new TextDecoder().decode(await store.readPayload(cardId, ref))
  const walk = async (module: ContentModule): Promise<HydratedModule> => {
    const blocks = await Promise.all(module.blocks.map(async (block): Promise<HydratedBlock> => block.kind === 'text'
      ? { kind: 'text', id: block.id, text: await text(block.content), ref: block.content }
      : { kind: 'image', id: block.id, resourceId: block.resourceId, ...(block.caption !== undefined ? { caption: await text(block.caption) } : {}), ...(block.width === undefined ? {} : { width: block.width }) }))
    const decode = module.widget === undefined ? undefined : WIDGET_DECODERS[module.widget.type]
    return {
      id: module.id,
      name: module.name,
      blocks,
      children: await Promise.all(module.children.map(walk)),
      characterIds: [...module.characterIds],
      layout: module.layout,
      ...(module.widget !== undefined ? {
        widget: {
          type: module.widget.type,
          ...(module.widget.height !== undefined ? { height: module.widget.height } : {}),
          ...(module.widget.path !== undefined ? { path: module.widget.path } : {}),
          ...(module.widget.source !== undefined ? { source: module.widget.source } : {}),
          ...(module.widget.view !== undefined ? { view: module.widget.view } : {}),
          ...(module.widget.filter !== undefined ? { filter: module.widget.filter } : {}),
          ...(module.widget.overrides !== undefined ? { overrides: module.widget.overrides } : {}),
          ...(module.widget.mapStage !== undefined ? { mapStage: module.widget.mapStage } : {}),
          ...(module.widget.mapSummary !== undefined ? { mapSummary: module.widget.mapSummary } : {}),
          ...(module.widget.mapTerrainSummary !== undefined ? { mapTerrainSummary: module.widget.mapTerrainSummary } : {}),
          ...(module.widget.snapshot !== undefined ? { snapshot: module.widget.snapshot } : {}),
          ...(decode !== undefined ? { data: decode(blocks.find(b => b.kind === 'text')?.text) } : {}),
        },
      } : {}),
      tags: [...module.tags],
      ...(module.use !== undefined ? { use: module.use } : {}),
      ...(module.routing !== undefined ? { routing: module.routing } : {}),
      ...(module.temporality !== undefined ? { temporality: module.temporality } : {}),
    }
  }
  return Promise.all(modules.map(walk))
}

interface HydratedDocument {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly modules: readonly HydratedModule[]
  readonly avatarResourceId: string | null
  readonly coverResourceId: string | null
  readonly readingLayout: string
}

/** Appearance fields one hydrated document carries; internal characters keep their own. */
function appearanceOf(document: ContentDocument): Pick<HydratedDocument, 'avatarResourceId' | 'coverResourceId' | 'readingLayout'> {
  return {
    avatarResourceId: document.appearance.avatarResourceId ?? null,
    coverResourceId: document.appearance.coverResourceId ?? null,
    readingLayout: document.appearance.readingLayout,
  }
}

/** Hydrate a document plus its internal characters against the root card's store. */
async function hydrateDocument(store: CardStore, cardId: string, document: ContentDocument): Promise<HydratedDocument & { characters: HydratedDocument[] }> {
  return {
    id: document.id,
    kind: document.kind,
    name: document.name,
    modules: await hydrateModules(store, cardId, document.modules),
    ...appearanceOf(document),
    characters: await Promise.all(document.internalCharacters.map(async c => ({
      id: c.id, kind: c.kind, name: c.name, modules: await hydrateModules(store, cardId, c.modules), ...appearanceOf(c),
    }))),
  }
}

/** GET payload: the editable state — effective document, edit version, draft flag, pending AI proposal. */
async function cardPayload(store: CardStore, root: string, cardId: string, preview: boolean): Promise<Record<string, unknown> | Response> {
  const head = await store.open(cardId)
  if (head === undefined) return new Response('unknown card', { status: 404, headers: JSON_HEADERS })
  const draft: CardDraft | undefined = await store.draft(cardId)
  const proposal = await store.proposal(cardId)
  const undo = await store.undoState(cardId)
  const effective = preview && proposal !== undefined
    ? { ...head, document: proposalPreview((draft ?? head).document, proposal) }
    : (draft ?? head)
  return {
    cardId,
    dir: await store.dirName(cardId),
    revision: head.revision,
    version: effective.version,
    hasDraft: draft !== undefined,
    draftSource: draft?.source ?? null,
    canUndo: (undo?.at ?? head.revision) > 1,
    canRedo: (undo?.redo.length ?? 0) > 0,
    document: await hydrateDocument(store, cardId, effective.document),
    resources: effective.document.resources.map(r => ({ id: r.id, ref: r.content, mediaType: r.mediaType })),
    coverResourceId: effective.document.appearance.coverResourceId ?? null,
    hasProposal: proposal !== undefined,
    proposal: proposal === undefined ? null : { pending: true, baseRevision: proposal.baseRevision, changes: proposalChanges(head.document, proposal) },
    aiTrust: await aiTrustOf(root, cardId),
  }
}

/**
 * `GET ?card=<id>&since=<rev>` 的轮询报告（契约 C8）：自某修订后变化的
 * 模块编号。提案不写修订号，所以把提案摘要一并回——客户端把
 * `proposalStamp` 也算进「有没有变」。
 */
async function revisionReport(store: CardStore, cardId: string, since: number): Promise<Record<string, unknown> | Response> {
  const head = await store.open(cardId)
  if (head === undefined) return new Response('unknown card', { status: 404, headers: JSON_HEADERS })
  const proposal = await store.proposal(cardId)
  const proposalStamp = proposal === undefined ? null : createHash('sha256').update(JSON.stringify(proposal)).digest('hex').slice(0, 12)
  if (since >= head.revision && proposalStamp === null) {
    return { revision: head.revision, changed: [], added: [], removed: [], cardChanged: false, hasProposal: false, proposalStamp }
  }
  const base = Number.isFinite(since) && since > 0 ? await store.revisionSnapshot(cardId, since) : undefined
  if (base === undefined || since >= head.revision) {
    return { revision: head.revision, changed: [], added: [], removed: [], cardChanged: false, full: since < head.revision, hasProposal: proposal !== undefined, proposalStamp }
  }
  const flat = (doc: ContentDocument): Map<string, string> => {
    const map = new Map<string, string>()
    const walk = (modules: readonly ContentModule[]): void => {
      for (const module of modules) {
        map.set(module.id, JSON.stringify(module))
        walk(module.children)
      }
    }
    walk(doc.modules)
    for (const character of doc.internalCharacters) {
      map.set(character.id, JSON.stringify({ name: character.name, appearance: character.appearance, extensions: character.extensions }))
      walk(character.modules)
    }
    return map
  }
  const now = flat(head.document)
  const was = flat(base.document)
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const [id, raw] of now) {
    if (!was.has(id)) added.push(id)
    else if (was.get(id) !== raw) changed.push(id)
  }
  for (const id of was.keys()) if (!now.has(id)) removed.push(id)
  const surface = (doc: ContentDocument) => JSON.stringify({ name: doc.name, appearance: doc.appearance, extensions: doc.extensions, characters: doc.internalCharacters.map(c => c.id) })
  return {
    revision: head.revision, since,
    changed, added, removed,
    cardChanged: surface(head.document) !== surface(base.document),
    hasProposal: proposal !== undefined,
    proposalStamp,
  }
}

/** Count every module in a stored module tree. */
function countModules(modules: readonly { children?: readonly unknown[] }[]): number {
  let n = 0
  for (const m of modules) n += 1 + countModules((m.children ?? []) as readonly { children?: readonly unknown[] }[])
  return n
}

/** Strip markdown syntax and collapse whitespace for the tile excerpt. */
function scrubExcerpt(text: string): string {
  return text.replace(/[#>*`\-|[\]()!]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}

/** The catalog row for one card in a project root — what the 创作库/卡格子 grids render. */
async function cardRow(store: CardStore, cardId: string): Promise<Record<string, unknown> | undefined> {
  const head = await store.open(cardId).catch(() => undefined)
  if (head === undefined) return undefined
  const doc = head.document
  const coverId = doc.appearance.coverResourceId
  // The coverless tile borrows the card's first non-empty text page.
  const candidates: { module: string; ref: string }[] = []
  const collect = (mods: readonly ContentModule[]): void => {
    for (const m of mods) {
      for (const b of m.blocks) if (b.kind === 'text') candidates.push({ module: m.name, ref: b.content })
      collect(m.children)
    }
  }
  collect(doc.modules)
  let excerpt: { module: string; text: string } | undefined
  for (const found of candidates.slice(0, 8)) {
    const text = scrubExcerpt(new TextDecoder().decode(await store.readPayload(cardId, found.ref).catch(() => new Uint8Array())))
    if (text === '') continue
    excerpt = { module: found.module, text }
    break
  }
  return {
    cardId,
    name: doc.name,
    kind: doc.kind,
    dir: await store.dirName(cardId),
    modules: countModules(doc.modules),
    revision: head.revision,
    coverRef: coverId === undefined ? undefined : doc.resources.find(r => r.id === coverId)?.content,
    hasDraft: (await store.draft(cardId)) !== undefined,
    excerpt,
  }
}

/** List every live card in the store — `GET` without a `card` parameter. */
async function cardList(store: CardStore): Promise<Record<string, unknown>[]> {
  const rows = await Promise.all((await store.list()).map(id => cardRow(store, id)))
  return rows.filter((r): r is Record<string, unknown> => r !== undefined)
}

/** EditorCommand kinds the UI may send; byte-carrying commands stay tool-only. */
const APPLY_COMMANDS = new Set([
  'add_module', 'add_module_ref', 'add_module_custom', 'rename_module', 'rename_card', 'write_text', 'write_markdown', 'write_caption',
  'move_module', 'place_module', 'copy_module', 'merge_child', 'set_module_layout', 'set_reading_layout', 'move_block',
  'remove_module', 'remove_block', 'module_options', 'appearance', 'insert_owned_image',
  'replace_block_image', 'remove_resource', 'place_character', 'add_character', 'remove_character',
  'set_widget_data',
  'timeline_set_calendar', 'timeline_set_window', 'timeline_switch_view', 'timeline_add_event', 'timeline_update_event', 'timeline_move_event', 'timeline_remove_event',
  'timeline_add_era', 'timeline_update_era', 'timeline_remove_era',
  'timeline_add_mark', 'timeline_update_mark', 'timeline_remove_mark',
  'collection_add_field', 'collection_update_field', 'collection_remove_field',
  'collection_add_item', 'collection_update_item', 'collection_remove_item', 'collection_move_item', 'collection_set_value', 'collection_set_view',
  'collection_set_item_image',
  'collection_set_style',
  'embed_file',
  'set_layout',
  'surface_set_state',
  'map_spawn_view', 'map_add_marker', 'write_map_document', 'request_map_generation', 'request_map_edit',
  'request_map_compose', 'request_map_paint', 'record_map_terrain', 'request_map_human',
])

/** Reject malformed commands before applyEdit interprets them. */
function validateCommand(command: Record<string, unknown>): string | undefined {
  const kind = String(command.kind ?? '')
  if (!APPLY_COMMANDS.has(kind)) return `unsupported command: ${kind}`
  const needs = (fields: readonly string[]): string | undefined =>
    fields.some(f => typeof command[f] !== 'string') ? `missing field for ${kind}` : undefined
  switch (kind) {
    case 'write_map_document': {
      const invalid = needs(['moduleId', 'text'])
      if (invalid !== undefined) return invalid
      if (command.text === '') return 'empty map document'
      if (command.stage !== undefined && command.stage !== 'terrain' && command.stage !== 'world') return 'invalid map stage'
      if (command.summary !== undefined && (typeof command.summary !== 'object' || command.summary === null || Array.isArray(command.summary))) return 'invalid map summary'
      return undefined
    }
    case 'request_map_generation': {
      const invalid = needs(['moduleId'])
      if (invalid !== undefined) return invalid
      return typeof command.request !== 'object' || command.request === null ? 'missing request' : undefined
    }
    case 'request_map_edit': {
      const invalid = needs(['moduleId'])
      if (invalid !== undefined) return invalid
      if (!Array.isArray(command.operations) || command.operations.length === 0) return 'missing operations'
      if (command.operations.some(item => typeof item !== 'object' || item === null || Array.isArray(item))) return 'invalid operation'
      return undefined
    }
    case 'request_map_compose': {
      const invalid = needs(['moduleId'])
      if (invalid !== undefined) return invalid
      if (typeof command.spec !== 'object' || command.spec === null || Array.isArray(command.spec)) return 'missing terrain spec'
      return undefined
    }
    case 'request_map_paint': {
      const invalid = needs(['moduleId'])
      if (invalid !== undefined) return invalid
      if (!Array.isArray(command.operations) || command.operations.length === 0) return 'missing terrain operations'
      if (command.operations.some(item => typeof item !== 'object' || item === null || Array.isArray(item) || typeof (item as Record<string, unknown>).op !== 'string')) return 'invalid terrain operation'
      return undefined
    }
    case 'request_map_human': return needs(['moduleId'])
    case 'record_map_terrain': {
      const invalid = needs(['moduleId'])
      if (invalid !== undefined) return invalid
      if (typeof command.summary !== 'object' || command.summary === null || Array.isArray(command.summary)) return 'missing terrain summary'
      return undefined
    }
    case 'add_module_custom': {
      const invalid = needs(['name'])
      if (invalid !== undefined) return invalid
      if (!('definition' in command)) return 'missing definition'
      const normalized = normalizeCustomModule(command.definition)
      return typeof normalized === 'string' ? normalized : undefined
    }
    case 'add_module_ref': {
      const invalid = needs(['name', 'sourceCardId', 'sourceModuleId'])
      if (invalid !== undefined) return invalid
      if (command.view !== undefined && typeof command.view !== 'string') return 'invalid view'
      if (command.filter !== undefined && (typeof command.filter !== 'object' || command.filter === null)) return 'invalid filter'
      return undefined
    }
    case 'add_module': {
      const invalid = needs(['name'])
      if (invalid !== undefined) return invalid
      if (command.preset !== undefined && (typeof command.preset !== 'string' || !isModulePreset(command.preset))) return 'invalid preset'
      return undefined
    }
    case 'rename_card': case 'add_character': return needs(['name'])
    case 'rename_module': case 'set_module_layout': case 'move_module': case 'remove_module': return needs(['moduleId'])
    case 'place_module': case 'copy_module': case 'merge_child': return needs(['moduleId'])
    case 'write_text': return needs(['moduleId', 'moduleName', 'text'])
    case 'write_markdown': return needs(['moduleId', 'name', 'text'])
    case 'write_caption': return needs(['moduleId', 'blockId', 'moduleName', 'text'])
    case 'move_block': case 'remove_block': case 'replace_block_image': return needs(['moduleId', 'blockId'])
    case 'insert_owned_image': return needs(['moduleId', 'resourceId'])
    case 'place_character': case 'remove_character': return needs(['characterId'])
    case 'appearance': return 'resourceId' in command ? undefined : 'missing resourceId'
    case 'remove_resource': return needs(['resourceId'])
    case 'set_reading_layout': return needs(['layout'])
    case 'module_options': return needs(['moduleId'])
    case 'set_widget_data': return needs(['moduleId', 'widget']) ?? ('data' in command ? undefined : 'missing data')
    case 'map_add_marker': return needs(['moduleId']) ?? ('marker' in command ? undefined : 'missing marker')
    case 'map_spawn_view': return needs(['moduleId'])
    case 'timeline_set_calendar': return needs(['moduleId']) ?? ('calendar' in command ? undefined : 'missing calendar')
    case 'timeline_set_window': return needs(['moduleId']) ?? ('window' in command ? undefined : 'missing window')
    case 'timeline_switch_view': return needs(['moduleId', 'name'])
    case 'timeline_add_event': return needs(['moduleId']) ?? ('event' in command ? undefined : 'missing event')
    case 'timeline_update_event': case 'timeline_remove_event':
    case 'timeline_update_era': case 'timeline_remove_era': return needs(['moduleId', 'id'])
    case 'timeline_move_event': return needs(['moduleId', 'id'])
    case 'timeline_add_era': return needs(['moduleId']) ?? ('era' in command ? undefined : 'missing era')
    case 'timeline_add_mark': return needs(['moduleId']) ?? ('mark' in command ? undefined : 'missing mark')
    case 'timeline_update_mark': case 'timeline_remove_mark': return needs(['moduleId', 'id'])
    case 'collection_add_field': return needs(['moduleId']) ?? ('field' in command ? undefined : 'missing field')
    case 'collection_update_field': case 'collection_remove_field': case 'collection_move_field':
    case 'collection_update_item': case 'collection_remove_item': case 'collection_move_item': return needs(['moduleId', 'id'])
    case 'collection_add_item': return needs(['moduleId']) ?? ('item' in command ? undefined : 'missing item')
    case 'collection_set_value': return needs(['moduleId', 'itemId', 'fieldId'])
    case 'collection_set_item_image':
      return needs(['moduleId', 'itemId'])
        ?? (typeof command.resourceId === 'string' || (typeof command.imageBase64 === 'string' && typeof command.mediaType === 'string') ? undefined : 'missing image')
    case 'collection_set_view': return needs(['moduleId', 'view'])
    case 'embed_file': return needs(['path'])
    case 'surface_init': return needs(['moduleId'])
    case 'surface_write_file': return needs(['moduleId', 'path']) ?? ('text' in command ? undefined : 'missing text')
    case 'surface_delete_file': return needs(['moduleId', 'path'])
    case 'surface_rename_file': return needs(['moduleId']) ?? ('from' in command && 'to' in command ? undefined : 'missing from/to')
    case 'surface_set_manifest': return needs(['moduleId']) ?? ('manifest' in command ? undefined : 'missing manifest')
    case 'surface_set_state':
      return needs(['moduleId'])
        ?? ('state' in command ? undefined : 'missing state')
        ?? (command.expectedVersion === undefined
          || (typeof command.expectedVersion === 'number' && Number.isInteger(command.expectedVersion) && command.expectedVersion >= 0)
          ? undefined
          : 'invalid expectedVersion')
    case 'collection_set_style': return needs(['moduleId', 'artStyle'])
    case 'set_layout': return needs(['layoutKey']) ?? ('layout' in command ? undefined : 'missing layout')
    default: return undefined
  }
}

async function serve(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  const url = new URL(request.url)
  const store = new CardStore(resolved.root)

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (url.searchParams.get('modules') === '1') {
      const modules = await listCustomModules(resolved.root)
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ modules }), { headers: JSON_HEADERS })
    }
    if (url.searchParams.get('refs') === '1') {
      const index = await buildReferenceIndex(store)
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(index), { headers: JSON_HEADERS })
    }
    const cardId = url.searchParams.get('card')
    if (cardId === null || cardId === '') {
      const rows = await cardList(store)
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ cards: rows }), { headers: JSON_HEADERS })
    }
    const mapRequestModule = url.searchParams.get('mapRequest')
    if (mapRequestModule !== null && mapRequestModule !== '') {
      const head = await store.open(cardId)
      if (head === undefined) return new Response('card not found', { status: 404, headers: JSON_HEADERS })
      const findModule = (modules: readonly ContentModule[]): ContentModule | undefined => {
        for (const module of modules) {
          if (module.id === mapRequestModule) return module
          const child = findModule(module.children)
          if (child !== undefined) return child
        }
        return undefined
      }
      const module = findModule(head.document.modules)
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({
        revision: head.revision,
        request: module?.widget?.type === 'map' ? module.widget.request ?? null : null,
      }), { headers: JSON_HEADERS })
    }
    const since = url.searchParams.get('since')
    if (since !== null) {
      const report = await revisionReport(store, cardId, Number(since))
      if (report instanceof Response) return report
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(report), { headers: JSON_HEADERS })
    }
    const payload = await cardPayload(store, resolved.root, cardId, url.searchParams.get('preview') === '1')
    if (payload instanceof Response) return payload
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), { headers: JSON_HEADERS })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return new Response('card payload too large', { status: 413, headers: JSON_HEADERS })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
  }
  const bad = (text: string) => new Response(text, { status: 400, headers: JSON_HEADERS })
  const cardId = String(body.cardId ?? '')

  try {
    switch (String(body.op ?? '')) {
      case 'diagnostics': {
        const moduleId = String(body.moduleId ?? '')
        if (cardId === '' || moduleId === '') return bad('missing cardId/moduleId')
        const entries = Array.isArray(body.entries) ? body.entries : []
        const stored = await appendDiagnostics(resolved.root, cardId, moduleId, entries)
        return new Response(JSON.stringify({ ok: true, entries: stored.entries.length, updated_at: stored.updatedAt }), { headers: JSON_HEADERS })
      }
      case 'create': {
        const kind = String(body.kind ?? '')
        const name = String(body.name ?? '').trim()
        const starter = String(body.starter ?? 'blank')
        if (kind !== 'WORLD' && kind !== 'CHARACTER') return bad('invalid kind')
        if (name.length === 0) return bad('missing name')
        if (!['blank', 'interview'].includes(starter) && !starter.startsWith('template:')) return bad('invalid starter')
        if (starter.startsWith('template:')) {
          // 预设是数据文件（presets/<id>.json）：落树、种样例、集合列就绪。
          const preset = await loadPreset(starter.slice('template:'.length))
          if (preset === undefined || preset.kind !== kind) return bad('invalid template')
          const cardName = name.length > 0 ? name : (preset.defaultName ?? name)
          let focusModuleId: string | undefined
          const saved: SavedCard = await store.create(cardName, 'HUMAN', async receive => {
            const built = await buildPresetDocument(preset, cardName, {
              writeText: text => receive(new TextEncoder().encode(text)),
              writePayload: bytes => receive(bytes),
            })
            focusModuleId = built.focusModuleId
            return built.document
          })
          return new Response(JSON.stringify({
            ok: true, cardId: saved.cardId, revision: saved.revision, starter,
            ...(focusModuleId === undefined ? {} : { focusModuleId }),
          }), { headers: JSON_HEADERS })
        }
        const document = emptyCardDocument(kind, name)
        if (kind === 'WORLD') {
          // 契约 C7：世界卡的 blank/interview 起手带一个「设定总览」模块——
          // widget.type='overview' 标它是卡的聚合页（重命名不失效）；角色卡保持空卡（Q4）。
          document.modules.push({ id: mintId(), name: '设定总览', tags: [], children: [], layout: 'VERTICAL', characterIds: [], blocks: [], widget: { type: 'overview' } })
        }
        const saved: SavedCard = await store.saveNew(document, 'HUMAN')
        return new Response(JSON.stringify({
          ok: true, cardId: saved.cardId, revision: saved.revision, starter,
          ...(starter === 'interview' ? { interview: true } : {}),
        }), { headers: JSON_HEADERS })
      }
      case 'save_user_module': {
        const saved = await saveCustomModule(resolved.root, body.definition)
        if (typeof saved === 'string') return bad(saved)
        return new Response(JSON.stringify({ ok: true, module: saved }), { headers: JSON_HEADERS })
      }
      case 'delete_user_module': {
        const id = String(body.id ?? '')
        if (id === '') return bad('missing id')
        await deleteCustomModule(resolved.root, id)
        return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
      }
      case 'apply': {
        const raw = body.command
        if (typeof raw !== 'object' || raw === null) return bad('missing command')
        const command = { ...(raw as Record<string, unknown>) }
        const invalid = validateCommand(command)
        if (invalid !== undefined) return bad(invalid)
        if (command.kind === 'collection_set_item_image' && typeof command.imageBase64 === 'string' && typeof command.mediaType === 'string') {
          command.bytes = new Uint8Array(Buffer.from(command.imageBase64, 'base64'))
          delete command.imageBase64
        }
        const { outcome, saved } = await applyAndCommit(store, cardId, String(body.targetId ?? cardId), command as unknown as EditorCommand, 'HUMAN')
        return new Response(JSON.stringify({
          ok: true, revision: saved.revision, version: saved.version,
          createdModuleIds: outcome.createdModuleIds, createdBlockIds: outcome.createdBlockIds,
        }), { headers: JSON_HEADERS })
      }
      case 'undo': {
        const saved = await store.undo(cardId)
        if (saved === undefined) return bad('nothing to undo')
        return new Response(JSON.stringify({ ok: true, revision: saved.revision, version: saved.version }), { headers: JSON_HEADERS })
      }
      case 'redo': {
        const saved = await store.redo(cardId)
        if (saved === undefined) return bad('nothing to redo')
        return new Response(JSON.stringify({ ok: true, revision: saved.revision, version: saved.version }), { headers: JSON_HEADERS })
      }
      case 'commit': {
        const saved = await store.commit(cardId, String(body.version ?? ''))
        return new Response(JSON.stringify({ ok: true, revision: saved.revision, version: saved.version }), { headers: JSON_HEADERS })
      }
      case 'import': {
        const encoded = String(body.file ?? '')
        const fileName = String(body.name ?? '导入卡')
        if (encoded.length === 0) return bad('missing file')
        const bytes = new Uint8Array(Buffer.from(encoded, 'base64'))
        const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
        const imported = isZip
          ? await importExchange(store, bytes)
          : await importForeignFile(store, bytes, fileName)
        const saved = await store.commit(imported.cardId, imported.version)
        return new Response(JSON.stringify({ ok: true, cardId: imported.cardId, revision: saved.revision, name: imported.name }), { headers: JSON_HEADERS })
      }
      case 'move': {
        if (cardId.length === 0) return bad('missing cardId')
        const targetSession = String(body.targetSession ?? '') as SessionId
        const targetRoot = (targetSession.length > 0 ? await cwdForSession(ctx, targetSession) : undefined)
          ?? (String(body.targetRoot ?? '') || undefined)
        if (targetRoot === undefined) return bad('unknown target')
        await store.moveTo(cardId, targetRoot)
        await transferCardMeta(resolved.root, targetRoot, cardId)
        return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
      }
      case 'discard': {
        await store.discardDraft(cardId)
        const head = await store.open(cardId)
        return new Response(JSON.stringify({ ok: true, revision: head?.revision ?? 0 }), { headers: JSON_HEADERS })
      }
      // ---------- AI 提案 ----------
      case 'diff': {
        if (cardId.length === 0) return bad('missing cardId')
        const head = await store.open(cardId)
        const proposal = await store.proposal(cardId)
        if (head === undefined || proposal === undefined) {
          return new Response(JSON.stringify({ pending: false, changes: [] }), { headers: JSON_HEADERS })
        }
        return new Response(JSON.stringify({ pending: true, source: proposal.source, baseRevision: proposal.baseRevision, changes: proposalChanges(head.document, proposal) }), { headers: JSON_HEADERS })
      }
      case 'accept': {
        if (cardId.length === 0) return bad('missing cardId')
        const moduleIds = Array.isArray(body.moduleIds) ? body.moduleIds.map(String) : undefined
        const saved = await acceptProposal(store, cardId, moduleIds)
        return new Response(JSON.stringify({ ok: true, revision: saved.revision, version: saved.version }), { headers: JSON_HEADERS })
      }
      case 'reject': {
        if (cardId.length === 0) return bad('missing cardId')
        const moduleIds = Array.isArray(body.moduleIds) ? body.moduleIds.map(String) : undefined
        await rejectProposal(store, cardId, moduleIds)
        const head = await store.open(cardId)
        return new Response(JSON.stringify({ ok: true, revision: head?.revision ?? 0 }), { headers: JSON_HEADERS })
      }
      case 'trust': {
        if (cardId.length === 0) return bad('missing cardId')
        const mode = String(body.mode ?? '') as AiTrust
        if (mode !== 'propose' && mode !== 'auto') return bad('mode 必须是 propose 或 auto')
        await setAiTrust(resolved.root, cardId, mode)
        return new Response(JSON.stringify({ ok: true, aiTrust: mode }), { headers: JSON_HEADERS })
      }
      case 'delete': {
        if (cardId.length === 0) return bad('missing cardId')
        await store.delete(cardId)
        return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
      }
      case 'restore': {
        if (cardId.length === 0) return bad('missing cardId')
        if (!await store.restore(cardId)) return new Response(JSON.stringify({ error: 'not deleted' }), { status: 404, headers: JSON_HEADERS })
        return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
      }
      case 'export': {
        const built = await buildExportPackage(store, cardId)
        const filename = encodeURIComponent(`${built.name}.novex.zip`)
        return new Response(built.bytes.slice().buffer as ArrayBuffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
          },
        })
      }
      default:
        return bad(`unknown op: ${String(body.op ?? '')}`)
    }
  } catch (error: unknown) {
    if (error instanceof DraftConflict) {
      return new Response(JSON.stringify({ error: 'conflict', version: error.currentVersion }), { status: 409, headers: JSON_HEADERS })
    }
    if (error instanceof EditConflict) {
      return new Response(JSON.stringify({ error: 'conflict', scope: 'block', moduleId: error.moduleId, blockId: error.blockId, message: error.message }), { status: 409, headers: JSON_HEADERS })
    }
    if (error instanceof Error && error.message.includes('跨项目引用默认禁止')) {
      return new Response(error.message, { status: 403, headers: JSON_HEADERS })
    }
    return new Response(error instanceof Error ? error.message : 'card op failed', { status: 500, headers: JSON_HEADERS })
  }
}

/** Register the card HTTP route against the connection's fetch registry. */
export function registerCardRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-cards',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serve(request, ctx),
  }), 'noven-cards: /api/noven-cards')
}
