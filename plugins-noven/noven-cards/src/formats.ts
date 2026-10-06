/**
 * 预制模块的载荷编解码（契约 C3 数据格式 v2）。
 *
 * 约定：结构化的真数据放在载荷顶层 `noven` 键下；`nodes` / `items` 是
 * 写给旧读取方的兼容投影，由桌面端在编码时同步重算。decode 宽松
 * （旧版本、缺字段都能读），encode 严格（永远写出最新版本）。
 * @module noven-cards/formats
 */

import { mintId } from './model.ts'

/** 时间线历法：数值一律存数字，精度由 step/format/unit 表达（Q5：每模块可调）。 */
export interface TimelineCalendar {
  readonly name: string
  readonly unit: string
  readonly epoch: number
  /** 拖动吸附步长（如 1 年、0.1 年、30 天）。 */
  readonly step: number
  /** 显示模板，`{n}` 会被替换为数值。 */
  readonly format: string
}

export interface TimelineEra {
  readonly id: string
  readonly name: string
  readonly from: number
  readonly to: number
  readonly color: string
}

export interface TimelineEvent {
  readonly id: string
  /** 轴上位置；null = 未放置。 */
  readonly at: number | null
  /** 持续终点；null = 点事件。 */
  readonly until: number | null
  readonly title: string
  readonly description: string
  readonly characters: string[]
}

export interface TimelineData {
  readonly version: 2
  readonly calendar: TimelineCalendar
  readonly eras: readonly TimelineEra[]
  readonly events: readonly TimelineEvent[]
}

const ERA_COLORS = new Set(['purple', 'blue', 'pink', 'green', 'amber', 'gray'])

const defaultCalendar: TimelineCalendar = { name: '', unit: '年', epoch: 0, step: 1, format: '{n}' }

