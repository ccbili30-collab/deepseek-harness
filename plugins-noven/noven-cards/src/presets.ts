/**
 * Preset library: shipped card skeletons the create route instantiates.
 * A preset is data (`presets/<id>.json`): a module tree with optional child
 * modules, prose samples, field schemas for collection modules, and seed rows.
 * Instantiation mints fresh ids, writes prose as real blocks, seeds collection
 * rows (image cells become card resources), and seeds timeline events — so the
 * landed card opens as a browsable example, not a blank form.
 * @module noven-cards/presets
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { emptyCardDocument, mintId, type ContentBlock, type ContentDocument, type ContentModule } from './model.ts'
import {
  encodeCollection, encodeTimeline,
  type CollectionFieldType, type CollectionValue, type TimelineCalendar, type TimelineData, type TimelineEra, type TimelineEvent,
} from './formats.ts'

const PRESETS_DIR = fileURLToPath(new URL('../presets/', import.meta.url))

/** 集合模块里的一列；type 取编辑器已支持的集合字段类型。 */
export interface PresetField {
  readonly name: string
  readonly type: string
}

/** 预设里的一行样例数据：字段名 → 值；图片列用 `{ asset }` 指向预设资源。 */
export type PresetRow = Readonly<Record<string, string | number | boolean | { readonly asset: string }>>

/** 预设里的时间线样例：纪元与事件。 */
export interface PresetTimeline {
  readonly eras?: readonly {
    readonly name: string
    readonly from: number | null
    readonly to: number | null
    readonly color?: string
    readonly description?: string
  }[]
  readonly events?: readonly { readonly at: number, readonly title: string, readonly description?: string }[]
}

/** 预设里的一个模块节点；children 递归。 */
export interface PresetModuleNode {
  readonly name: string
  readonly widget?: string
  /** 正文模块的样例/引导文字（用户直接覆写）。 */
  readonly sample?: string
  /** 集合模块的列定义。 */
  readonly fields?: readonly PresetField[]
  /** 集合模块的样例行。 */
  readonly rows?: readonly PresetRow[]
  /** 集合模块的默认视图（list/cards/form/timeline/map）。 */
  readonly view?: string
  /** 时间线模块的样例纪元与事件。 */
  readonly timeline?: PresetTimeline
  /** 单模块预设：落卡后直接打开这个模块页。 */
  readonly focus?: boolean
  readonly children?: readonly PresetModuleNode[]
}

/** 一份随产品发行的预设。 */
export interface Preset {
  readonly id: string
  readonly kind: 'WORLD' | 'CHARACTER'
  readonly title: string
  readonly summary: string
  /** 落卡时的默认卡名（样例内容也是按这个名字写的）。 */
  readonly defaultName?: string
  readonly modules: readonly PresetModuleNode[]
}

/** 实例化预设时需要的两个写入口。 */
export interface PresetIo {
  /** 写一段正文，返回内容引用。 */
  readonly writeText: (text: string) => Promise<string>
  /** 写一份二进制载荷（样例图片），返回内容引用。 */
  readonly writePayload: (bytes: Uint8Array, mediaType: string) => Promise<string>
}

const FIELD_TYPES = new Set<string>(['text', 'longtext', 'date', 'person', 'image', 'place', 'link', 'number', 'time'])
const WIDGETS = new Set<string>(['overview', 'timeline', 'map', 'collection', 'relation', 'html'])
const COLLECTION_VIEWS = new Set<string>(['list', 'cards', 'form', 'timeline', 'map'])
const ERA_COLORS = new Set(['purple', 'blue', 'pink', 'green', 'amber', 'gray'])

const defaultCalendar: TimelineCalendar = {
  name: '', units: [{ name: '年', per: 1 }], cycles: [], epoch: 0, step: 1, format: '{n}', formatBefore: '前 {n}', unit: '年',
}

const cache = new Map<string, Preset>()

/**
 * Load one shipped preset by id.
 * @param id - preset id (also the `template:<id>` starter suffix).
 * @returns the parsed preset, or undefined when absent or malformed.
 */
