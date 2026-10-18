/**
 * 预制模块的载荷编解码（契约 C3 数据格式 v2）。
 *
 * 约定：结构化的真数据放在载荷顶层 `noven` 键下；`nodes` / `items` 是
 * 写给旧读取方的兼容投影，由桌面端在编码时同步重算。decode 宽松
 * （旧版本、缺字段都能读），encode 严格（永远写出最新版本）。
 * @module noven-cards/formats
 */

import { mintId } from './model.ts'

/** 历法单位：固定比分解单位（粗→细）。per = 折合多少个最小单位（须为正数）。 */
export interface TimelineUnit {
  readonly name: string
  readonly per: number
}

/** 循环命名：把某单位的数值取模换成名字（干支/生肖/星期/月相……）。 */
export interface TimelineCycle {
  /** 挂在哪个单位上（须等于 units 里某项的 name）。 */
  readonly unit: string
  readonly names: readonly string[]
  /** 相位偏移：(单位值 + offset) mod names.length。 */
  readonly offset: number
}

/**
 * 时间线历法：轴上永远存「最小单位」的数值；历法只负责数 ↔ 文字。
 * 三种原语覆盖任意历法：units 固定比分解、cycles 取模查名、epoch 纪元偏移。
 * （干支纪年 = 年上一个 60 名循环；年号 = 纪元数据 + 显示。）
 */
export interface TimelineCalendar {
  readonly name: string
  /** 粗→细的单位链；为空时按 unit 兜底成单单位历法。 */
  readonly units: readonly TimelineUnit[]
  readonly cycles: readonly TimelineCycle[]
  readonly epoch: number
  /** 拖动吸附步长（最小单位数，如 1 日、30 日）。 */
  readonly step: number
  /** 显示模板，`{n}` 换成复合串（多单位）或数值（单单位）。 */
  readonly format: string
  /** 纪元前模板（最粗单位 + epoch < 0 时启用）。 */
  readonly formatBefore: string
  /** 兼容字段：永远等于最细单位名，仅供旧读取方。 */
  readonly unit: string
}

export interface TimelineEra {
  readonly id: string
  readonly name: string
  /** 起点；null = 向过去开放（渲染成左端粒子消散）。 */
  readonly from: number | null
  /** 终点；null = 向未来开放（渲染成右端粒子消散）。 */
  readonly to: number | null
  readonly color: string
  /** 纪元简介——详情页里的长文段落，可选。 */
  readonly description: string
}

export interface TimelineEvent {
  readonly id: string
  /** 轴上位置；null = 未放置。 */
  readonly at: number | null
  /** 持续终点；null = 点事件（配合 ongoing 时 = 开放端）。 */
  readonly until: number | null
  /** true = 延伸到未来的开放事件（until 须为 null）。 */
  readonly ongoing?: boolean
  readonly title: string
  readonly description: string
  readonly characters: string[]
  /** 事件级颜色覆盖；缺省跟随所属纪元。 */
  readonly color?: string
}

/** 用户插的刻度标记：标尺上的一个有意义时刻（如「现在」），带名字的小旗。 */
export interface TimelineMark {
  readonly id: string
  readonly at: number
  readonly label: string
}

export interface TimelineData {
  readonly version: 2
  /** 当前显示的历法视图。 */
  readonly calendar: TimelineCalendar
  /** 已存的命名历法视图（name 非空），工具栏历法 chip 里可切换。 */
  readonly views: readonly TimelineCalendar[]
  readonly eras: readonly TimelineEra[]
  readonly events: readonly TimelineEvent[]
  readonly marks: readonly TimelineMark[]
}

const ERA_COLORS = new Set(['purple', 'blue', 'pink', 'green', 'amber', 'gray'])

const defaultCalendar: TimelineCalendar = {
  name: '', units: [{ name: '年', per: 1 }], cycles: [],
  epoch: 0, step: 1, format: '{n}', formatBefore: '前 {n}', unit: '年',
}