function num(raw: unknown, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function numOrNull(raw: unknown): number | null {
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function str(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback
}

function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

function calendarOf(raw: unknown): TimelineCalendar {
  const source = record(raw)
  const format = str(source.format, defaultCalendar.format)
  return {
    name: str(source.name),
    unit: str(source.unit, defaultCalendar.unit),
    epoch: num(source.epoch, 0),
    step: Math.abs(num(source.step, 1)) || 1,
    format: format.includes('{n}') ? format : defaultCalendar.format,
  }
}

/** 用历法把数值渲染成节点显示文字（`nodes.time` 的投影）。 */
export function formatTime(calendar: TimelineCalendar, at: number): string {
  return calendar.format.replace('{n}', String(at + calendar.epoch))
}

function eraOf(raw: unknown, index: number): TimelineEra {
  const source = record(raw)
  const from = num(source.from, 0)
  const to = Math.max(from, num(source.to, from))
  const color = str(source.color, 'gray')
  return {
    id: str(source.id) || `era-${String(index)}`,
    name: str(source.name),
    from,
    to,
    color: ERA_COLORS.has(color) ? color : 'gray',
  }
}

function eventOf(raw: unknown, index: number): TimelineEvent {
  const source = record(raw)
  const at = numOrNull(source.at)
  const until = numOrNull(source.until)
  return {
    id: str(source.id) || `ev-${String(index)}`,
    at,
    until: at !== null && until !== null ? Math.max(at, until) : null,
    title: str(source.title),
    description: str(source.description),
    characters: Array.isArray(source.characters) ? source.characters.map(String) : [],
  }
}

/**
 * 解码时间线载荷。v2（有 `noven` 块）以 `noven.events` 为准再与投影 `nodes`
 * 对账：对不上的 nodes 当作（外部新增的）未放置事件，nodes 缺失的 events
 * 保留——桌面端是唯一会写 events 的一方，对账只补偿旧读取方的改动。
 * v1（只有 nodes）按顺序生成未放置事件。
 */
export function decodeTimeline(raw: string | undefined): TimelineData {
  if (raw === undefined || raw.trim().length === 0) {
    return { version: 2, calendar: defaultCalendar, eras: [], events: [] }
  }
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return { version: 2, calendar: defaultCalendar, eras: [], events: [] }
  }
  const noven = record(payload.noven)
  const calendar = calendarOf(noven.calendar)
  const eras = Array.isArray(noven.eras) ? noven.eras.map(eraOf) : []
  const events = Array.isArray(noven.events) ? noven.events.map(eventOf) : null
  if (events !== null) {
    return { version: 2, calendar, eras, events: reconcileNodes(events, payload.nodes) }
  }
  // v1 / 无 noven：nodes 是唯一来源，事件全部未放置。
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : []
  return {
    version: 2, calendar, eras,
    events: nodes.map((node, index) => {
      const source = record(node)
      return { id: `ev-${String(index)}`, at: null, until: null, title: str(source.title), description: str(source.description), characters: [] }
    }),
  }
}

/**
 * 投影对账：`nodes` 与 events 按 title 顺序配对；多出来的 nodes 视为外部
 * 新增（未放置事件）。events 以 noven 为准——投影缺失不删除（桌面端自己
 * 写的投影永远齐全，缺只可能是旧读取方改过，而它删的也按新增回来）。
 */
function reconcileNodes(events: readonly TimelineEvent[], rawNodes: unknown): readonly TimelineEvent[] {
  if (!Array.isArray(rawNodes)) return events
  const claimed = new Set<number>()
  const extra: TimelineEvent[] = []
  for (const [index, node] of rawNodes.entries()) {
    const source = record(node)
    const title = str(source.title)
    const match = events.findIndex((event, i) => !claimed.has(i) && event.title === title)
    if (match >= 0) claimed.add(match)
    else extra.push({ id: `ev-ext-${String(index)}`, at: null, until: null, title, description: str(source.description), characters: [] })
  }
  return extra.length > 0 ? [...events, ...extra] : events
}

/** 编码时间线：`nodes` 按 `at` 升序（未放置排最后）重写为兼容投影。 */
export function encodeTimeline(data: TimelineData): string {
  const placed = data.events.filter(event => event.at !== null)
  const sorted = [...placed].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const unplaced = data.events.filter(event => event.at === null)
  const nodes = [...sorted, ...unplaced].map(event => ({
    time: event.at === null ? '' : formatTime(data.calendar, event.at),
    title: event.title,
    description: event.description,
  }))
  return `${JSON.stringify({
    version: 2,
    kind: 'timeline',
    nodes,
    noven: { calendar: data.calendar, eras: data.eras, events: data.events },
  }, null, 2)}\n`
}

// ---------- 集合 ----------

export type CollectionFieldType = 'text' | 'longtext' | 'date' | 'person' | 'image' | 'place' | 'link'
const FIELD_TYPES = new Set<CollectionFieldType>(['text', 'longtext', 'date', 'person', 'image', 'place', 'link'])

export interface CollectionField {
  readonly id: string
  readonly name: string
  readonly type: CollectionFieldType
}

export interface CollectionItem {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly description: string
  readonly visualKey: string | null
}

export type CollectionValue = string | number | boolean | null | { readonly resourceId: string }
export type CollectionView = 'list' | 'cards' | 'timeline' | 'map'
const VIEWS = new Set<CollectionView>(['list', 'cards', 'timeline', 'map'])

export interface CollectionData {
  readonly version: 2
  readonly fields: readonly CollectionField[]
  readonly items: readonly CollectionItem[]
  /** itemId → fieldId → 值（旁表：条目编辑不丢自定义字段）。 */
  readonly values: Record<string, Record<string, CollectionValue>>
  readonly view: CollectionView
}

function itemOf(raw: unknown, index: number): CollectionItem {
  const source = record(raw)
  return {
    id: str(source.id) || `it-${String(index)}`,
    name: str(source.name),
    summary: str(source.summary),
    description: str(source.description),
    visualKey: typeof source.visualKey === 'string' ? source.visualKey : null,
  }
}

/** 解码集合载荷：v2 读 `noven` 块；无 noven 时 items 即全部真数据。 */
export function decodeCollection(raw: string | undefined): CollectionData {
  const empty: CollectionData = { version: 2, fields: [], items: [], values: {}, view: 'list' }
  if (raw === undefined || raw.trim().length === 0) return empty
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return empty
  }
  const items = (Array.isArray(payload.items) ? payload.items : []).map(itemOf)
  const noven = record(payload.noven)
  const fields = (Array.isArray(noven.fields) ? noven.fields : []).map((field, index): CollectionField => {
    const source = record(field)
    const type = str(source.type, 'text')
    return { id: str(source.id) || `f-${String(index)}`, name: str(source.name), type: (FIELD_TYPES as Set<string>).has(type) ? type as CollectionFieldType : 'text' }
  })
  const itemIds = new Set(items.map(item => item.id))
  const fieldIds = new Set(fields.map(field => field.id))
  const values: Record<string, Record<string, CollectionValue>> = {}
  for (const [itemId, byField] of Object.entries(record(noven.values))) {
    if (!itemIds.has(itemId)) continue
    const cleaned: Record<string, CollectionValue> = {}
    for (const [fieldId, value] of Object.entries(record(byField))) {
      if (!fieldIds.has(fieldId)) continue
      const cell = record(value)
      cleaned[fieldId] = typeof cell.resourceId === 'string' ? { resourceId: cell.resourceId } : value as CollectionValue
    }
    if (Object.keys(cleaned).length > 0) values[itemId] = cleaned
  }
  const view = str(noven.view, 'list')
  return { version: 2, fields, items, values, view: (VIEWS as Set<string>).has(view) ? view as CollectionView : 'list' }
}