export async function loadPreset(id: string): Promise<Preset | undefined> {
  const cached = cache.get(id)
  if (cached !== undefined) return cached
  let text: string
  try {
    text = await readFile(join(PRESETS_DIR, `${id}.json`), 'utf8')
  } catch {
    return undefined
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  const preset = normalizePreset(raw)
  if (preset !== undefined) cache.set(id, preset)
  return preset
}

/** Validate one parsed preset; invalid files are ignored rather than half-applied. */
function normalizePreset(raw: unknown): Preset | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.summary !== 'string') return undefined
  if (record.kind !== 'WORLD' && record.kind !== 'CHARACTER') return undefined
  if (record.defaultName !== undefined && typeof record.defaultName !== 'string') return undefined
  if (!Array.isArray(record.modules)) return undefined
  const modules = record.modules.map(normalizeNode)
  if (modules.some(node => node === undefined)) return undefined
  return {
    id: record.id, kind: record.kind, title: record.title, summary: record.summary,
    ...(record.defaultName === undefined ? {} : { defaultName: record.defaultName as string }),
    modules: modules as PresetModuleNode[],
  }
}

function normalizeNode(raw: unknown): PresetModuleNode | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name.length === 0) return undefined
  if (record.widget !== undefined && (typeof record.widget !== 'string' || !WIDGETS.has(record.widget))) return undefined
  if (record.sample !== undefined && typeof record.sample !== 'string') return undefined
  if (record.focus !== undefined && typeof record.focus !== 'boolean') return undefined
  if (record.view !== undefined && (typeof record.view !== 'string' || !COLLECTION_VIEWS.has(record.view))) return undefined
  const fields = record.fields === undefined ? undefined : (record.fields as unknown[]).map(field => {
    if (typeof field !== 'object' || field === null) return undefined
    const source = field as Record<string, unknown>
    if (typeof source.name !== 'string' || typeof source.type !== 'string' || !FIELD_TYPES.has(source.type)) return undefined
    return { name: source.name, type: source.type }
  })
  if (fields !== undefined && fields.some(field => field === undefined)) return undefined
  const rows = record.rows === undefined ? undefined : (record.rows as unknown[])
  if (rows !== undefined && rows.some(row => typeof row !== 'object' || row === null)) return undefined
  const timeline = record.timeline === undefined ? undefined : normalizeTimeline(record.timeline)
  if (record.timeline !== undefined && timeline === undefined) return undefined
  const children = record.children === undefined ? undefined : (record.children as unknown[]).map(normalizeNode)
  if (children !== undefined && children.some(node => node === undefined)) return undefined
  return {
    name: record.name,
    ...(record.widget === undefined ? {} : { widget: record.widget as string }),
    ...(record.sample === undefined ? {} : { sample: record.sample as string }),
    ...(fields === undefined ? {} : { fields: fields as PresetField[] }),
    ...(rows === undefined ? {} : { rows: rows as PresetRow[] }),
    ...(record.view === undefined ? {} : { view: record.view as string }),
    ...(timeline === undefined ? {} : { timeline }),
    ...(record.focus === undefined ? {} : { focus: record.focus as boolean }),
    ...(children === undefined ? {} : { children: children as PresetModuleNode[] }),
  }
}

function normalizeTimeline(raw: unknown): PresetTimeline | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const eras = record.eras === undefined ? undefined : (record.eras as unknown[]).map(era => {
    if (typeof era !== 'object' || era === null) return undefined
    const source = era as Record<string, unknown>
    if (typeof source.name !== 'string') return undefined
    const from = source.from === null ? null : Number(source.from)
    const to = source.to === null ? null : Number(source.to)
    if (from !== null && !Number.isFinite(from)) return undefined
    if (to !== null && !Number.isFinite(to)) return undefined
    return {
      name: source.name, from, to,
      ...(typeof source.color === 'string' && ERA_COLORS.has(source.color) ? { color: source.color } : {}),
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
    }
  })
  if (eras !== undefined && eras.some(era => era === undefined)) return undefined
  const events = record.events === undefined ? undefined : (record.events as unknown[]).map(event => {
    if (typeof event !== 'object' || event === null) return undefined
    const source = event as Record<string, unknown>
    if (typeof source.title !== 'string' || !Number.isFinite(Number(source.at))) return undefined
    return {
      at: Number(source.at), title: source.title,
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
    }
  })
  if (events !== undefined && events.some(event => event === undefined)) return undefined
  return { ...(eras === undefined ? {} : { eras: eras as NonNullable<PresetTimeline['eras']> }), ...(events === undefined ? {} : { events: events as NonNullable<PresetTimeline['events']> }) }
}

