/**
 * Preset library: shipped card skeletons the create route instantiates.
 * A preset is data (`presets/<id>.json`): a module tree with optional child
 * modules, prose samples, field schemas for collection modules, and seed rows.
 * Instantiation mints fresh ids, writes prose as real blocks, seeds collection
 * rows (image cells become card resources), and seeds timeline events — so the
 * landed card opens as a browsable example, not a blank form.
 * @module noven-cards/presets
 */
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { emptyCardDocument, mintId, type ContentBlock, type ContentDocument, type ContentModule } from './model.ts'
import { contractFor } from './collection-contracts.ts'
import {
  encodeCollection, encodeRelation, encodeTimeline,
  type CollectionData, type CollectionFieldType, type CollectionValue, type TimelineCalendar, type TimelineData, type TimelineEra, type TimelineEvent,
} from './formats.ts'

const PRESETS_DIR = fileURLToPath(new URL('../presets/', import.meta.url))

/** 集合模块里的一列；type 取编辑器已支持的集合字段类型。 */
export interface PresetField {
  readonly name: string
  readonly type: string
}

/** 预设里的一行样例数据：字段名 → 值；图片列用 `{ asset }` 指向预设资源。 */
export type PresetRow = Readonly<Record<string, string | number | boolean | { readonly asset: string }>>

/** 预设里的关系图样例：按名字连边，落卡时换成真 id。 */
export interface PresetRelation {
  readonly nodes?: readonly { readonly name: string, readonly note?: string, readonly x?: number, readonly y?: number, readonly avatar?: string }[]
  readonly edges?: readonly { readonly from: string, readonly to: string, readonly label: string }[]
}

/** 预设里的地图样例：底图资源 + 标记点（归一化坐标）。 */
export interface PresetMap {
  readonly description?: string
  /** presets 下的底图相对路径（jpg/png）。 */
  readonly image?: string
  readonly markers?: readonly { readonly x: number, readonly y: number, readonly label: string, readonly description?: string }[]
}

/** 预设里的时间线样例：纪元与事件。 */
export interface PresetTimeline {
  /** 日历单位（角色日记用「岁」，世界史默认「年」）。 */
  readonly unit?: string
  /** 版式：横向年表或竖向日记。 */
  readonly view?: string
  readonly eras?: readonly {
    readonly name: string
    readonly from: number | null
    readonly to: number | null
    readonly color?: string
    readonly description?: string
  }[]
  readonly events?: readonly { readonly at: number, readonly title: string, readonly description?: string, readonly characters?: readonly string[] }[]
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
  /** 图鉴卡的图片比例（portrait/landscape/square）。 */
  readonly cardAspect?: string
  /** 记录编辑器标签（可存 i18n 键或字面文案）。 */
  readonly form?: { readonly labels?: { readonly primary?: string, readonly add?: string, readonly empty?: string } }
  /** 窗口契约 id；省略时按模块名解析。 */
  readonly contract?: string
  /** 直接引用：多形态 → 角色档案这类同卡/跨卡来源。 */
  readonly source?: { readonly cardId?: string, readonly moduleId?: string, readonly moduleName?: string, readonly itemId?: string, readonly label?: string }
  /** 时间线模块的样例纪元与事件。 */
  readonly timeline?: PresetTimeline
  /** 关系图模块的样例节点与连线。 */
  readonly relation?: PresetRelation
  /** 地图模块的样例底图与标记。 */
  readonly map?: PresetMap
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

const FIELD_TYPES = new Set<string>(['text', 'longtext', 'chips', 'date', 'person', 'image', 'place', 'link', 'number', 'time'])
const WIDGETS = new Set<string>(['overview', 'timeline', 'map', 'collection', 'relation', 'html'])
const COLLECTION_VIEWS = new Set<string>(['list', 'cards', 'form', 'timeline', 'map', 'profile', 'graph'])
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

/**
 * List every shipped preset. Malformed files are skipped, matching loadPreset.
 * @returns the valid presets in filename order.
 */
export async function listPresets(): Promise<readonly Preset[]> {
  let files: string[]
  try {
    files = await readdir(PRESETS_DIR)
  } catch {
    return []
  }
  const ids = files.filter(name => name.endsWith('.json')).map(name => name.slice(0, -'.json'.length)).sort()
  const presets = await Promise.all(ids.map(id => loadPreset(id)))
  return presets.filter((preset): preset is Preset => preset !== undefined)
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

function normalizeForm(raw: unknown): NonNullable<PresetModuleNode['form']> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const labelsRaw = record.labels
  if (labelsRaw === undefined) return {}
  if (typeof labelsRaw !== 'object' || labelsRaw === null) return undefined
  const labels = labelsRaw as Record<string, unknown>
  const primary = labels.primary
  const add = labels.add
  const empty = labels.empty
  if ((primary !== undefined && typeof primary !== 'string')
    || (add !== undefined && typeof add !== 'string')
    || (empty !== undefined && typeof empty !== 'string')) return undefined
  return { labels: { ...(primary === undefined ? {} : { primary }), ...(add === undefined ? {} : { add }), ...(empty === undefined ? {} : { empty }) } }
}

function normalizeSource(raw: unknown): NonNullable<PresetModuleNode['source']> | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const out: { cardId?: string, moduleId?: string, moduleName?: string, itemId?: string, label?: string } = {}
  for (const key of ['cardId', 'moduleId', 'moduleName', 'itemId', 'label'] as const) {
    const value = record[key]
    if (value !== undefined && typeof value !== 'string') return undefined
    if (typeof value === 'string' && value !== '') out[key] = value
  }
  return Object.keys(out).length === 0 ? undefined : out
}