/** 编码集合：items 保持手机端可读的四字段投影，真数据进 `noven`。 */
export function encodeCollection(data: CollectionData): string {
  return `${JSON.stringify({
    version: 2,
    kind: 'collection',
    items: data.items.map(item => ({ id: item.id, name: item.name, summary: item.summary, description: item.description, visualKey: item.visualKey })),
    noven: { fields: data.fields, values: data.values, view: data.view },
  }, null, 2)}\n`
}

// ---------- 总览布局 ----------

export interface LayoutTileSource {
  readonly moduleId?: string
  readonly builtin?: string
}

export interface LayoutTile {
  readonly id: string
  readonly source: LayoutTileSource
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly hidden: boolean
}

export interface LayoutData {
  readonly version: 1
  readonly grid: number
  readonly tiles: readonly LayoutTile[]
}

/** 解码布局载荷（extensions['noven.layout.*'] 指向的 JSON）；空/损坏返回空布局。 */
export function decodeLayout(raw: string | undefined): LayoutData {
  if (raw === undefined || raw.trim().length === 0) return { version: 1, grid: 12, tiles: [] }
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return { version: 1, grid: 12, tiles: [] }
  }
  const tiles = (Array.isArray(payload.tiles) ? payload.tiles : []).map((tile, index): LayoutTile => {
    const source = record(record(tile).source)
    const entry: LayoutTileSource = typeof source.moduleId === 'string'
      ? { moduleId: source.moduleId }
      : { builtin: str(source.builtin, 'module') }
    return {
      id: str(record(tile).id) || `t-${String(index)}`,
      source: entry,
      x: Math.max(0, num(record(tile).x, 0)),
      y: Math.max(0, num(record(tile).y, index)),
      w: Math.max(1, num(record(tile).w, 4)),
      h: Math.max(1, num(record(tile).h, 2)),
      hidden: record(tile).hidden === true,
    }
  })
  return { version: 1, grid: Math.max(1, num(payload.grid, 12)), tiles }
}

/** 编码布局：校验 source 必须指向模块或内置块。 */
export function encodeLayout(data: LayoutData): string {
  for (const tile of data.tiles) {
    if (tile.source.moduleId === undefined && tile.source.builtin === undefined) throw new Error('布局小块必须指向模块或内置块')
    if (tile.w < 1 || tile.h < 1) throw new Error('布局小块尺寸无效')
  }
  return `${JSON.stringify({ version: 1, grid: data.grid, tiles: data.tiles }, null, 2)}\n`
}

/** mintId 的别名：供调用方给新事件/条目/字段/小块补编号。 */
export { mintId }