/**
 * Instantiate a preset into a card document.
 * @param preset - validated preset.
 * @param name - the new card's name.
 * @param io - text/payload writers supplied by the card store.
 * @returns the document plus the module to focus when the preset marks one.
 */
export async function buildPresetDocument(
  preset: Preset,
  name: string,
  io: PresetIo,
): Promise<{ document: ContentDocument, focusModuleId?: string }> {
  const document = emptyCardDocument(preset.kind, name)
  let focusModuleId: string | undefined
  const build = async (nodes: readonly PresetModuleNode[]): Promise<ContentModule[]> => {
    const out: ContentModule[] = []
    for (const node of nodes) {
      const module: ContentModule = {
        id: mintId(), name: node.name, tags: [], children: [], layout: 'VERTICAL', characterIds: [], blocks: [],
        ...(node.widget === undefined ? {} : { widget: { type: node.widget } }),
      }
      if (node.widget === 'collection') {
        const fields = (node.fields ?? []).map(field => ({ id: mintId(), name: field.name, type: field.type as CollectionFieldType }))
        const items: { id: string, name: string, summary: string, description: string, visualKey: string | null }[] = []
        const values: Record<string, Record<string, CollectionValue>> = {}
        for (const row of node.rows ?? []) {
          const itemId = mintId()
          const first = fields[0] === undefined ? '' : String(row[fields[0].name] ?? '')
          items.push({ id: itemId, name: first, summary: '', description: '', visualKey: null })
          const cells: Record<string, CollectionValue> = {}
          for (const field of fields) {
            const raw = row[field.name]
            if (raw === undefined) continue
            if (field.type === 'image') {
              if (typeof raw !== 'object' || raw === null || !('asset' in raw)) continue
              const asset = raw.asset
              const bytes = await readFile(join(PRESETS_DIR, asset))
              const mediaType = asset.endsWith('.png') ? 'image/png' : 'image/jpeg'
              const resourceId = mintId()
              document.resources.push({ id: resourceId, content: await io.writePayload(bytes, mediaType), mediaType })
              cells[field.id] = { resourceId }
              if (items[items.length - 1]?.visualKey === null) items[items.length - 1] = { ...items[items.length - 1], visualKey: resourceId }
              continue
            }
            cells[field.id] = raw as CollectionValue
          }
          if (Object.keys(cells).length > 0) values[itemId] = cells
        }
        const encoded = encodeCollection({ version: 2, fields, items, values, view: (node.view ?? 'list') as import('./formats.ts').CollectionView, artStyle: '' })
        module.blocks.push({ kind: 'text', id: mintId(), content: await io.writeText(encoded) })
      } else if (node.widget === 'timeline') {
        const data: TimelineData = {
          version: 2,
          calendar: defaultCalendar,
          views: [],
          eras: (node.timeline?.eras ?? []).map((era): TimelineEra => ({
            id: mintId(), name: era.name, from: era.from, to: era.to, color: era.color ?? 'blue', description: era.description ?? '',
          })),
          events: (node.timeline?.events ?? []).map((event): TimelineEvent => ({
            id: mintId(), at: event.at, until: null, title: event.title, description: event.description ?? '', characters: [],
          })),
          marks: [],
        }
        module.blocks.push({ kind: 'text', id: mintId(), content: await io.writeText(encodeTimeline(data)) })
      } else if (node.sample !== undefined) {
        module.blocks.push({ kind: 'text', id: mintId(), content: await io.writeText(node.sample) } as ContentBlock)
      }
      if (node.children !== undefined && node.children.length > 0) module.children = await build(node.children)
      if (node.focus === true) focusModuleId = module.id
      out.push(module)
    }
    return out
  }
  document.modules = await build(preset.modules)
  return { document, ...(focusModuleId === undefined ? {} : { focusModuleId }) }
}