function normalizeNode(raw: unknown): PresetModuleNode | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name.length === 0) return undefined
  if (record.widget !== undefined && (typeof record.widget !== 'string' || !WIDGETS.has(record.widget))) return undefined
  if (record.sample !== undefined && typeof record.sample !== 'string') return undefined
  if (record.focus !== undefined && typeof record.focus !== 'boolean') return undefined
  if (record.view !== undefined && (typeof record.view !== 'string' || !COLLECTION_VIEWS.has(record.view))) return undefined
  if (record.cardAspect !== undefined && !['portrait', 'landscape', 'square'].includes(String(record.cardAspect))) return undefined
  const form = record.form === undefined ? undefined : normalizeForm(record.form)
  if (record.form !== undefined && form === undefined) return undefined
  const source = record.source === undefined ? undefined : normalizeSource(record.source)
  if (record.source !== undefined && source === undefined) return undefined
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
  const relation = record.relation === undefined ? undefined : normalizeRelation(record.relation)
  if (record.relation !== undefined && relation === undefined) return undefined
  const map = record.map === undefined ? undefined : normalizeMap(record.map)
  if (record.map !== undefined && map === undefined) return undefined
  const children = record.children === undefined ? undefined : (record.children as unknown[]).map(normalizeNode)
  if (children !== undefined && children.some(node => node === undefined)) return undefined
  return {
    name: record.name,
    ...(record.widget === undefined ? {} : { widget: record.widget as string }),
    ...(record.sample === undefined ? {} : { sample: record.sample as string }),
    ...(fields === undefined ? {} : { fields: fields as PresetField[] }),
    ...(rows === undefined ? {} : { rows: rows as PresetRow[] }),
    ...(record.view === undefined ? {} : { view: record.view as string }),
    ...(record.cardAspect === undefined ? {} : { cardAspect: record.cardAspect as string }),
    ...(form === undefined ? {} : { form }),
    ...(source === undefined ? {} : { source }),
    ...(timeline === undefined ? {} : { timeline }),
    ...(relation === undefined ? {} : { relation }),
    ...(map === undefined ? {} : { map }),
    ...(record.focus === undefined ? {} : { focus: record.focus as boolean }),
    ...(children === undefined ? {} : { children: children as PresetModuleNode[] }),
  }
}