function num(raw: unknown, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

function numOrNull(raw: unknown): number | null {
  // null/undefined/'' 是「未放置」「开放端」的语义值，必须先挡——Number(null) 是 0。
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function str(raw: unknown, fallback = ''): string {
  return typeof raw === 'string' ? raw : fallback
}

function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

function unitsOf(raw: unknown): readonly TimelineUnit[] {
  if (!Array.isArray(raw)) return []
  const out: TimelineUnit[] = []
  for (const item of raw) {
    const u = record(item)
    const name = str(u.name)
    const per = num(u.per, 0)
    if (name === '' || !(per > 0)) continue
    out.push({ name, per })
  }
  return out.sort((a, b) => b.per - a.per)
}

function cyclesOf(raw: unknown, units: readonly TimelineUnit[]): readonly TimelineCycle[] {
  if (!Array.isArray(raw)) return []
  const known = new Set(units.map(u => u.name))
  const out: TimelineCycle[] = []
  for (const item of raw) {
    const c = record(item)
    const unit = str(c.unit)
    if (!known.has(unit) || !Array.isArray(c.names) || c.names.length === 0) continue
    out.push({ unit, names: c.names.map(String), offset: Math.trunc(num(c.offset, 0)) })
  }
  return out
}

/** 规范化历法输入（解码与 AI 工具共用）：非法单位丢弃、cycle 指向不存在单位丢弃、旧扁平 unit 兜底成单单位链。 */
export function calendarOf(raw: unknown): TimelineCalendar {
  const source = record(raw)
  const format = str(source.format, defaultCalendar.format)
  // 旧格式只有扁平 unit：兜底成单单位链，行为与旧版一致。
  const units = unitsOf(source.units)
  const chain = units.length > 0 ? units : [{ name: str(source.unit, '年') || '年', per: 1 }]
  return {
    name: str(source.name),
    units: chain,
    cycles: cyclesOf(source.cycles, chain),
    epoch: num(source.epoch, 0),
    step: Math.abs(num(source.step, 1)) || 1,
    format: format.includes('{n}') ? format : defaultCalendar.format,
    formatBefore: ((): string => {
      const fb = str(source.formatBefore, defaultCalendar.formatBefore)
      return fb.includes('{n}') ? fb : defaultCalendar.formatBefore
    })(),
    unit: chain[chain.length - 1]?.name ?? '年',
  }
}

/** 把最小单位数分解到单位链（粗→细），如 400 → [{年,1},{月,1},{日,10}]。 */
export function decomposeTime(calendar: TimelineCalendar, at: number): { unit: string, n: number }[] {
  let rem = Math.round(at)
  const parts = calendar.units.map(u => {
    const q = Math.floor(rem / u.per)
    rem -= q * u.per
    return { unit: u.name, n: q }
  })
  if (parts.length === 0) parts.push({ unit: calendar.unit, n: rem })
  else if (rem !== 0) parts[parts.length - 1] = { unit: parts[parts.length - 1]?.unit ?? '', n: (parts[parts.length - 1]?.n ?? 0) + rem }
  return parts
}

/** 复合串拼接：多单位拼「1年1月10日」，循环单位的数替换成名字；单单位只给数（单位由 format 模板带，before 模式补上）。 */
function joinTimeParts(calendar: TimelineCalendar, parts: readonly { unit: string, n: number }[], withUnit = false): string {
  const named = (p: { unit: string, n: number }): string => {
    const cyc = calendar.cycles.find(c => c.unit === p.unit)
    return cyc !== undefined
      ? (cyc.names[((p.n + cyc.offset) % cyc.names.length + cyc.names.length) % cyc.names.length] ?? String(p.n))
      : String(p.n)
  }
  if (calendar.units.length <= 1) {
    const p = parts[0] ?? { unit: calendar.unit, n: 0 }
    return withUnit ? `${named(p)}${p.unit}` : named(p)
  }
  const out = parts.filter(p => p.n !== 0).map(p => `${named(p)}${p.unit}`)
  return out.length > 0 ? out.join('') : `0${calendar.unit}`
}

/** 用历法把数值渲染成显示文字：epoch 加在最粗单位上；跨过纪元前用 formatBefore。 */
export function formatTime(calendar: TimelineCalendar, at: number): string {
  const per0 = calendar.units[0]?.per ?? 1
  const multi = calendar.units.length > 1
  const apply = (tpl: string, value: string): string => {
    const i = tpl.indexOf('{n}')
    if (i < 0) return tpl
    let after = tpl.slice(i + 3)
    // 多单位复合串自带单位名（"5000年6月"），模板后缀若以单位名开头会叠字，剥掉
    const dup = multi ? calendar.units.find(u => u.name.length > 0 && after.startsWith(u.name)) : undefined
    if (dup !== undefined) after = after.slice(dup.name.length)
    return tpl.slice(0, i) + value + after
  }
  if (Math.floor(at / per0) + calendar.epoch < 0) {
    const after = calendar.formatBefore.split('{n}', 2)[1] ?? ''
    return apply(calendar.formatBefore, joinTimeParts(calendar, decomposeTime(calendar, -at), !multi && !after.startsWith(calendar.unit)))
  }
  const parts = decomposeTime(calendar, at)
  if (parts.length > 0) parts[0] = { unit: parts[0]?.unit ?? '', n: (parts[0]?.n ?? 0) + calendar.epoch }
  return apply(calendar.format, joinTimeParts(calendar, parts))
}

function eraOf(raw: unknown, index: number): TimelineEra {
  const source = record(raw)
  // from/to 可空 = 开放端（向过去/未来延伸）。
  let from = numOrNull(source.from)
  let to = numOrNull(source.to)
  if (from !== null && to !== null && to < from) [from, to] = [to, from]
  const color = str(source.color, 'gray')
  return {
    id: str(source.id) || `era-${String(index)}`,
    name: str(source.name),
    from,
    to,
    color: ERA_COLORS.has(color) ? color : 'gray',
    description: str(source.description),
  }
}

function markOf(raw: unknown, index: number): TimelineMark | null {
  const source = record(raw)
  const at = numOrNull(source.at)
  return at === null ? null : { id: str(source.id) || `mark-${String(index)}`, at, label: str(source.label) }
}

function eventOf(raw: unknown, index: number): TimelineEvent {
  const source = record(raw)
  const at = numOrNull(source.at)
  const until = numOrNull(source.until)
  const color = str(source.color)
  return {
    id: str(source.id) || `ev-${String(index)}`,
    at,
    until: at !== null && until !== null ? Math.max(at, until) : null,
    ...(source.ongoing === true ? { ongoing: true as const } : {}),
    title: str(source.title),
    description: str(source.description),
    characters: Array.isArray(source.characters) ? source.characters.map(String) : [],
    ...(ERA_COLORS.has(color) ? { color } : {}),
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
    return { version: 2, calendar: defaultCalendar, views: [], eras: [], events: [], marks: [] }
  }
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return { version: 2, calendar: defaultCalendar, views: [], eras: [], events: [], marks: [] }
  }
  const noven = record(payload.noven)
  const calendar = calendarOf(noven.calendar)
  /** 命名视图库：无名的不算视图（视图靠 name 切换）。 */
  const views = (Array.isArray(noven.views) ? noven.views : []).map(calendarOf).filter(v => v.name !== '')
  const eras = Array.isArray(noven.eras) ? noven.eras.map(eraOf) : []
  const marks = (Array.isArray(noven.marks) ? noven.marks : []).map(markOf).filter((m): m is TimelineMark => m !== null)
  const events = Array.isArray(noven.events) ? noven.events.map(eventOf) : null
  if (events !== null) {
    return { version: 2, calendar, views, eras, marks, events: reconcileNodes(events, payload.nodes) }
  }
  // v1 / 无 noven：nodes 是唯一来源，事件全部未放置。
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : []
  return {
    version: 2, calendar, views, eras, marks,
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
    noven: { calendar: data.calendar, views: data.views, eras: data.eras, events: data.events, marks: data.marks },
  }, null, 2)}\n`
}

// ---------- 集合 ----------

export type CollectionFieldType = 'text' | 'longtext' | 'chips' | 'date' | 'person' | 'image' | 'place' | 'link' | 'number' | 'time'
const FIELD_TYPES = new Set<CollectionFieldType>(['text', 'longtext', 'chips', 'date', 'person', 'image', 'place', 'link', 'number', 'time'])

export interface CollectionField {
  readonly id: string
  readonly name: string
  readonly type: CollectionFieldType
}

/** 引用单元格：指向一张卡（`itemId` 可指向该卡某集合条目）。 */
export interface CardRefValue {
  readonly cardId: string
  readonly name: string
  readonly itemId?: string
}

export interface CollectionItem {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly description: string
  readonly visualKey: string | null
}

export type CollectionValue = string | number | boolean | null | { readonly resourceId: string } | CardRefValue
export type CollectionView = 'list' | 'cards' | 'form' | 'timeline' | 'map'
const VIEWS = new Set<CollectionView>(['list', 'cards', 'form', 'timeline', 'map'])

export interface CollectionData {
  readonly version: 2
  readonly fields: readonly CollectionField[]
  readonly items: readonly CollectionItem[]
  /** itemId → fieldId → 值（旁表：条目编辑不丢自定义字段）。 */
  readonly values: Record<string, Record<string, CollectionValue>>
  readonly view: CollectionView
  /** 本模块条目配图的统一画风提示词：生图工具每次都在它前面拼条目描述，保证一排卡是同一系列。 */
  readonly artStyle: string
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
  const empty: CollectionData = { version: 2, fields: [], items: [], values: {}, view: 'list', artStyle: '' }
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
  return { version: 2, fields, items, values, view: (VIEWS as Set<string>).has(view) ? view as CollectionView : 'list', artStyle: str(noven.artStyle) }
}

/** 编码集合：items 保持手机端可读的四字段投影，真数据进 `noven`。 */
export function encodeCollection(data: CollectionData): string {
  return `${JSON.stringify({
    version: 2,
    kind: 'collection',
    items: data.items.map(item => ({ id: item.id, name: item.name, summary: item.summary, description: item.description, visualKey: item.visualKey })),
    noven: { fields: data.fields, values: data.values, view: data.view, artStyle: data.artStyle },
  }, null, 2)}\n`
}

// ---------- 地图 ----------

/** 地图上的标记点：x/y 是底图上的归一化坐标（0..1，左上原点）。 */
export interface MapMarker {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly label: string
  readonly description: string
}

/** 地图模块载荷：底图是模块的图片块，这里存说明、矢量对象、草稿与语义色。 */
export interface MapData {
  readonly version: 1
  readonly description: string
  /** 兼容投影 = objects 里的 mark；真数据在 objects。 */
  readonly markers: readonly MapMarker[]
  readonly objects: readonly MapObject[]
  readonly draft: readonly MapDraftEntry[]
  readonly palette: readonly MapPaletteEntry[]
  /**
   * 世界生成源：种子 + 配置覆盖 + 高度图输入。grid/pack 几何是它的确定性
   * 派生物——只存意图，读入时由 noven-fmg/world 重算，不会有"几何过期"。
   */
  readonly world?: MapWorldSource
  /** 草稿底层：铺满整张图的语义色（默认海洋）；空 = 无底层，露出羊皮纸。 */
  readonly base?: MapBase
  /** 子视图来源：由 map_spawn_view 记入，父模块 + 取景框（父图归一化坐标）。 */
  readonly parent?: MapViewParent
  /** 显示窗口：底图归一化坐标里的取景框；子视图复用父图时按它裁画面。 */
  readonly window?: readonly [number, number, number, number]
  /** 固定宽高比：缺省时由底图实测推出；子视图（裁窗口或尚无图）必须带上。 */
  readonly aspect?: number
}

/** 草稿底层记录：就是一条语义色（海/陆/虚空或自定义）。 */
export interface MapBase {
  readonly name: string
  readonly desc: string
  readonly color: string
}

/** 子视图溯源：回到父图定位时用它把子图坐标换算回父图归一化坐标。 */
export interface MapViewParent {
  readonly moduleId: string
  readonly objectId?: string
  readonly bbox: readonly [number, number, number, number]
}

/** 底图上的点：归一化坐标（0..1，左上原点）。 */
export type MapXY = readonly [number, number]

/** 线端点的挂靠：连到另一条线（t = 沿线弧长比例）或一个地标。 */
export interface MapAttach {
  readonly kind: 'line' | 'mark'
  readonly id: string
  readonly t: number
}

/** 面：闭合外轮廓（无洞——湖与内海算进这块地的面积）。 */
export interface MapFaceObj {
  readonly id: string
  readonly type: 'face'
  readonly layer: string
  readonly name: string
  readonly color: string
  readonly pts: readonly MapXY[]
}

/** 线：骨架点列 + 逐点宽度（宽为图高比例），端点可挂靠到别的骨架/地标。 */
export interface MapLineObj {
  readonly id: string
  readonly type: 'line'
  readonly layer: string
  readonly name: string
  readonly color: string
  readonly pts: readonly MapXY[]
  readonly widths: readonly number[]
  readonly attachStart?: MapAttach
  readonly attachEnd?: MapAttach
}

/** 地标：单点（城市、关隘；线端点可以挂在它上面）。 */
export interface MapMarkObj {
  readonly id: string
  readonly type: 'mark'
  readonly layer: string
  readonly name: string
  readonly color: string
  readonly pos: MapXY
  readonly description: string
}

export type MapObject = MapFaceObj | MapLineObj | MapMarkObj

/** 草稿笔触：语义色 + 半径（图高比例）+ 圆心轨迹；erase 笔在渲染时按序擦掉下方草稿。 */
export interface MapDraftStroke {
  readonly kind?: 'stroke'
  readonly color: string
  readonly r: number
  readonly pts: readonly MapXY[]
  readonly erase?: boolean
}

/**
 * 草稿面：粗控制点 ctrl + roughness/seed，渲染方用 noven-fmg/mapgeom
 * 的 expandShape 展开成包边闭合多边形——AI 写少量点即可得到自然海岸线。
 * op='subtract' 表示挖洞：把这块面从下方草稿里减掉，露出底层。
 */
export interface MapDraftShape {
  readonly kind: 'shape'
  readonly color: string
  readonly ctrl: readonly MapXY[]
  readonly roughness: number
  readonly seed: number
  readonly op?: 'add' | 'subtract'
}

/** 草稿静多边形：展开后或裁剪后的成品轮廓（子视图裁形状面时落成它）。 */
export interface MapDraftPoly {
  readonly kind: 'poly'
  readonly color: string
  readonly pts: readonly MapXY[]
  readonly op?: 'add' | 'subtract'
}

export type MapDraftEntry = MapDraftStroke | MapDraftShape | MapDraftPoly

/** 语义色：草稿图生图时把 desc 拼进提示词；没有 desc 的自定义色不建。
 * `level` 是世界生成时该色对应的高度（0-100，20 是海平线）；缺省按名称猜。 */
export interface MapPaletteEntry {
  readonly name: string
  readonly desc: string
  readonly color: string
  readonly level?: number
}

/** 世界生成输入的高度图源：模板名、内联脚本、逐格高度（0-100）、灰度（0-255），
 * 或 draft——读入时把本模块的 draft/base/palette 栅格化成高度，草稿即意图层。 */
export type MapWorldHeightmap =
  | { readonly kind: 'template'; readonly template: string }
  | { readonly kind: 'script'; readonly script: string }
  | { readonly kind: 'heights'; readonly heights: readonly number[] }
  | { readonly kind: 'gray'; readonly gray: readonly number[] }
  | { readonly kind: 'draft' }

/** 世界实体覆写：生成后的改名/删除/锁定。`key` 是实体原始名（重算后按名找回）；
 *  `at` 是 [0,1] 归一化位置（x/宽、y/高）的兜底匹配（子图/换名重算时用）；
 *  `id` 是本次生成内的实体编号（无名实体的锚点，换种子后无意义）。
 *  三者都没有的条目丢弃。 */
export interface MapWorldEdit {
  readonly kind: 'burg' | 'state' | 'culture' | 'river' | 'feature' | 'route'
  readonly key?: string
  readonly at?: readonly [number, number]
  readonly id?: number
  readonly name?: string
  readonly remove?: boolean
  readonly lock?: boolean
  /** 划界笔刷：归一化折线 + 笔径（高度比）。回贴时把笔迹覆盖的陆格刷给目标
   *  实体；目标解析不到时刷回中立/荒野（=擦除）。state→cells.state，culture→cells.culture。 */
  readonly stroke?: { readonly pts: readonly MapXY[]; readonly r: number }
  /** 连线：归一化折线。配合 add 新建路线；对解析到的既有路线则是整线覆写
   *  （拖折点改形），回贴时按当次生成的格重新锚定。 */
  readonly path?: readonly MapXY[]
  /** 挪动城邦：归一化目标点，解析到的城邦重锚到最近陆格。 */
  readonly move?: readonly [number, number]
  /** 解析不到就按 name/color/at/path 新建实体——state/culture 需 at（配合 stroke
   *  即「划区建国」）；burg 需 at；route 需 path+group。 */
  readonly add?: boolean
  /** 新建路线的分组：roads 主干道 / trails 小径 / searoutes 航线。 */
  readonly group?: 'roads' | 'trails' | 'searoutes'
  readonly color?: string
}

/** 世界生成源：确定性管线的全部输入；派生几何（grid/pack/河网）不落盘。 */
export interface MapWorldSource {
  readonly seed: string
  /** WorldConfig 覆盖项：宽高/格数/气候等，缺省用引擎默认。 */
  readonly config?: Record<string, unknown>
  readonly heightmap: MapWorldHeightmap
  /** 输入后追加的高度图步骤（如 Smooth）。 */
  readonly postSteps?: readonly string[]
  /** 实体覆写：改名/删除在每次重算后回贴，生成的东西不因重算丢名。 */
  readonly edits?: readonly MapWorldEdit[]
}

const HEX6 = /^#[0-9a-fA-F]{6}$/

function xyOf(raw: unknown): MapXY {
  const p = Array.isArray(raw) ? raw : []
  return [Math.min(1, Math.max(0, num(p[0], 0.5))), Math.min(1, Math.max(0, num(p[1], 0.5)))]
}

function xyListOf(raw: unknown): MapXY[] {
  return (Array.isArray(raw) ? raw : []).map(xyOf)
}

function layerOf(raw: unknown, fallback: string): string {
  const layer = str(raw)
  return layer !== '' ? layer : fallback
}

function colorOf(raw: unknown, fallback: string): string {
  const color = str(raw)
  return HEX6.test(color) ? color : fallback
}

function attachOf(raw: unknown): MapAttach | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const source = record(raw)
  const kind = str(source.kind)
  const id = str(source.id)
  if ((kind !== 'line' && kind !== 'mark') || id === '') return undefined
  return { kind, id, t: Math.min(1, Math.max(0, num(source.t, 0))) }
}

/** mark 与旧版 marker 的互转——旧卡只有 markers，读进来落成地标对象。 */
function markerToMark(marker: MapMarker): MapMarkObj {
  return { id: marker.id, type: 'mark', layer: 'landmark', name: marker.label, color: '#8A8F94', pos: [marker.x, marker.y], description: marker.description }
}
function markToMarker(mark: MapMarkObj): MapMarker {
  return { id: mark.id, x: mark.pos[0], y: mark.pos[1], label: mark.name, description: mark.description }
}

function objectOf(raw: unknown, index: number): MapObject | null {
  const source = record(raw)
  const id = str(source.id) || `mo-${String(index)}`
  const name = str(source.name)
  const type = str(source.type)
  if (type === 'face') {
    const pts = xyListOf(source.pts)
    if (pts.length < 3) return null
    return { id, type: 'face', layer: layerOf(source.layer, 'region'), name, color: colorOf(source.color, '#7FBF8E'), pts }
  }
  if (type === 'line') {
    const pts = xyListOf(source.pts)
    if (pts.length < 2) return null
    const widths = (Array.isArray(source.widths) ? source.widths : [])
      .map(w => Math.min(0.4, Math.max(0.001, num(w, 0))))
    while (widths.length < pts.length) widths.push(widths[widths.length - 1] ?? 0.01)
    return {
      id, type: 'line', layer: layerOf(source.layer, 'road'), name, color: colorOf(source.color, '#8A6B4F'),
      pts, widths: widths.slice(0, pts.length),
      ...(attachOf(source.attachStart) !== undefined ? { attachStart: attachOf(source.attachStart) } : {}),
      ...(attachOf(source.attachEnd) !== undefined ? { attachEnd: attachOf(source.attachEnd) } : {}),
    }
  }
  if (type === 'mark') {
    return { id, type: 'mark', layer: layerOf(source.layer, 'landmark'), name, color: colorOf(source.color, '#8A8F94'), pos: xyOf(source.pos), description: str(source.description) }
  }
  return null
}

function draftEntryOf(raw: unknown): MapDraftEntry | null {
  const source = record(raw)
  const kind = str(source.kind)
  const op = source.op === 'subtract' ? 'subtract' as const : undefined
  if (kind === 'shape' || Array.isArray(source.ctrl)) {
    const ctrl = xyListOf(source.ctrl)
    if (ctrl.length < 3) return null
    return {
      kind: 'shape', color: colorOf(source.color, '#8A8F94'), ctrl,
      roughness: Math.min(1, Math.max(0, num(source.roughness, 0.3))),
      seed: Math.trunc(num(source.seed, 0)),
      ...(op !== undefined ? { op } : {}),
    }
  }
  if (kind === 'poly' && !Array.isArray(source.pts)) return null
  const pts = xyListOf(source.pts)
  if (kind === 'poly') {
    if (pts.length < 3) return null
    return { kind: 'poly', color: colorOf(source.color, '#8A8F94'), pts, ...(op !== undefined ? { op } : {}) }
  }
  if (pts.length < 2) return null
  return {
    kind: 'stroke',
    color: colorOf(source.color, '#8A8F94'),
    r: Math.min(0.4, Math.max(0.001, num(source.r, 0.02))),
    pts,
    ...(source.erase === true ? { erase: true } : {}),
  }
}

function paletteOf(raw: unknown): MapPaletteEntry | null {
  const source = record(raw)
  const name = str(source.name), desc = str(source.desc)
  if (name === '' || desc === '') return null
  const level = numOrNull(source.level)
  return {
    name, desc, color: colorOf(source.color, '#8A8F94'),
    ...(level !== null ? { level: Math.min(100, Math.max(0, Math.round(level))) } : {}),
  }
}

function bboxOf(raw: unknown): readonly [number, number, number, number] | undefined {
  const b = Array.isArray(raw) ? raw : []
  if (b.length < 4) return undefined
  const box: [number, number, number, number] = [num(b[0], 0), num(b[1], 0), num(b[2], 0), num(b[3], 0)]
  return box[2] - box[0] > 0 && box[3] - box[1] > 0 ? box : undefined
}

function numList(raw: unknown, limit: number): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > limit) return null
  const out: number[] = []
  for (const v of raw) {
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    out.push(n)
  }
  return out
}

function worldHeightmapOf(raw: unknown): MapWorldHeightmap | null {
  const source = record(raw)
  switch (source.kind) {
    case 'template': {
      const template = str(source.template)
      return template === '' ? null : { kind: 'template', template }
    }
    case 'script': {
      const script = str(source.script)
      return script === '' ? null : { kind: 'script', script }
    }
    case 'heights': {
      const heights = numList(source.heights, 200_000)
      return heights === null ? null : { kind: 'heights', heights }
    }
    case 'gray': {
      const gray = numList(source.gray, 200_000)
      return gray === null ? null : { kind: 'gray', gray }
    }
    case 'draft': return { kind: 'draft' }
    default: return null
  }
}

function worldEditOf(raw: unknown): MapWorldEdit | null {
  const source = record(raw)
  const kind = str(source.kind)
  if (kind !== 'burg' && kind !== 'state' && kind !== 'culture' && kind !== 'river' && kind !== 'feature' && kind !== 'route') return null
  const key = str(source.key)
  const at = Array.isArray(source.at) && source.at.length >= 2 ? [num(source.at[0], -1), num(source.at[1], -1)] as const : undefined
  const id = typeof source.id === 'number' && Number.isInteger(source.id) && source.id > 0 ? source.id : undefined
  const name = str(source.name)
  const strokeSrc = record(source.stroke)
  const strokePts = xyListOf(strokeSrc.pts)
  const strokeR = num(strokeSrc.r, 0)
  const stroke = strokePts.length > 0 && strokeR > 0 ? { pts: strokePts, r: Math.min(0.5, strokeR) } : undefined
  const pathPts = xyListOf(source.path)
  const move = Array.isArray(source.move) && source.move.length >= 2 ? [num(source.move[0], -1), num(source.move[1], -1)] as const : undefined
  const group = str(source.group)
  const color = str(source.color)
  const edit: MapWorldEdit = {
    kind,
    ...(key !== '' ? { key } : {}),
    ...(at !== undefined && at[0] >= 0 ? { at } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(name !== '' ? { name } : {}),
    ...(source.remove === true ? { remove: true } : {}),
    ...(source.lock === true ? { lock: true } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(pathPts.length > 0 ? { path: pathPts } : {}),
    ...(move !== undefined && move[0] >= 0 ? { move } : {}),
    ...(group === 'roads' || group === 'trails' || group === 'searoutes' ? { group } : {}),
    ...(source.add === true ? { add: true } : {}),
    ...(HEX6.test(color) ? { color } : {}),
  }
  // 无定位手段也没有笔迹/连线/新建意图的条目没有意义
  return edit.key !== undefined || edit.at !== undefined || edit.id !== undefined || edit.stroke !== undefined || edit.path !== undefined || edit.add === true ? edit : null
}

/** 解码世界生成源：缺 heightmap 或字段非法时整段丢弃（退回旧行为）。 */
function worldSourceOf(raw: unknown): MapWorldSource | undefined {
  const source = record(raw)
  const seed = str(source.seed)
  const heightmap = worldHeightmapOf(source.heightmap)
  if (seed === '' || heightmap === null) return undefined
  const config = record(source.config)
  const steps = Array.isArray(source.postSteps) ? source.postSteps.filter((s): s is string => typeof s === 'string') : undefined
  const edits = Array.isArray(source.edits) ? source.edits.map(worldEditOf).filter((e): e is MapWorldEdit => e !== null) : []
  return {
    seed,
    ...(Object.keys(config).length > 0 ? { config } : {}),
    heightmap,
    ...(steps !== undefined && steps.length > 0 ? { postSteps: steps } : {}),
    ...(edits.length > 0 ? { edits } : {}),
  }
}

function baseOf(raw: unknown): MapBase | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const source = record(raw)
  const name = str(source.name)
  return { name, desc: str(source.desc), color: colorOf(source.color, '#6D9DC5') }
}

function parentOf(raw: unknown): MapViewParent | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const source = record(raw)
  const moduleId = str(source.moduleId)
  const bbox = bboxOf(source.bbox)
  if (moduleId === '' || bbox === undefined) return undefined
  const objectId = str(source.objectId)
  return {
    moduleId, bbox,
    ...(objectId !== '' ? { objectId } : {}),
  }
}

/** 兼容读法：老 payload 只有 markers 时，把它们升级成 landmark 对象。 */
function objectsOf(noven: Record<string, unknown>, payload: Record<string, unknown>, markers: readonly MapMarker[]): MapObject[] {
  const rawObjects = Array.isArray(noven.objects) ? noven.objects : (Array.isArray(payload.objects) ? payload.objects : [])
  const objects = rawObjects.map(objectOf).filter((o): o is MapObject => o !== null)
  return objects.length > 0 ? objects : markers.map(markerToMark)
}

function markerOf(raw: unknown, index: number): MapMarker {
  const source = record(raw)
  return {
    id: str(source.id) || `mk-${String(index)}`,
    x: Math.min(1, Math.max(0, num(source.x, 0.5))),
    y: Math.min(1, Math.max(0, num(source.y, 0.5))),
    label: str(source.label),
    description: str(source.description),
  }
}

/** 解码地图载荷：真数据在 `noven`；顶层 markers 是兼容投影，noven 缺时才读。 */
export function decodeMap(raw: string | undefined): MapData {
  const empty: MapData = { version: 1, description: '', markers: [], objects: [], draft: [], palette: [] }
  if (raw === undefined || raw.trim().length === 0) return empty
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return empty
  }
  const noven = record(payload.noven)
  const source = Array.isArray(noven.markers) ? noven.markers : (Array.isArray(payload.markers) ? payload.markers : [])
  const objects = objectsOf(noven, payload, source.map(markerOf))
  const world = worldSourceOf(noven.world ?? payload.world)
  return {
    version: 1,
    description: str(noven.description, str(payload.description)),
    markers: objects.filter((o): o is MapMarkObj => o.type === 'mark').map(markToMarker),
    objects,
    draft: (Array.isArray(noven.draft) ? noven.draft : (Array.isArray(payload.draft) ? payload.draft : []))
      .map(draftEntryOf).filter((s): s is MapDraftEntry => s !== null),
    palette: (Array.isArray(noven.palette) ? noven.palette : (Array.isArray(payload.palette) ? payload.palette : []))
      .map(paletteOf).filter((p): p is MapPaletteEntry => p !== null),
    ...(baseOf(noven.base ?? payload.base) !== undefined ? { base: baseOf(noven.base ?? payload.base) } : {}),
    ...(parentOf(noven.parent ?? payload.parent) !== undefined ? { parent: parentOf(noven.parent ?? payload.parent) } : {}),
    ...(bboxOf(noven.window ?? payload.window) !== undefined ? { window: bboxOf(noven.window ?? payload.window) } : {}),
    ...(num(noven.aspect ?? payload.aspect, NaN) > 0 ? { aspect: num(noven.aspect ?? payload.aspect, 1.6) } : {}),
    ...(world !== undefined ? { world } : {}),
  }
}

/** 编码地图：noven 是真数据，顶层 markers 同步重算成同形投影。 */
export function encodeMap(data: MapData): string {
  const markers = data.objects.filter((o): o is MapMarkObj => o.type === 'mark').map(markToMarker)
    .map(marker => ({ id: marker.id, x: marker.x, y: marker.y, label: marker.label, description: marker.description }))
  const objects = data.objects.map(obj => obj.type === 'face'
    ? { id: obj.id, type: 'face', layer: obj.layer, name: obj.name, color: obj.color, pts: obj.pts }
    : obj.type === 'line'
      ? {
        id: obj.id, type: 'line', layer: obj.layer, name: obj.name, color: obj.color, pts: obj.pts, widths: obj.widths,
        ...(obj.attachStart !== undefined ? { attachStart: obj.attachStart } : {}),
        ...(obj.attachEnd !== undefined ? { attachEnd: obj.attachEnd } : {}),
      }
      : { id: obj.id, type: 'mark', layer: obj.layer, name: obj.name, color: obj.color, pos: obj.pos, description: obj.description })
  return `${JSON.stringify({
    version: 1,
    kind: 'single_image',
    description: data.description,
    markers,
    noven: {
      description: data.description,
      markers,
      objects,
      draft: data.draft.map(s => s.kind === 'shape'
        ? { kind: 'shape', color: s.color, ctrl: s.ctrl, roughness: s.roughness, seed: s.seed, ...(s.op !== undefined ? { op: s.op } : {}) }
        : s.kind === 'poly'
          ? { kind: 'poly', color: s.color, pts: s.pts, ...(s.op !== undefined ? { op: s.op } : {}) }
          : { kind: 'stroke', color: s.color, r: s.r, pts: s.pts, ...(s.erase === true ? { erase: true } : {}) }),
      palette: data.palette.map(p => ({ name: p.name, desc: p.desc, color: p.color, ...(p.level !== undefined ? { level: p.level } : {}) })),
      ...(data.base !== undefined ? { base: { name: data.base.name, desc: data.base.desc, color: data.base.color } } : {}),
      ...(data.parent !== undefined ? { parent: data.parent } : {}),
      ...(data.window !== undefined ? { window: data.window } : {}),
      ...(data.aspect !== undefined ? { aspect: data.aspect } : {}),
      ...(data.world !== undefined ? { world: data.world } : {}),
    },
  }, null, 2)}\n`
}

// ---------- 人物关系图 ----------

/** 关系图节点：x/y 是画布上的归一化坐标（0..1）；null = 未摆位，渲染方自动布局。 */
export interface RelationNode {
  readonly id: string
  readonly name: string
  readonly note: string
  readonly x: number | null
  readonly y: number | null
}

/** 关系图连线：from/to 是节点 id；label 是关系名（如「师徒」「敌对」）。 */
export interface RelationEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string
}

export interface RelationData {
  readonly version: 1
  readonly nodes: readonly RelationNode[]
  readonly edges: readonly RelationEdge[]
}

/** 归一化坐标，缺省 null（未摆位）。 */
function posOrNull(raw: unknown): number | null {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
}

function relNodeOf(raw: unknown, index: number): RelationNode {
  const source = record(raw)
  return {
    id: str(source.id) || `n-${String(index)}`,
    name: str(source.name),
    note: str(source.note),
    x: posOrNull(source.x),
    y: posOrNull(source.y),
  }
}

function relEdgeOf(raw: unknown, index: number): RelationEdge | null {
  const source = record(raw)
  const from = str(source.from)
  const to = str(source.to)
  if (from === '' || to === '' || from === to) return null
  return { id: str(source.id) || `e-${String(index)}`, from, to, label: str(source.label) }
}

/** 解码关系图载荷：真数据在 `noven`；顶层 nodes/edges 是兼容投影。 */
export function decodeRelation(raw: string | undefined): RelationData {
  const empty: RelationData = { version: 1, nodes: [], edges: [] }
  if (raw === undefined || raw.trim().length === 0) return empty
  let payload: Record<string, unknown>
  try {
    payload = record(JSON.parse(raw))
  } catch {
    return empty
  }
  const noven = record(payload.noven)
  const rawNodes = Array.isArray(noven.nodes) ? noven.nodes : (Array.isArray(payload.nodes) ? payload.nodes : [])
  const nodes = rawNodes.map(relNodeOf)
  const ids = new Set(nodes.map(node => node.id))
  const rawEdges = Array.isArray(noven.edges) ? noven.edges : (Array.isArray(payload.edges) ? payload.edges : [])
  const edges = rawEdges.map(relEdgeOf).filter((edge): edge is RelationEdge =>
    edge !== null && ids.has(edge.from) && ids.has(edge.to))
  return { version: 1, nodes, edges }
}

/** 编码关系图：noven 含坐标，顶层投影只留语义字段。 */
export function encodeRelation(data: RelationData): string {
  const nodes = data.nodes.map(node => ({ id: node.id, name: node.name, note: node.note, ...(node.x !== null ? { x: node.x } : {}), ...(node.y !== null ? { y: node.y } : {}) }))
  const edges = data.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label }))
  return `${JSON.stringify({
    version: 1,
    kind: 'relation',
    nodes: data.nodes.map(node => ({ id: node.id, name: node.name, note: node.note })),
    edges: data.edges.map(edge => ({ from: edge.from, to: edge.to, label: edge.label })),
    noven: { nodes, edges },
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