function normalizeRelation(raw: unknown): PresetRelation | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const nodes = record.nodes === undefined ? undefined : (record.nodes as unknown[]).map(node => {
    if (typeof node !== 'object' || node === null) return undefined
    const source = node as Record<string, unknown>
    if (typeof source.name !== 'string' || source.name.length === 0) return undefined
    return {
      name: source.name,
      ...(typeof source.note === 'string' ? { note: source.note } : {}),
      ...(typeof source.avatar === 'string' ? { avatar: source.avatar } : {}),
      ...(Number.isFinite(Number(source.x)) && source.x !== null ? { x: Number(source.x) } : {}),
      ...(Number.isFinite(Number(source.y)) && source.y !== null ? { y: Number(source.y) } : {}),
    }
  })
  if (nodes !== undefined && nodes.some(node => node === undefined)) return undefined
  const edges = record.edges === undefined ? undefined : (record.edges as unknown[]).map(edge => {
    if (typeof edge !== 'object' || edge === null) return undefined
    const source = edge as Record<string, unknown>
    if (typeof source.from !== 'string' || typeof source.to !== 'string' || typeof source.label !== 'string') return undefined
    return { from: source.from, to: source.to, label: source.label }
  })
  if (edges !== undefined && edges.some(edge => edge === undefined)) return undefined
  return { ...(nodes === undefined ? {} : { nodes: nodes as NonNullable<PresetRelation['nodes']> }), ...(edges === undefined ? {} : { edges: edges as NonNullable<PresetRelation['edges']> }) }
}

function normalizeMap(raw: unknown): PresetMap | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  if (record.description !== undefined && typeof record.description !== 'string') return undefined
  if (record.image !== undefined && typeof record.image !== 'string') return undefined
  const markers = record.markers === undefined ? undefined : (record.markers as unknown[]).map(marker => {
    if (typeof marker !== 'object' || marker === null) return undefined
    const source = marker as Record<string, unknown>
    if (typeof source.label !== 'string' || !Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.y))) return undefined
    return {
      x: Number(source.x), y: Number(source.y), label: source.label,
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
    }
  })
  if (markers !== undefined && markers.some(marker => marker === undefined)) return undefined
  return {
    ...(record.description === undefined ? {} : { description: record.description as string }),
    ...(record.image === undefined ? {} : { image: record.image as string }),
    ...(markers === undefined ? {} : { markers: markers as NonNullable<PresetMap['markers']> }),
  }
}

function normalizeTimeline(raw: unknown): PresetTimeline | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const unit = typeof record.unit === 'string' && record.unit.length > 0 ? record.unit : undefined
  const view = record.view === 'diary' ? 'diary' as const : record.view === 'horizontal' ? 'horizontal' as const : undefined
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
    const characters = Array.isArray(source.characters) ? source.characters.filter((name): name is string => typeof name === 'string') : undefined
    return {
      at: Number(source.at), title: source.title,
      ...(typeof source.description === 'string' ? { description: source.description } : {}),
      ...(characters === undefined ? {} : { characters }),
    }
  })
  if (events !== undefined && events.some(event => event === undefined)) return undefined
  return {
    ...(unit === undefined ? {} : { unit }),
    ...(view === undefined ? {} : { view }),
    ...(eras === undefined ? {} : { eras: eras as NonNullable<PresetTimeline['eras']> }),
    ...(events === undefined ? {} : { events: events as NonNullable<PresetTimeline['events']> }),
  }
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
  /** 已落的集合模块：构建完成后统一把 place 文本解析成同卡引用。 */
  const collections: { readonly module: ContentModule, readonly blockId: string, readonly data: CollectionData }[] = []
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
        const data: CollectionData = {
          version: 2, fields, items, values, view: (node.view ?? 'list') as import('./formats.ts').CollectionView, artStyle: '',
          ...(node.cardAspect === 'portrait' || node.cardAspect === 'landscape' || node.cardAspect === 'square' ? { cardAspect: node.cardAspect } : {}),
          ...(node.form === undefined ? {} : { form: node.form }),
          ...(node.source === undefined ? {} : { source: node.source }),
          ...(contractFor(node.contract ?? node.name) === undefined ? {} : { presentation: contractFor(node.contract ?? node.name) }),
        }
        const block = { kind: 'text' as const, id: mintId(), content: await io.writeText(encodeCollection(data)) }
        module.blocks.push(block)
        collections.push({ module, blockId: block.id, data })
      } else if (node.widget === 'relation') {
        const nodes = await Promise.all((node.relation?.nodes ?? []).map(async node2 => {
          let avatar: string | undefined
          if (node2.avatar !== undefined) {
            const asset = node2.avatar
            const bytes = await readFile(join(PRESETS_DIR, asset))
            const mediaType = asset.endsWith('.png') ? 'image/png' : 'image/jpeg'
            const resourceId = mintId()
            document.resources.push({ id: resourceId, content: await io.writePayload(bytes, mediaType), mediaType })
            avatar = resourceId
          }
          return {
            id: mintId(), name: node2.name, note: node2.note ?? '',
            x: node2.x ?? null, y: node2.y ?? null,
            ...(avatar === undefined ? {} : { avatar }),
          }
        }))
        const byName = new Map(nodes.map(node2 => [node2.name, node2.id]))
        const edges = (node.relation?.edges ?? []).flatMap(edge => {
          const from = byName.get(edge.from)
          const to = byName.get(edge.to)
          return from === undefined || to === undefined ? [] : [{ id: mintId(), from, to, label: edge.label }]
        })
        module.blocks.push({ kind: 'text', id: mintId(), content: await io.writeText(encodeRelation({ version: 1, nodes, edges })) })
      } else if (node.widget === 'map') {
        // FMG 编辑器在打开地图页时生成空白世界；不再写旧 MapData 载荷。
      } else if (node.widget === 'timeline') {
        const unit = node.timeline?.unit ?? '年'
        const data: TimelineData = {
          version: 2,
          ...(node.timeline?.view === 'diary' ? { view: 'diary' as const } : {}),
          calendar: { ...defaultCalendar, units: [{ name: unit, per: 1 }], unit },
          views: [],
          eras: (node.timeline?.eras ?? []).map((era): TimelineEra => ({
            id: mintId(), name: era.name, from: era.from, to: era.to, color: era.color ?? 'blue', description: era.description ?? '',
          })),
          events: (node.timeline?.events ?? []).map((event): TimelineEvent => ({
            id: mintId(), at: event.at, until: null, title: event.title, description: event.description ?? '', characters: [...(event.characters ?? [])],
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
  // 同卡引用：place 字段值命中本卡某集合条目名时，落成引用（显示名保留）。
  if (collections.length > 0) {
    const itemsByName = collections.flatMap(collection => collection.data.items.map(item => ({ itemId: item.id, name: item.name })))
    for (const collection of collections) {
      const placeFields = collection.data.fields.filter(field => field.type === 'place')
      if (placeFields.length === 0) continue
      let changed = false
      const values: Record<string, Record<string, CollectionValue>> = {}
      for (const [itemId, cells] of Object.entries(collection.data.values)) {
        const next = { ...cells }
        for (const field of placeFields) {
          const value = next[field.id]
          if (typeof value !== 'string' || value.length === 0) continue
          const target = itemsByName.find(candidate => candidate.name === value)
          if (target === undefined) continue
          next[field.id] = { cardId: document.id, name: value, itemId: target.itemId }
          changed = true
        }
        values[itemId] = next
      }
      if (!changed) continue
      const nextData: CollectionData = { ...collection.data, values }
      collection.module.blocks = collection.module.blocks.map(block => block.id === collection.blockId
        ? { kind: 'text' as const, id: block.id, content: '' }
        : block)
      const index = collection.module.blocks.findIndex(block => block.id === collection.blockId)
      if (index >= 0) {
        collection.module.blocks[index] = { kind: 'text', id: collection.blockId, content: await io.writeText(encodeCollection(nextData)) }
      }
    }
  }
  return { document, ...(focusModuleId === undefined ? {} : { focusModuleId }) }
}
