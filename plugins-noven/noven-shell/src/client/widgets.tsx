/**
 * 预制模块渲染器（设计稿 P2）：时间线 / 人物关系图 / 地图。
 * 三者的真数据都在模块首个文字块的 JSON 里——服务端按 widget.type
 * 解码后以 `widget.data` 下发；这里只读 data、写回走编辑命令
 * （timeline_* 逐条命令 / set_widget_data 整份覆盖）。
 * @module noven-shell/client/widgets
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clearPlaceFocus, setPlaceFocus, usePlaceFocus, type PlaceFocus } from './place-link.ts'
import { clearCollectionFocus, setCollectionFocus, useCollectionFocus } from './collection-focus.ts'
import { clearModuleLinkFocus, setModuleLinkFocus, useModuleLinkFocus } from './module-link.ts'
import type { CardCommand, CardModuleDoc } from './card-api.ts'
import { fmt, type ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/** 旧地图 marker 链接开关：FMG 地图接管后隐藏，等待改绑。 */
const LEGACY_MAP_LINKS: boolean = false

/** 渲染器拿到的写入面：一条编辑命令 → apply。 */
export type WidgetSend = (command: CardCommand) => Promise<boolean>

interface WidgetProps {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly send: WidgetSend
}

// ---------- 数据形状（与 noven-cards/formats.ts 的解码结果一致） ----------

interface TlUnit { readonly name: string, readonly per: number }
interface TlCycle { readonly unit: string, readonly names: readonly string[], readonly offset: number }
interface TlCalendar {
  readonly name: string
  readonly units: readonly TlUnit[]
  readonly cycles: readonly TlCycle[]
  readonly epoch: number
  readonly step: number
  readonly format: string
  readonly formatBefore: string
  /** 兼容镜像 = 最细单位名。 */
  readonly unit: string
}
interface TlMark { readonly id: string, readonly at: number, readonly label: string }
interface TlEra { readonly id: string, readonly name: string, readonly from: number | null, readonly to: number | null, readonly color: string, readonly description?: string }
export interface TlPlace { readonly mapModuleId: string, readonly markerId: string, readonly label?: string }
interface TimelineLinks { readonly characterTarget?: string, readonly relationTarget?: string, readonly characters?: readonly string[], readonly relations?: readonly string[], readonly onOpenCharacter?: () => void, readonly onOpenRelation?: () => void, readonly onCreateCharacter?: () => void, readonly onCreateRelation?: () => void }
interface TlEvent { readonly id: string, readonly at: number | null, readonly until: number | null, readonly ongoing?: boolean, readonly title: string, readonly description: string, readonly characters?: readonly string[], readonly relations?: readonly string[], readonly place?: TlPlace, readonly color?: string }
interface TlWindow { readonly from?: number, readonly to?: number }
interface TlData { readonly view?: 'horizontal' | 'diary', readonly window?: TlWindow, readonly calendar: TlCalendar, readonly views: readonly TlCalendar[], readonly eras: readonly TlEra[], readonly events: readonly TlEvent[], readonly marks: readonly TlMark[] }

interface RelNode { readonly id: string, readonly name: string, readonly note: string, readonly x: number | null, readonly y: number | null, readonly avatar?: string }
interface RelEdge { readonly id: string, readonly from: string, readonly to: string, readonly label: string }
interface RelData { readonly nodes: readonly RelNode[], readonly edges: readonly RelEdge[] }

/** 解码器同时服务详情页与设定总览的缩略图——导出给 card-page 复用。 */
export const tl = (data: unknown): TlData => {
  const d = (data ?? {}) as Partial<TlData>
  const window = d.window === undefined ? undefined : {
    ...(typeof d.window.from === 'number' ? { from: d.window.from } : {}),
    ...(typeof d.window.to === 'number' ? { to: d.window.to } : {}),
  }
  return {
    ...(d.view === 'diary' ? { view: 'diary' as const } : {}),
    ...(window === undefined || Object.keys(window).length === 0 ? {} : { window }),
    calendar: tlCalendar(d.calendar),
    views: (d.views ?? []).map(tlCalendar).filter(v => v.name !== ''),
    eras: d.eras ?? [],
    events: d.events ?? [],
    marks: d.marks ?? [],
  }
}

/** 时间跨度：只裁剪视图，不改数据；未放置事件保留。 */
/** 地点过滤：只留指向该 marker 的事件。 */
const withTimelinePlace = (data: TlData, markerId: string | undefined): TlData => markerId === undefined
  ? data
  : { ...data, events: data.events.filter(event => event.place?.markerId === markerId) }

const withTimelineWindow = (data: TlData): TlData => {
  const from = data.window?.from
  const to = data.window?.to
  if (from === undefined && to === undefined) return data
  const within = (at: number | null): boolean => at === null
    || ((from === undefined || at >= from) && (to === undefined || at <= to))
  return {
    ...data,
    events: data.events.filter(event => within(event.at)),
    eras: data.eras.filter(era => era.from === null || era.to === null
      || ((from === undefined || era.to >= from) && (to === undefined || era.from <= to))),
    marks: data.marks.filter(mark => within(mark.at)),
  }
}

/** 历法规范化（formats.ts calendarOf 的镜像）：units 缺失时由旧扁平 unit 兜底。 */
const tlCalendar = (raw: unknown): TlCalendar => {
  const d = (raw ?? {}) as Partial<TlCalendar> & { unit?: string }
  let units = Array.isArray(d.units) ? d.units.filter(u => typeof u?.name === 'string' && u.name !== '' && Number.isFinite(u.per) && u.per > 0) : []
  units = [...units].sort((a, b) => b.per - a.per)
  if (units.length === 0) units = [{ name: typeof d.unit === 'string' && d.unit !== '' ? d.unit : '年', per: 1 }]
  const known = new Set(units.map(u => u.name))
  const cycles = (Array.isArray(d.cycles) ? d.cycles : [])
    .filter(c => c !== null && typeof c === 'object' && known.has(c.unit) && Array.isArray(c.names) && c.names.length > 0)
    .map(c => ({ unit: c.unit, names: c.names.map(String), offset: Math.trunc(Number(c.offset) || 0) }))
  const format = typeof d.format === 'string' && d.format.includes('{n}') ? d.format : '{n}'
  const formatBefore = typeof d.formatBefore === 'string' && d.formatBefore.includes('{n}') ? d.formatBefore : '前 {n}'
  return {
    name: typeof d.name === 'string' ? d.name : '',
    units, cycles,
    epoch: Number.isFinite(d.epoch) ? Number(d.epoch) : 0,
    step: Number.isFinite(d.step) && Number(d.step) > 0 ? Number(d.step) : 1,
    format, formatBefore,
    unit: units[units.length - 1]?.name ?? '年',
  }
}

export const rel = (data: unknown): RelData => {
  const d = (data ?? {}) as Partial<RelData>
  return { nodes: d.nodes ?? [], edges: d.edges ?? [] }
}

interface CollField { readonly id: string, readonly name: string, readonly type: string }
interface CollItem { readonly id: string, readonly name: string, readonly summary: string, readonly description: string, readonly visualKey: string | null }
type CollValue = string | number | boolean | null
  | { readonly resourceId?: string }
  | { readonly cardId?: string, readonly name?: string, readonly itemId?: string }

/** 引用选择器的目标：项目内一张卡。 */
export interface RefTarget {
  readonly cardId: string
  readonly name: string
  readonly kind: string
  readonly modules?: readonly { readonly id: string, readonly name: string, readonly type: string }[]
}

/** 反查索引里的一条：某张卡在哪个模块/字段引用了我。 */
export interface RefBacklink {
  readonly fromCardId: string
  readonly fromCardName: string
  readonly fromKind: string
  readonly moduleId: string
  readonly moduleName: string
  readonly fieldId: string
  readonly fieldName: string
  readonly itemName: string
}
interface CollData {
  readonly fields: readonly CollField[]
  readonly items: readonly CollItem[]
  readonly values: Readonly<Record<string, Readonly<Record<string, CollValue>>>>
  readonly view: string
  readonly artStyle: string
  readonly cardAspect?: 'portrait' | 'landscape' | 'square'
  readonly form?: { readonly labels?: { readonly primary?: string, readonly add?: string, readonly empty?: string } }
  readonly source?: { readonly cardId?: string, readonly moduleId?: string, readonly moduleName?: string, readonly itemId?: string, readonly label?: string }
  readonly presentation?: {
    readonly contract: string
    readonly layout: string
    readonly core: readonly string[]
    readonly optional: readonly string[]
    readonly detail: readonly { readonly title: string, readonly fields: readonly string[] }[]
    readonly editor: { readonly create: readonly string[], readonly detail: readonly string[] }
    readonly assets: readonly { readonly id: string, readonly role: string, readonly ratio: string, readonly render: string, readonly export: string }[]
    readonly links: readonly string[]
  }
}

/** 集合解码（noven-cards decodeCollection 的镜像）：缺省回空表 + list 视图。 */
export const coll = (data: unknown): CollData => {
  const d = (data ?? {}) as Partial<CollData>
  return {
    fields: Array.isArray(d.fields) ? d.fields : [],
    items: Array.isArray(d.items) ? d.items : [],
    values: (d.values ?? {}) as CollData['values'],
    view: typeof d.view === 'string' ? d.view : 'list',
    artStyle: typeof d.artStyle === 'string' ? d.artStyle : '',
    ...(d.cardAspect === 'portrait' || d.cardAspect === 'landscape' || d.cardAspect === 'square' ? { cardAspect: d.cardAspect } : {}),
    ...(d.form === undefined ? {} : { form: d.form }),
    ...(d.source === undefined ? {} : { source: d.source }),
    ...(d.presentation === undefined ? {} : { presentation: d.presentation }),
  }
}

/** 老卡里的模块没有内嵌 presentation；按模块名补最小契约，避免旧数据继续落到通用表格。 */
const PRESENTATION_FALLBACKS: Readonly<Record<string, { readonly contract: string, readonly layout: string, readonly links: readonly string[] }>> = {
  基本信息: { contract: 'profile', layout: 'profile', links: ['relation', 'timeline'] },
  角色档案: { contract: 'profile', layout: 'profile', links: ['relation', 'timeline'] },
  世界档案: { contract: 'worldProfile', layout: 'profile', links: ['map', 'timeline'] },
  规则: { contract: 'rules', layout: 'rulebook', links: ['relation'] },
  语录: { contract: 'quotes', layout: 'quoteWall', links: ['character', 'timeline'] },
  势力: { contract: 'factions', layout: 'heraldry', links: ['place', 'relation'] },
  种族: { contract: 'races', layout: 'bestiary', links: ['place', 'relation'] },
  文化: { contract: 'culture', layout: 'magazine', links: ['place', 'timeline'] },
  地理: { contract: 'geography', layout: 'atlas', links: ['map', 'timeline'] },
  地区: { contract: 'geography', layout: 'atlas', links: ['map', 'timeline'] },
  能力: { contract: 'abilities', layout: 'skillSheet', links: ['character'] },
  装备: { contract: 'equipment', layout: 'armory', links: ['character'] },
  图集: { contract: 'gallery', layout: 'gallery', links: ['character'] },
  角色图集: { contract: 'gallery', layout: 'gallery', links: ['character'] },
  多形态: { contract: 'multiForm', layout: 'multiForm', links: ['profile'] },
  关系: { contract: 'relations', layout: 'graph', links: ['character', 'place'] },
}

const presentationFallback = (name: string): NonNullable<CollData['presentation']> | undefined => {
  const spec = PRESENTATION_FALLBACKS[name]
  if (spec === undefined) return undefined
  return {
    contract: spec.contract, layout: spec.layout,
    core: [], optional: [], detail: [],
    editor: { create: [], detail: [] },
    assets: [], links: spec.links,
  }
}

/** 分解到单位链（粗→细），负值按连续算术处理（-370 → -2年11月20日）。 */
const decomposeTl = (calendar: TlCalendar, at: number): { unit: string, n: number }[] => {
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

const joinTlParts = (calendar: TlCalendar, parts: readonly { unit: string, n: number }[], withUnit = false): string => {
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

const fmtTime = (calendar: TlCalendar, at: number): string => {
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
    return apply(calendar.formatBefore, joinTlParts(calendar, decomposeTl(calendar, -at), !multi && !after.startsWith(calendar.unit)))
  }
  const parts = decomposeTl(calendar, at)
  if (parts.length > 0) parts[0] = { unit: parts[0]?.unit ?? '', n: (parts[0]?.n ?? 0) + calendar.epoch }
  return apply(calendar.format, joinTlParts(calendar, parts))
}

const mint = (): string => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** 时间线调色板顺序——事件覆盖色与纪元色共用。 */
const TL_COLORS = ['purple', 'blue', 'pink', 'green', 'amber', 'gray'] as const

// ---------- 时间线 ----------

const ERA_BG: Record<string, string> = {
  purple: 'rgba(150,110,220,0.28)', blue: 'rgba(90,140,240,0.28)', pink: 'rgba(240,130,170,0.28)',
  green: 'rgba(110,190,120,0.30)', amber: 'rgba(230,175,80,0.30)', gray: 'rgba(150,150,150,0.22)',
}

/** 纪元色对应的文字色（图形药丸与文档标题共用）。 */
const ERA_FG: Record<string, string> = {
  purple: '#7A4FC9', blue: '#3E63DD', pink: '#D64D8A', green: '#3D9B5F', amber: '#B8722C', gray: '#8A8F94',
}

/** 数值+单位小输入组：下拉选历法单位，提交时换算回最小单位值。空 = null（开放端）。 */
function UnitNum({ value, calendar, placeholder, onCommit, t }: {
  readonly value: number | null
  readonly calendar: TlCalendar
  readonly placeholder: string
  readonly onCommit: (v: number | null) => void
  readonly t: ShellT
}) {
  const bestPer = (v: number | null): number =>
    v === null ? 1 : (calendar.units.find(u => u.per > 1 && v % u.per === 0)?.per ?? 1)
  const [per, setPer] = useState(() => bestPer(value))
  const [text, setText] = useState(() => value === null ? '' : String(value / bestPer(value)))
  useEffect(() => {
    const p = bestPer(value)
    setPer(p)
    setText(value === null ? '' : String(value / p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, calendar])
  const commit = (): void => {
    const t = text.trim()
    if (t === '') { if (value !== null) onCommit(null); return }
    const n = Number(t)
    if (Number.isFinite(n)) {
      const v = n * per
      if (v !== value) onCommit(v)
    }
  }
  return (
    <span className="nv-tld-unitnum">
      <input className="nv-tld-num" value={text} placeholder={placeholder}
        onChange={e => setText(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      {calendar.units.length > 1 || calendar.units[0]?.per !== 1 ? (
        <select className="nv-tld-unitsel" value={per} onChange={e => setPer(Number(e.target.value))}>
          {calendar.units.map(u => <option key={u.name} value={u.per}>{u.name}</option>)}
          {calendar.units.every(u => u.per !== 1) && <option value={1}>{t('tl.unitRaw')}</option>}
        </select>
      ) : (
        <span className="nv-tld-unit">{calendar.unit}</span>
      )}
    </span>
  )
}

/** 史前/未来分界线落在最外锚点外的距离（px）——封闭元素永远够不到它。 */
const LINE_GAP = 60
/** 元素摸到分界线后向外消散延伸的长度（px）。 */
const DUST_LEN = 200
/** 元素收口与雾尾的交叉淡化宽度（px）：本体末端渐隐、雾尾淡入接力，总强度恒定不交叠变深。 */
const MIST_OVER = 24

/**
 * 开放端的雾化消散：纯前端装饰，不进数据。元素过分界线后按原截面矩形
 * 延伸，透明度逐渐降到零——两层柔焦叠一点景深。起点在线内 MIST_OVER 处，
 * 先淡入到线满强度再淡出，正好接住元素自身的末端渐隐。
 */
function MistTail({ line, top, h, dir, color, w = DUST_LEN }: {
  readonly line: number, readonly top: number, readonly h: number
  readonly dir: 1 | -1, readonly color: string, readonly w?: number
}) {
  const x = dir === 1 ? line - MIST_OVER : line + MIST_OVER - w
  const peak = `${(MIST_OVER / w * 100).toFixed(1)}%`
  const fade = `linear-gradient(${dir === 1 ? 90 : 270}deg, transparent, black ${peak}, transparent)`
  return (
    <Fragment>
      <span className="nv-tlg-mist nv-tlg-mist-near" style={{
        left: x, top, width: w, height: h, background: color,
        WebkitMaskImage: fade, maskImage: fade,
      }} />
      <span className="nv-tlg-mist nv-tlg-mist-far" style={{
        left: x, top, width: w, height: h, background: color,
        WebkitMaskImage: fade, maskImage: fade,
      }} />
    </Fragment>
  )
}

/** 事件/纪元的编辑小面板：就地表单，保存走命令。 */
function EditPanel({ title, onClose, children }: { title: string, onClose: () => void, children: ReactNode }) {
  return (
    <div className="nv-wg-panel" onClick={e => e.stopPropagation()}>
      <div className="nv-wg-panelhead">
        <span>{title}</span>
        <button type="button" onClick={onClose}>×</button>
      </div>
      {children}
    </div>
  )
}


/** 事件落在哪个纪元：取包含 at 的最小区间（嵌套纪元归内层）。 */
function eraOfEvent(event: TlEvent, eras: readonly TlEra[]): TlEra | undefined {
  if (event.at === null) return undefined
  let best: TlEra | undefined
  for (const era of eras) {
    if (era.from !== null && event.at < era.from) continue
    if (era.to !== null && event.at > era.to) continue
    const span = (era.to ?? Number.MAX_SAFE_INTEGER) - (era.from ?? Number.MIN_SAFE_INTEGER)
    const bestSpan = best === undefined ? Infinity : (best.to ?? Number.MAX_SAFE_INTEGER) - (best.from ?? Number.MIN_SAFE_INTEGER)
    if (best === undefined || span < bestSpan) best = era
  }
  return best
}

/** 自增高文本域：写字面随内容长高，不占额外控件。 */
function GrowArea({ value, placeholder, autoFocus, onChange, onBlur }: {
  readonly value: string
  readonly placeholder: string
  readonly autoFocus?: boolean
  readonly onChange: (v: string) => void
  readonly onBlur: () => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el !== null) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [value])
  return (
    <textarea ref={ref} className="nv-tld-bodyedit" rows={3} value={value}
      placeholder={placeholder} autoFocus={autoFocus === true}
      onChange={e => onChange(e.target.value)} onBlur={onBlur} />
  )
}

/** 一段可点编的正文：平时是排好的段落（可截断），点进去变文本域，失焦提交。 */
function BodyField({ text, placeholder, clamp, onSave }: {
  readonly text: string
  readonly placeholder: string
  /** 收起时最多几行；0 = 不截断。 */
  readonly clamp: number
  readonly onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  if (editing) {
    return (
      <GrowArea value={draft} placeholder={placeholder} autoFocus
        onChange={setDraft}
        onBlur={() => { setEditing(false); if (draft !== text) onSave(draft) }} />
    )
  }
  return (
    <div className={`nv-tld-body${clamp > 0 ? ' nv-tld-body-clamp' : ''}`}
      style={clamp > 0 ? { WebkitLineClamp: clamp } : undefined}
      onClick={() => { setDraft(text); setEditing(true) }}>
      {text === ''
        ? <span className="nv-tld-empty">{placeholder}</span>
        : text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
    </div>
  )
}

/** 一条事件的「文章」：标题（可点编）+ 灰字元信息 + 正文长文。元信息点开才是日期输入。 */
function TlArticle({ event, era, calendar, moduleId, focused, near, onFocus, onUnfocus, t, send, places, onOpenPlace, links }: {
  readonly event: TlEvent
  readonly era: TlEra | undefined
  readonly calendar: TlCalendar
  readonly moduleId: string
  readonly focused: boolean
  /** 播放头正靠近这条——图上药丸和这里同步亮一下。 */
  readonly near: boolean
  readonly onFocus: () => void
  readonly onUnfocus?: () => void
  readonly t: ShellT
  readonly send: WidgetSend
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (place: TlPlace) => void
  readonly links?: TimelineLinks
}) {
  const [title, setTitle] = useState(event.title)
  const [metaOpen, setMetaOpen] = useState(false)
  const patch = (p: Record<string, unknown>): void => {
    void send({ kind: 'timeline_update_event', moduleId, id: event.id, patch: p })
  }
  const commitTitle = (): void => {
    const next = title.trim()
    if (next !== event.title && next !== '') patch({ title: next })
  }
  // 选中（focused）即展开成完整表单——名字/起止/颜色/删除全摆出来，不藏第二步。
  const editing = focused || metaOpen
  const meta = event.at === null
    ? t('tl.notPlaced')
    : event.ongoing === true
      ? `${fmtTime(calendar, event.at)}–${t('tl.futureOpen')}`
      : event.until === null
        ? fmtTime(calendar, event.at)
        : `${fmtTime(calendar, event.at)}–${fmtTime(calendar, event.until)}`
  return (
    <article id={`nv-tld-ev-${event.id}`}
      className={`nv-tld-art${focused ? ' nv-tld-art-on' : ''}${near && !focused ? ' nv-tld-art-near' : ''}`}
      onClick={onFocus}>
      <input className="nv-tld-title" value={title} placeholder={t('tl.titlePh')}
        onChange={e => setTitle(e.target.value)} onBlur={commitTitle}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={{ color: (event.color ?? era?.color) !== undefined ? (ERA_FG[event.color ?? era?.color ?? 'gray'] ?? ERA_FG.gray) : undefined }} />
      <div className="nv-tld-meta">
        {editing ? (
          <span className="nv-tld-metarow" onClick={e => e.stopPropagation()}>
            <UnitNum value={event.at} calendar={calendar} placeholder={t('wg.tl.at')}
              onCommit={v => patch({ at: v })} t={t} />
            <span className="nv-tld-range">~</span>
            {event.ongoing === true ? (
              <span className="nv-tld-openend">{t('tl.futureOpen')}</span>
            ) : (
              <UnitNum value={event.until} calendar={calendar} placeholder={t('wg.tl.until')}
                onCommit={v => patch({ until: v })} t={t} />
            )}
            <button type="button"
              className={`nv-tld-ongoing${event.ongoing === true ? ' nv-tld-ongoing-on' : ''}`}
              title={t('tl.ongoingTip')}
              onClick={() => patch({ ongoing: event.ongoing !== true })}>{t('tl.ongoing')}</button>
            {places !== undefined && places.length > 0 && (
              <select className="nv-tld-placepick" value={event.place?.markerId ?? ''}
                onChange={e => {
                  const place = places.find(candidate => candidate.markerId === e.target.value)
                  patch({ place: place === undefined ? null : place })
                }}>
                <option value="">{t('tl.place.none')}</option>
                {places.map(place => <option key={`${place.mapModuleId}:${place.markerId}`} value={place.markerId}>{place.label ?? place.markerId}</option>)}
              </select>
            )}
            <span className="nv-wg-colors">
              <button type="button" aria-label={t('tl.ctx.inherit')} title={t('tl.ctx.inherit')}
                className={`nv-wg-color nv-wg-color-inherit${event.color === undefined ? ' nv-wg-color-on' : ''}`}
                onClick={() => patch({ color: null })}>∅</button>
              {TL_COLORS.map(c => (
                <button key={c} type="button" aria-label={c}
                  className={`nv-wg-color${event.color === c ? ' nv-wg-color-on' : ''}`}
                  style={{ background: ERA_BG[c] }}
                  onClick={() => patch({ color: c })} />
              ))}
            </span>
            <button type="button" className="nv-tld-del"
              onClick={() => void send({ kind: 'timeline_remove_event', moduleId, id: event.id })}>{t('wg.del')}</button>
            <button type="button" className="nv-tld-done" onClick={() => { setMetaOpen(false); onUnfocus?.() }}>{t('editor.done')}</button>
          </span>
        ) : (
          <button type="button" className="nv-tld-metatext"
            onClick={e => { e.stopPropagation(); setMetaOpen(true) }}
            title={t('tl.metaEdit')}>
            {meta}{era !== undefined ? ` · ${era.name}` : ''}
          </button>
        )}
        {event.place !== undefined && (
          <button type="button" className="nv-tld-place" onClick={e => { e.stopPropagation(); onOpenPlace?.(event.place!) }}>
            ⌖ {event.place.label ?? event.place.markerId}
          </button>
        )}
      </div>
      {((event.characters?.length ?? 0) > 0 || (event.relations?.length ?? 0) > 0 || links?.onOpenRelation !== undefined || links?.onCreateCharacter !== undefined || links?.onCreateRelation !== undefined) && (
        <div className="nv-tld-links">
          {event.characters?.map(name => <button key={name} type="button" onClick={e => { e.stopPropagation(); links?.onOpenCharacter?.() }}>{name} →</button>)}
          {event.relations?.map(name => <button key={name} type="button" onClick={e => { e.stopPropagation(); links?.onOpenRelation?.() }}>{name} →</button>)}
          {links?.onOpenRelation !== undefined && (event.relations?.length ?? 0) === 0 && <button type="button" onClick={e => { e.stopPropagation(); links.onOpenRelation?.() }}>关系 →</button>}
          {links?.onCreateCharacter !== undefined && (event.characters?.length ?? 0) > 0 && <button type="button" onClick={e => { e.stopPropagation(); links.onCreateCharacter?.() }}>角色（未找到，点击创建）</button>}
          {links?.onCreateRelation !== undefined && <button type="button" onClick={e => { e.stopPropagation(); links.onCreateRelation?.() }}>关系（未找到，点击创建）</button>}
        </div>
      )}
      <BodyField text={event.description} placeholder={t('tl.bodyPh')} clamp={focused ? 0 : 3}
        onSave={v => patch({ description: v })} />
    </article>
  )
}

/** 纪元头：平时是「色点 + 名 + 起止 + 几件事」的一行；点开后原地换成编辑行。 */
function EraHead({ era, count, calendar, moduleId, editing, onEdit, onClose, t, send }: {
  readonly era: TlEra
  readonly count: number
  readonly calendar: TlCalendar
  readonly moduleId: string
  readonly editing: boolean
  readonly onEdit: () => void
  readonly onClose: () => void
  readonly t: ShellT
  readonly send: WidgetSend
}) {
  const [name, setName] = useState(era.name)
  const patch = (p: Record<string, unknown>): void => {
    void send({ kind: 'timeline_update_era', moduleId, id: era.id, patch: p })
  }
  const commit = (): void => {
    if (name.trim() !== '' && name.trim() !== era.name) patch({ name: name.trim() })
  }
  if (editing) {
    return (
      <div className="nv-tld-era nv-tld-era-edit" onClick={e => e.stopPropagation()}>
        <input className="nv-tld-eranamein" value={name} placeholder={t('wg.tl.eraName')} autoFocus
          onChange={e => setName(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <UnitNum value={era.from} calendar={calendar} placeholder={t('tl.fromPh')}
          onCommit={v => { if (v !== era.from) patch({ from: v }) }} t={t} />
        <span className="nv-tld-range">~</span>
        <UnitNum value={era.to} calendar={calendar} placeholder={t('tl.toPh')}
          onCommit={v => { if (v !== era.to) patch({ to: v }) }} t={t} />
        <span className="nv-wg-colors">
          {TL_COLORS.map(c => (
            <button key={c} type="button" aria-label={c}
              className={`nv-wg-color${era.color === c ? ' nv-wg-color-on' : ''}`}
              style={{ background: ERA_BG[c] }}
              onClick={() => patch({ color: c })} />
          ))}
        </span>
        <button type="button" className="nv-tld-del"
          onClick={() => void send({ kind: 'timeline_remove_era', moduleId, id: era.id })}>{t('wg.del')}</button>
        <button type="button" className="nv-tld-done" onClick={onClose}>{t('editor.done')}</button>
      </div>
    )
  }
  return (
    <button type="button" className="nv-tld-era" onClick={onEdit} title={t('tl.eraEdit')}>
      <i className="nv-tld-eradot" style={{ background: ERA_FG[era.color] ?? ERA_FG.gray }} />
      <b>{era.name === '' ? t('tl.eraUntitled') : era.name}</b>
      <span className="nv-tld-erange">{era.from === null ? t('tl.pastOpen') : fmtTime(calendar, era.from)}–{era.to === null ? t('tl.futureOpen') : fmtTime(calendar, era.to)} · {fmt(t, 'tl.count', { count })}</span>
      <span className="nv-tld-eraline" />
    </button>
  )
}

/** 右键菜单的一项；'-' 是分隔线；CtxColors 是一行色点（current=null 表示「跟随纪元」高亮）。 */
interface CtxItem { readonly label: string, readonly danger?: boolean, readonly fn: () => void }
interface CtxColors { readonly colorRow: true, readonly inherit: boolean, readonly current: string | null, readonly pick: (c: string | null) => void }
type CtxEntry = CtxItem | '-' | CtxColors

interface TlSeg { readonly from: number, readonly to: number, readonly elide: boolean }
interface TlLay {
  readonly anchors: readonly number[]
  readonly segs: readonly TlSeg[]
  readonly lo: number
  readonly hi: number
  /** 画出来的刻度（主次都算）；吸附只认这些线加锚点。 */
  readonly ticks: readonly { v: number, major: boolean }[]
  readonly snaps: readonly number[]
  /** 锚点位置的小日期标签（已和主标签做过像素去重）。 */
  readonly anchorLabs: readonly { v: number, x: number, label: string }[]
}

/** 固定刻度：不做缩放，相邻锚点间超过一屏宽的空隙压成 ELIDE_W 的固定缝。 */
const TL_PPU = 6
const ELIDE_W = 56

/** 值 → 轨道内像素：折叠段压缩成 ELIDE_W，其余线性。 */
function tlPxOf(lay: TlLay, ppu: number, v: number): number {
  let px = (v - lay.lo) * ppu
  for (const s of lay.segs) {
    if (v <= s.from) break
    if (!s.elide) continue
    if (v >= s.to) { px -= (s.to - s.from) * ppu - ELIDE_W }
    else { px -= (v - s.from) * ppu; px += ELIDE_W * (v - s.from) / (s.to - s.from) }
  }
  return px
}

/** 轨道内像素 → 值（折叠段内按比例插值）。 */
function tlValAt(lay: TlLay, ppu: number, px: number): number {
  if (px <= 0) return lay.lo + px / ppu
  let acc = 0
  for (const s of lay.segs) {
    const w = s.elide ? ELIDE_W : (s.to - s.from) * ppu
    if (px <= acc + w) {
      return s.elide ? s.from + (s.to - s.from) * (px - acc) / w : s.from + (px - acc) / ppu
    }
    acc += w
  }
  return lay.hi + (px - acc) / ppu
}

/** 刻度密度：主刻度约 110px 一根（中文标签宽 ~78px），取 1/2/5×10ⁿ；细分刻度是主刻度的 1/5。 */
function tlSteps(ppu: number): { major: number, minor: number } {
  const raw = 110 / ppu
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  const n = raw / mag
  const major = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
  return { major, minor: major / 5 }
}

/**
 * 时间线页（剪映式播放头）：图的正中固定一根红色播放头，标尺在它下面
 * 滑——拖动/滚轮平移、停手吸附到最近的可见刻度。
 * 右键插刻度标记/建事件/纪元入点出点；编辑本体在下半的文章流里。
 */
/** 时间线的两种读法：世界史横着排，个人史像日记往下长。 */
export function TimelineWidget(props: WidgetProps & {
  readonly cardId?: string
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (place: TlPlace) => void
  readonly links?: TimelineLinks
}) {
  const focus = usePlaceFocus()
  const active = focus !== undefined && (focus.cardId === undefined || props.cardId === undefined || focus.cardId === props.cardId)
    ? focus : undefined
  const data = withTimelinePlace(withTimelineWindow(tl(props.module.widget?.data)), active?.markerId)
  return data.view === 'diary'
    ? <TimelineDiary {...props} data={data} placeFilter={active} onClearPlace={clearPlaceFocus} places={props.places} onOpenPlace={props.onOpenPlace} links={props.links} />
    : <TimelineEditor {...props} placeFilter={active?.markerId} placeFilterLabel={active?.label ?? active?.markerId} onClearPlace={clearPlaceFocus} places={props.places} onOpenPlace={props.onOpenPlace} links={props.links} />
}

/** 时间线的单位/历法/跨度设置：只改 calendar 与 window，不改事件本身。 */
function TimelineSettings({ moduleId, send, data, t }: {
  readonly moduleId: string
  readonly send: WidgetSend
  readonly data: TlData
  readonly t: ShellT
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(data.calendar.name)
  const [unit, setUnit] = useState(data.calendar.unit)
  const [from, setFrom] = useState(data.window?.from === undefined ? '' : String(data.window.from))
  const [to, setTo] = useState(data.window?.to === undefined ? '' : String(data.window.to))
  useEffect(() => {
    if (!open) return
    setName(data.calendar.name)
    setUnit(data.calendar.unit)
    setFrom(data.window?.from === undefined ? '' : String(data.window.from))
    setTo(data.window?.to === undefined ? '' : String(data.window.to))
  }, [open, data.calendar.name, data.calendar.unit, data.window?.from, data.window?.to])
  const apply = (): void => {
    const nextUnit = unit.trim() === '' ? data.calendar.unit : unit.trim()
    const calendar: TlCalendar = {
      ...data.calendar, name: name.trim(), unit: nextUnit,
      units: [{ name: nextUnit, per: 1 }],
    }
    const window: TlWindow = {
      ...(from.trim() !== '' && Number.isFinite(Number(from)) ? { from: Number(from) } : {}),
      ...(to.trim() !== '' && Number.isFinite(Number(to)) ? { to: Number(to) } : {}),
    }
    void send({ kind: 'timeline_set_calendar', moduleId, calendar })
    void send({ kind: 'timeline_set_window', moduleId, window })
    setOpen(false)
  }
  return (
    <span className="nv-tlset">
      <button type="button" className="nv-tlset-button" onClick={() => setOpen(value => !value)}>{t('tl.settings')}</button>
      {open && (
        <div className="nv-tlset-pop" onClick={event => event.stopPropagation()}>
          <label><span>{t('tl.calName')}</span><input value={name} placeholder={t('tl.calUntitled')} onChange={event => setName(event.target.value)} /></label>
          <label><span>{t('tl.unit')}</span><input value={unit} placeholder="年 / 月 / 日 / 岁" onChange={event => setUnit(event.target.value)} /></label>
          <div className="nv-tlset-range">
            <label><span>{t('tl.from')}</span><input type="number" value={from} placeholder="—" onChange={event => setFrom(event.target.value)} /></label>
            <label><span>{t('tl.to')}</span><input type="number" value={to} placeholder="—" onChange={event => setTo(event.target.value)} /></label>
          </div>
          <small>{t('tl.spanHint')}</small>
          <div className="nv-tlset-actions">
            <button type="button" onClick={() => setOpen(false)}>{t('tl.cancel')}</button>
            <button type="button" className="nv-tlset-apply" onClick={apply}>{t('tl.apply')}</button>
          </div>
        </div>
      )}
    </span>
  )
}

/** 竖向个人史：一条线往下，每笔可点开改标题/正文；关系人挂在条目下。 */
/** 空行动轨迹：第一条记录直接以年谱条目的形状出现。 */
function TimelineDiaryFirst({ moduleId, send, t, unit, links }: {
  readonly moduleId: string
  readonly send: WidgetSend
  readonly t: ShellT
  readonly unit: string
  readonly links?: TimelineLinks
}) {
  const [age, setAge] = useState('0')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [character, setCharacter] = useState('')
  const [relation, setRelation] = useState('')
  const save = (): void => {
    const name = title.trim()
    if (name === '') return
    const value = Number(age)
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ev-${String(Date.now())}`
    void send({
      kind: 'timeline_add_event', moduleId,
      event: { id, at: Number.isFinite(value) ? value : 0, title: name, description,
        ...(character === '' ? {} : { characters: [character] }),
        ...(relation === '' ? {} : { relations: [relation] }) },
    })
    setAge('0'); setTitle(''); setDescription(''); setCharacter(''); setRelation('')
  }
  return (
    <article className="nv-tldiary-entry nv-tldiary-first">
      <div className="nv-tldiary-body">
        <div className="nv-tldiary-firsthead">
          <input className="nv-tldiary-firstage" type="number" value={age}
            onChange={event => setAge(event.target.value)} aria-label={t('tl.first.time')} />
          <span>{unit}</span>
          <input className="nv-tldiary-firsttitle" value={title} placeholder={t('wg.tl.diary.newTitle')}
            onChange={event => setTitle(event.target.value)} />
        </div>
        <textarea rows={2} value={description} placeholder={t('wg.tl.diary.write')}
          onChange={event => setDescription(event.target.value)} />
        <div className="nv-tldiary-firstlinks">
          <label>
            <span>{t('tl.first.character')}</span>
            <select value={character} onChange={event => setCharacter(event.target.value)}>
              <option value="">{t('tl.first.none')}</option>
              {(links?.characters ?? []).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>{t('tl.first.relation')}</span>
            <select value={relation} onChange={event => setRelation(event.target.value)}>
              <option value="">{t('tl.first.none')}</option>
              {(links?.relations ?? []).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="nv-tldiary-firstsave" disabled={title.trim() === ''} onClick={save}>{t('coll.draftSave')}</button>
      </div>
    </article>
  )
}

function TimelineDiary({ module, t, send, data, placeFilter, onClearPlace, places, onOpenPlace, links }: WidgetProps & {
  readonly data: TlData
  readonly placeFilter?: PlaceFocus
  readonly onClearPlace?: () => void
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (place: TlPlace) => void
  readonly links?: TimelineLinks
}) {
  const unit = data.calendar.units[0]?.name ?? t('wg.tl.diary.unit')
  const events = [...data.events]
    .filter(event => event.at !== null)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
  const commit = (id: string, patch: { title?: string, description?: string }): void => {
    void send({ kind: 'timeline_update_event', moduleId: module.id, id, patch })
  }
  const add = (): void => {
    const at = events.reduce((max, event) => Math.max(max, event.at ?? 0), 0) + 1
    void send({ kind: 'timeline_add_event', moduleId: module.id, event: { at, title: '', description: '', characters: [] } })
  }
  return (
    <div className="nv-tldiary">
      <div className="nv-tldiary-head">
        <span>{t('wg.tl.diary.label')}</span>
        <span className="nv-tldiary-actions">
          {placeFilter !== undefined && (
            <button type="button" className="nv-tldiary-placefilter" onClick={onClearPlace}>
              ⌖ {placeFilter.label ?? placeFilter.markerId} ×
            </button>
          )}
          <TimelineSettings moduleId={module.id} send={send} data={data} t={t} />
          <button type="button" className="nv-tldiary-add" onClick={add}>{t('wg.tl.diary.add')}</button>
        </span>
      </div>
      {events.length === 0 && <TimelineDiaryFirst moduleId={module.id} send={send} t={t} unit={unit} links={links} />}
      <div className="nv-tldiary-list">
        {events.map(event => (
          <article key={event.id} className="nv-tldiary-entry">
            <div className="nv-tldiary-date"><b>{event.at}{unit}</b></div>
            <div className="nv-tldiary-body">
              <h3 contentEditable suppressContentEditableWarning spellCheck={false}
                data-placeholder={t('wg.tl.diary.newTitle')}
                onBlur={e => {
                  const title = e.currentTarget.textContent?.trim() ?? ''
                  if (title !== event.title) commit(event.id, { title })
                }}>{event.title}</h3>
              <p contentEditable suppressContentEditableWarning spellCheck={false}
                data-placeholder={t('wg.tl.diary.write')}
                onBlur={e => {
                  const description = e.currentTarget.textContent ?? ''
                  if (description !== event.description) commit(event.id, { description })
                }}>{event.description}</p>
              {(event.characters !== undefined && event.characters.length > 0) || (event.relations !== undefined && event.relations.length > 0) || event.place !== undefined ? (
                <div className="nv-tldiary-chips">
                  {event.characters?.map(name => <button key={name} type="button" className="nv-coll-chip nv-coll-chip-neutral"
                    onClick={() => links?.onOpenCharacter?.()}>{name} →</button>)}
                  {event.relations?.map(name => <button key={name} type="button" className="nv-coll-chip nv-coll-chip-neutral"
                    onClick={() => links?.onOpenRelation?.()}>{name} →</button>)}
                  {links?.onOpenRelation !== undefined && (event.relations?.length ?? 0) === 0 && <button type="button" className="nv-coll-chip nv-coll-chip-neutral" onClick={() => links.onOpenRelation?.()}>关系 →</button>}
                  {links?.onCreateCharacter !== undefined && (event.characters?.length ?? 0) > 0 && <button type="button" className="nv-coll-chip nv-coll-chip-neutral" onClick={() => links.onCreateCharacter?.()}>角色（未找到，点击创建）</button>}
                  {links?.onCreateRelation !== undefined && <button type="button" className="nv-coll-chip nv-coll-chip-neutral" onClick={() => links.onCreateRelation?.()}>关系（未找到，点击创建）</button>}
                  {event.place !== undefined && (
                    <button type="button" className="nv-tldiary-place" onClick={() => onOpenPlace?.(event.place!)}>
                      ⌖ {event.place.label ?? event.place.markerId}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function TimelineEditor({ module, t, send, placeFilter, placeFilterLabel, onClearPlace, places, onOpenPlace, links }: WidgetProps & {
  readonly placeFilter?: string
  readonly placeFilterLabel?: string
  readonly onClearPlace?: () => void
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (place: TlPlace) => void
  readonly links?: TimelineLinks
}) {
  const rawData = useMemo(() => tl(module.widget?.data), [module.widget?.data])
  const data = useMemo(() => withTimelinePlace(withTimelineWindow(rawData), placeFilter), [placeFilter, rawData])
  const stageRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [stageW, setStageW] = useState(0)
  /** 展开写正文的事件（图形点药丸也落到它）。 */
  const [focusId, setFocusId] = useState<string | null>(null)
  const focusRef = useRef<string | null>(null)
  focusRef.current = focusId
  const [eraEdit, setEraEdit] = useState<string | null>(null)
  const [markEdit, setMarkEdit] = useState<string | null>(null)
  const [markDraft, setMarkDraft] = useState('')
  /** 纪元入点出点：非 null = 已标入点，等红线滚到终点。 */
  const [pendingEra, setPendingEra] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number, y: number, items: readonly CtxEntry[] } | null>(null)
  const [calOpen, setCalOpen] = useState(false)

  // ---------- 播放头 ----------
  const [cur, setCur] = useState<number | null>(null)
  const ppu = TL_PPU
  const [phOn, setPhOn] = useState(false)
  const curRef = useRef(0)
  const animRef = useRef<number | null>(null)
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = stageRef.current
    if (el === null) return
    const observer = new ResizeObserver(() => setStageW(el.clientWidth))
    observer.observe(el)
    setStageW(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const lay = useMemo((): TlLay => {
    const aset = new Set<number>()
    data.eras.forEach(e => { if (e.from !== null) aset.add(e.from); if (e.to !== null) aset.add(e.to) })
    data.events.forEach(e => { if (e.at !== null) { aset.add(e.at); if (e.until !== null) aset.add(e.until) } })
    data.marks.forEach(m => aset.add(m.at))
    const anchors = [...aset].sort((a, b) => a - b)
    const lo = anchors[0] ?? 0
    const hi = anchors[anchors.length - 1] ?? lo + 100
    const segs: TlSeg[] = []
    for (let i = 0; i + 1 < anchors.length; i++) {
      const from = anchors[i], to = anchors[i + 1]
      segs.push({ from, to, elide: (to - from) * ppu > stageW * 0.8 })
    }
    // 刻度只铺在锚点域内的展开段上；域外不消散——尺子无限延伸，铺到越界留白尽头。
    const { major, minor } = tlSteps(ppu)
    const ticks: { v: number, major: boolean }[] = []
    const spans: [number, number][] = segs.filter(s => !s.elide).map(s => [s.from, s.to])
    if (spans.length === 0) {
      // 全域都折叠了：刻度只贴在锚点近旁（折叠段里整窗都会压进同一个缺口，
      // 多铺只是叠画），别把数百万天的域逐格铺开。
      for (const a of anchors) spans.push([a - minor * 4, a + minor * 4])
    }
    const edgePad = (LINE_GAP + DUST_LEN + 500) / ppu
    spans.unshift([lo - edgePad, lo])
    spans.push([hi, hi + edgePad])
    const seen = new Set<number>()
    for (const [sf, st] of spans) {
      for (let v = Math.ceil(sf / minor) * minor; v <= st + 1e-9; v += minor) {
        if (ticks.length > 4000) break   // 兜底上限：一屏本来也只放得下几十根
        const k = Math.round(v * 1e6)
        if (seen.has(k)) continue
        seen.add(k)
        ticks.push({ v, major: Math.abs(v / major - Math.round(v / major)) < 1e-6 })
      }
    }
    // 压缩段两侧的标签会在像素上挤到一起：按估算文字宽做矩形去重，
    // 复合标签（"公元前5000年5月10日"）比纯数字宽得多，固定阈值挡不住重叠。
    const labW = (label: string, fs: number): number =>
      [...label].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? fs : fs * 0.55), 0) + 10
    const stub: TlLay = { anchors, segs, lo, hi, ticks: [], snaps: [], anchorLabs: [] }
    const sorted = [...ticks].sort((a, b2) => a.v - b2.v)
    const kept = new Set<number>()
    const keptLabs: { x: number, w: number }[] = []
    for (const tk of sorted) {
      if (!tk.major) continue
      const x = tlPxOf(stub, ppu, tk.v)
      const w = labW(fmtTime(data.calendar, tk.v), 10.5)
      if (keptLabs.some(l => Math.abs(l.x - x) < (l.w + w) / 2 + 8)) continue
      kept.add(Math.round(tk.v * 1e6))
      keptLabs.push({ x, w })
    }
    const filtered = ticks.map(tk => tk.major && !kept.has(Math.round(tk.v * 1e6)) ? { v: tk.v, major: false } : tk)
    // 锚点标签：每个有意义的点直接把日期印在尺子上（别人的时间线就这么干）。
    // 和主标签 + 其它锚点标签做宽度去重；标记已有小旗不写两遍。
    const markAt = new Set(data.marks.map(m => m.at))
    const anchorRects: { x: number, w: number }[] = []
    const anchorLabs: { v: number, x: number, label: string }[] = []
    for (const v of anchors) {
      if (markAt.has(v)) continue
      const x = tlPxOf(stub, ppu, v)
      const label = fmtTime(data.calendar, v)
      const w = labW(label, 9)
      if (keptLabs.some(l => Math.abs(l.x - x) < (l.w + w) / 2 + 6)) continue
      if (anchorRects.some(a => Math.abs(a.x - x) < (a.w + w) / 2 + 6)) continue
      anchorRects.push({ x, w })
      anchorLabs.push({ v, x, label })
    }
    return { anchors, segs, lo, hi, ticks: filtered, snaps: [...filtered.map(tk => tk.v), ...anchors], anchorLabs }
  }, [data, ppu, stageW])

  /** 有没有元素延伸进史前/未来——有才画那根分界线，没有就没有这条线。 */
  const openPast = data.eras.some(e => e.from === null)
  const openFut = data.eras.some(e => e.to === null) || data.events.some(e => e.ongoing === true && e.at !== null)
  /** 实时布局——原生事件处理器从 ref 读，避免每次重挂监听。 */
  const liveRef = useRef({ lay, ppu, stageW })
  liveRef.current = { lay, ppu, stageW }
  const pxOf = (v: number): number => tlPxOf(lay, ppu, v)
  /** 分界线在最外锚点外 LINE_GAP——封闭元素够不到，开放端元素画到线为止再化尘。 */
  const pastX = pxOf(lay.lo) - LINE_GAP
  const futX = pxOf(lay.hi) + LINE_GAP

  /** 视图刷新合并：触控板 wheel/drag 一秒上百次，渲染按帧率走一次就够。 */
  const viewRaf = useRef(0)
  const flushView = (): void => {
    viewRaf.current = 0
    setCur(curRef.current)
  }
  const scheduleView = (): void => {
    if (viewRaf.current === 0) viewRaf.current = requestAnimationFrame(flushView)
  }
  const setCurV = (v: number): void => {
    const { lay: l, ppu: p } = liveRef.current
    // 尺子无限延伸：越界留白放到尘尾尽头再多一截，滑出去看到的还是继续走的标尺。
    const pad = (LINE_GAP + DUST_LEN + 300) / p
    const loV = l.lo - pad
    const hiV = l.hi + pad
    curRef.current = Math.min(hiV, Math.max(loV, v))
    scheduleView()
  }
  const showPh = (): void => {
    setPhOn(true)
    if (phTimerRef.current !== null) clearTimeout(phTimerRef.current)
  }
  const hidePhSoon = (): void => {
    if (phTimerRef.current !== null) clearTimeout(phTimerRef.current)
    phTimerRef.current = setTimeout(() => setPhOn(false), 700)
  }
  const animateTo = (target: number, dur = 220): void => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current)
    const from = curRef.current
    const t0 = performance.now()
    const stepFn = (now: number): void => {
      const k = Math.min(1, (now - t0) / dur)
      setCurV(from + (target - from) * (1 - Math.pow(1 - k, 3)))
      showPh()
      animRef.current = k < 1 ? requestAnimationFrame(stepFn) : null
      if (k >= 1) hidePhSoon()
    }
    animRef.current = requestAnimationFrame(stepFn)
  }
  /** 吸附只认「画出来的线」：刻度 + 锚点（事件/纪元边/标记）。 */
  const nearestSnap = (v: number): number | null => {
    const { lay: l, ppu: p } = liveRef.current
    const vx = tlPxOf(l, p, v)
    let best: number | null = null, bd = Infinity
    for (const s of l.snaps) {
      const d = Math.abs(tlPxOf(l, p, s) - vx)
      if (d < bd) { bd = d; best = s }
    }
    const radius = Math.max(24, tlSteps(p).major * p * 0.5)
    return bd <= radius ? best : null
  }
  const settle = (): void => {
    const s = nearestSnap(curRef.current)
    if (s !== null && Math.abs(s - curRef.current) > 1e-9) animateTo(s, 200)
    else hidePhSoon()
  }
  const bumped = (): void => {
    showPh()
    if (settleRef.current !== null) clearTimeout(settleRef.current)
    settleRef.current = setTimeout(settle, 140)
  }
  const glideTo = (v: number): void => {
    const { lay: l, ppu: p } = liveRef.current
    const s = nearestSnap(v) ?? v
    animateTo(s, Math.min(400, 140 + Math.abs(tlPxOf(l, p, s) - tlPxOf(l, p, curRef.current)) * 0.35))
  }

  // 播放头初始位置：最早的事件，或第一个锚点；空时间线落在 0。
  useEffect(() => {
    if (cur === null) {
      const first = data.events.filter(e => e.at !== null).map(e => e.at ?? 0).sort((a, b) => a - b)[0] ?? lay.anchors[0] ?? 0
      setCurV(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, lay.anchors.length])

  // 滚轮（原生，要 preventDefault）：平移。固定刻度，不做缩放。
  useEffect(() => {
    const el = stageRef.current
    if (el === null) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const { lay: l, ppu: p } = liveRef.current
      setCurV(tlValAt(l, p, tlPxOf(l, p, curRef.current) + e.deltaY + e.deltaX))
      bumped()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(viewRaf.current)
      viewRaf.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageW])

  // 键盘：←/→ 一个最小单位（吸附不抢键盘的精确走位）；Esc 收菜单/纪元入点。
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ae = e.target as HTMLElement
      if (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (animRef.current !== null) { cancelAnimationFrame(animRef.current); animRef.current = null }
        setCurV(curRef.current + (e.key === 'ArrowRight' ? 1 : -1) * data.calendar.step)
        showPh()
        hidePhSoon()
      }
      if (e.key === 'Escape') { setMenu(null); setPendingEra(null) }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = focusRef.current
        if (id !== null) {
          e.preventDefault()
          setFocusId(null)
          void send({ kind: 'timeline_remove_event', moduleId: module.id, id })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.calendar.step])

  /** 纪元车道：区间大的先占上排，重叠的往下排（嵌套纪元自然形成上下层）。开放端按 ±∞ 算。 */
  const eraLane = useMemo(() => {
    const span = (e: TlEra): number => (e.to ?? Number.MAX_SAFE_INTEGER) - (e.from ?? Number.MIN_SAFE_INTEGER)
    const sorted = [...data.eras].sort((a, b) => span(b) - span(a))
    const ends: number[] = []
    const lane = new Map<string, number>()
    for (const era of sorted) {
      const start = era.from ?? Number.MIN_SAFE_INTEGER
      let l = ends.findIndex(end => start >= end)
      if (l < 0) { l = ends.length; ends.push(Number.NEGATIVE_INFINITY) }
      ends[l] = era.to ?? Number.MAX_SAFE_INTEGER
      lane.set(era.id, l)
    }
    return { lane, rows: ends.length }
  }, [data.eras])

  const placed = data.events.filter(e => e.at !== null)

  /** 药丸车道：按估计像素宽贪心分行，同一行左右不叠。 */
  const evLane = useMemo(() => {
    const sorted = [...placed].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    const rights: number[] = []
    const lane = new Map<string, number>()
    for (const e of sorted) {
      const x = pxOf(e.at ?? 0)
      const w = e.ongoing === true
        ? pxOf(lay.hi) + LINE_GAP - x
        : e.until !== null && e.at !== null
          ? Math.max(e.title.length * 13 + 26, pxOf(e.until) - x)
          : e.title.length * 13 + 26
      let l = rights.findIndex(r => x >= r + 8)
      if (l < 0) l = rights.length
      rights[l] = x + w
      lane.set(e.id, l)
    }
    return { lane, rows: rights.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, lay, ppu])

  const focusEvent = (id: string): void => {
    setFocusId(id)
    const at = data.events.find(ev => ev.id === id)?.at
    if (at !== null && at !== undefined) glideTo(at)
    requestAnimationFrame(() => {
      document.getElementById(`nv-tld-ev-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  /** 新条目落盘后把光标放进它的名字输入框，并滚到能看到的位置。 */
  const revealNew = (id: string, isEra: boolean): void => {
    void Promise.resolve().then(() => requestAnimationFrame(() => {
      const el = document.getElementById(`nv-tld-${isEra ? 'era' : 'ev'}-${id}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector<HTMLInputElement>(isEra ? '.nv-tld-eranamein' : '.nv-tld-title')?.focus()
    }))
  }

  const addEventAt = (at: number | null): void => {
    const id = mint()
    setFocusId(id)
    void send({
      kind: 'timeline_add_event', moduleId: module.id,
      event: { id, at, until: null, title: '', description: '' },
    }).then(() => revealNew(id, false))
  }
  /** 「＋新事件」落在红线上；纪元段里的「加一件事」落在纪元起点（开放起点的纪元落到红线上）。 */
  const addEvent = (era: TlEra | undefined): void =>
    addEventAt(era === undefined || era.from === null ? Math.round(curRef.current) : era.from)

  const finishEra = (to: number): void => {
    if (pendingEra === null) return
    const id = mint()
    void send({
      kind: 'timeline_add_era', moduleId: module.id,
      era: { id, name: '', from: Math.round(Math.min(pendingEra, to)), to: Math.round(Math.max(pendingEra, to)), color: 'blue' },
    }).then(() => revealNew(id, true))
    setEraEdit(id)
    setPendingEra(null)
  }
  /** 「＋新纪元」从红线起入点，滚到终点右键结束。 */
  const startEra = (): void => setPendingEra(Math.round(curRef.current))

  // ---------- 右键菜单 ----------
  const openCtx = (x: number, y: number, items: readonly CtxEntry[]): void =>
    setMenu({
      x: Math.min(x, window.innerWidth - 200),
      y: Math.min(y, window.innerHeight - items.length * 34 - 24),
      items,
    })
  useEffect(() => {
    if (menu === null) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close) }
  }, [menu])
  useEffect(() => {
    if (!calOpen) return
    const close = (): void => setCalOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [calOpen])

  const blankCtx = (v: number): readonly CtxEntry[] => [
    { label: fmt(t, 'tl.ctx.mark', { at: fmtTime(data.calendar, v) }), fn: () => {
      const id = mint()
      void send({ kind: 'timeline_add_mark', moduleId: module.id, mark: { id, at: v, label: '' } })
        .then(() => { setMarkEdit(id); setMarkDraft('') })
    } },
    { label: t('tl.ctx.event'), fn: () => addEventAt(v) },
    pendingEra === null
      ? { label: t('tl.ctx.eraStart'), fn: () => setPendingEra(v) }
      : { label: fmt(t, 'tl.ctx.eraEnd', { from: fmtTime(data.calendar, pendingEra), to: fmtTime(data.calendar, v) }), fn: () => finishEra(v) },
    '-',
    { label: t('tl.ctx.jump'), fn: () => glideTo(v) },
  ]
  const markCtx = (mark: TlMark): readonly CtxEntry[] => [
    { label: t('tl.ctx.event'), fn: () => addEventAt(mark.at) },
    { label: t('tl.ctx.rename'), fn: () => { setMarkEdit(mark.id); setMarkDraft(mark.label) } },
    '-',
    { label: t('tl.ctx.markDel'), danger: true, fn: () => void send({ kind: 'timeline_remove_mark', moduleId: module.id, id: mark.id }) },
  ]
  const evCtx = (event: TlEvent): readonly CtxEntry[] => [
    { label: t('tl.ctx.editEv'), fn: () => focusEvent(event.id) },
    { label: fmt(t, 'tl.ctx.moveHere', { at: fmtTime(data.calendar, Math.round(curRef.current)) }), fn: () => {
      const at = Math.round(curRef.current)
      const dur = event.at !== null && event.until !== null ? event.until - event.at : null
      void send({
        kind: 'timeline_move_event', moduleId: module.id, id: event.id, at,
        ...(dur !== null ? { until: at + dur } : {}),
      }).then(() => setFocusId(event.id))
    } },
    { colorRow: true, inherit: true, current: event.color ?? null, pick: c => void send({
      kind: 'timeline_update_event', moduleId: module.id, id: event.id, patch: { color: c },
    }) },
    '-',
    { label: t('tl.ctx.delEv'), danger: true, fn: () => void send({ kind: 'timeline_remove_event', moduleId: module.id, id: event.id }) },
  ]
  const eraCtx = (era: TlEra): readonly CtxEntry[] => {
    const items: CtxEntry[] = [
      { label: t('tl.ctx.editEra'), fn: () => { setEraEdit(era.id); requestAnimationFrame(() => {
        document.getElementById(`nv-tld-era-${era.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }) } },
    ]
    const c = Math.round(curRef.current)
    if ((era.from === null || c > era.from) && (era.to === null || c < era.to)) {
      items.push({ label: fmt(t, 'tl.ctx.split', { at: fmtTime(data.calendar, c) }), fn: () => {
        const id = mint()
        void send({ kind: 'timeline_update_era', moduleId: module.id, id: era.id, patch: { to: c } })
          .then(() => send({
            kind: 'timeline_add_era', moduleId: module.id,
            era: { id, name: era.name, from: c, to: era.to, color: era.color },
          }))
          .then(() => revealNew(id, true))
        setEraEdit(id)
      } })
    }
    items.push(
      { colorRow: true, inherit: false, current: era.color, pick: c => {
        if (c !== null) void send({ kind: 'timeline_update_era', moduleId: module.id, id: era.id, patch: { color: c } })
      } },
      '-',
      { label: t('tl.ctx.delEra'), danger: true, fn: () => void send({ kind: 'timeline_remove_era', moduleId: module.id, id: era.id }) },
    )
    return items
  }

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const rect = trackRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const raw = tlValAt(lay, ppu, e.clientX - rect.left)
    const v = nearestSnap(raw) ?? Math.round(raw)
    const target = e.target as HTMLElement
    const evEl = target.closest('.nv-tlg-ev')
    const mkEl = target.closest('.nv-tlg-mark')
    const eraEl = target.closest('.nv-tlg-era')
    if (evEl !== null) {
      const ev = data.events.find(x2 => `nv-tlg-ev-${x2.id}` === evEl.id)
      if (ev !== undefined) return openCtx(e.clientX, e.clientY, evCtx(ev))
    }
    if (mkEl !== null) {
      const mk = data.marks.find(x2 => `nv-tlg-mark-${x2.id}` === mkEl.id)
      if (mk !== undefined) return openCtx(e.clientX, e.clientY, markCtx(mk))
    }
    if (eraEl !== null && !eraEl.classList.contains('nv-tlg-era-pending')) {
      const era = data.eras.find(x2 => `nv-tlg-era-${x2.id}` === eraEl.id)
      if (era !== undefined) return openCtx(e.clientX, e.clientY, eraCtx(era))
    }
    openCtx(e.clientX, e.clientY, blankCtx(v))
  }

  // 拖动平移（抓空白处；药丸/纪元/标记/刻度不吃这个手势）
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.nv-tlg-ev,.nv-tlg-era,.nv-tlg-mark,.nv-tlg-ticklab,.nv-tlg-markin') !== null) return
    e.preventDefault()
    let lastX = e.clientX
    const move = (me: MouseEvent): void => {
      const dx = me.clientX - lastX
      lastX = me.clientX
      const { lay: l, ppu: p } = liveRef.current
      setCurV(tlValAt(l, p, tlPxOf(l, p, curRef.current) - dx))
      showPh()
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      bumped()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const rulerH = 30
  const eraRowH = 26
  const evRowH = 30
  const graphH = rulerH + Math.max(1, eraLane.rows) * eraRowH + Math.max(1, evLane.rows) * evRowH + 30
  const eraTop = (era: TlEra): number => rulerH + (eraLane.lane.get(era.id) ?? 0) * eraRowH
  const evTop = (id: string): number => rulerH + eraLane.rows * eraRowH + 10 + (evLane.lane.get(id) ?? 0) * evRowH

  /** 离红线最近的事件——图上药丸和下面文章同步亮边。 */
  const nearId = useMemo(() => {
    if (cur === null) return null
    let best: string | null = null, bd = Infinity
    for (const e of placed) { const d = Math.abs((e.at ?? 0) - cur); if (d < bd) { bd = d; best = e.id } }
    return best
  }, [cur, placed])

  const sortedEras = useMemo(() => [...data.eras].sort((a, b) => (a.from ?? Number.MIN_SAFE_INTEGER) - (b.from ?? Number.MIN_SAFE_INTEGER)), [data.eras])
  const unfiled = data.events.filter(e => eraOfEvent(e, data.eras) === undefined)
  /** 吸附辅助线：交互中红线靠近可吸附线时，把那条线点亮（react-timeline-editor 的做法）。 */
  const snapAt = phOn && cur !== null ? nearestSnap(cur) : null

  return (
    <div className="nv-tlp">
      <div className="nv-tlp-bar">
        <span className="nv-tlp-count">
          {fmt(t, 'tl.summary', { eras: data.eras.length, events: data.events.length })}
        </span>
        <span className="nv-tlp-hint">{pendingEra !== null ? t('tl.pendingEra') : (data.events.length === 0 && data.eras.length === 0 ? '' : t('tl.hint'))}</span>
        <span className="nv-tlp-spacer" />
        <TimelineSettings moduleId={module.id} send={send} data={data} t={t} />
        {placeFilter !== undefined && (
          <button type="button" className="nv-tldiary-placefilter" onClick={onClearPlace}>⌖ {placeFilterLabel ?? placeFilter} ×</button>
        )}
        {(data.eras.length > 0 || data.events.length > 0) && (
          <button type="button" className="nv-wg-add" onClick={startEra}>＋ {t('tl.newEra')}</button>
        )}
        <button type="button" className="nv-wg-add nv-tlp-addpri" onClick={() => addEvent(undefined)}>＋ {t('tl.newEvent')}</button>
        {calOpen && (
          <div className="nv-tlp-calpop" onClick={e => e.stopPropagation()}>
            <b>{data.calendar.name !== '' ? data.calendar.name : t('tl.calUntitled')}</b>
            <div className="nv-tlp-calunits">
              {data.calendar.units.map(u => `${u.name}${u.per !== 1 ? `=${String(u.per)}${data.calendar.unit}` : ''}`).join(' · ')}
              {data.calendar.cycles.length > 0 && ` · ${fmt(t, 'tl.calCycles', { count: data.calendar.cycles.length })}`}
            </div>
            {data.views.length > 0 && (
              <div className="nv-tlp-calviews">
                {data.views.map(v => (
                  <button key={v.name} type="button"
                    className={`nv-tlp-calview${v.name === data.calendar.name ? ' nv-tlp-calview-on' : ''}`}
                    onClick={() => { setCalOpen(false); void send({ kind: 'timeline_switch_view', moduleId: module.id, name: v.name }) }}>
                    {v.name}
                  </button>
                ))}
              </div>
            )}
            <div className="nv-tlp-caltip">{t('tl.calTip')}</div>
          </div>
        )}
      </div>
      <div className="nv-tlg" ref={stageRef} style={{ height: graphH }} onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
        <div className="nv-tlg-band" aria-hidden="true"
          style={{ top: rulerH + eraLane.rows * eraRowH + 4, height: Math.max(1, evLane.rows) * evRowH }} />
        <div className="nv-tlg-track" ref={trackRef}
          style={{ transform: `translateX(${stageW / 2 - pxOf(cur ?? lay.lo)}px)` }}>
          {lay.ticks.map(tk => tk.major ? (
            <span key={`m${tk.v}`} className="nv-tlg-ticklab" style={{ left: pxOf(tk.v) }}
              onClick={() => glideTo(tk.v)}>{fmtTime(data.calendar, tk.v)}</span>
          ) : (
            <span key={`n${tk.v}`} className="nv-tlg-tick nv-tlg-tick-minor" style={{ left: pxOf(tk.v) }} />
          ))}
          {lay.ticks.filter(tk => tk.major).map(tk => (
            <div key={`g${tk.v}`} className="nv-tlg-grid" style={{ left: pxOf(tk.v) }} />
          ))}
          {lay.anchorLabs.map(a => (
            <span key={`al${a.v}`} className="nv-tlg-anchorlab" style={{ left: a.x }}
              onClick={() => glideTo(a.v)}>{a.label}</span>
          ))}
          {lay.segs.filter(s => s.elide).map(s => (
            <span key={`el${s.from}`} className="nv-tlg-elide"
              style={{ left: pxOf(s.from), width: ELIDE_W }}
              title={fmt(t, 'tl.elideTip', { span: `${s.to - s.from} ${data.calendar.unit}` })}>……</span>
          ))}
          {/* 分界线先画在底下：开放端元素的雾尾盖过它，融合而不是切断。 */}
          {openPast && (
            <div className="nv-tlg-bound nv-tlg-bound-past" style={{ left: pastX, height: graphH }}>
              <span className="nv-tlg-boundlab">{t('tl.pastOpen')}</span>
            </div>
          )}
          {openFut && (
            <div className="nv-tlg-bound" style={{ left: futX, height: graphH }}>
              <span className="nv-tlg-boundlab">{t('tl.futureOpen')}</span>
            </div>
          )}

          {data.eras.map(era => {
            // 色带滚出左缘时名字跟着收进可视区（剪映素材名的行为）
            const viewL = pxOf(cur ?? lay.lo) - stageW / 2
            // 开放端：实心带画到分界线为止，线外接一段粒子尘尾——「摸到线往后盖粒子层」
            const x0 = era.from === null ? pastX : pxOf(era.from)
            const x1 = era.to === null ? futX : pxOf(era.to)
            const w = Math.max(14, x1 - x0)
            const fg = ERA_FG[era.color] ?? ERA_FG.gray
            // 开放端的本体末端自己渐隐一段，和雾尾淡入互补——同色叠加才会变深，交叉淡化不会。
            const fadeMask = era.from === null && era.to === null
              ? `linear-gradient(90deg, transparent, black ${MIST_OVER}px, black calc(100% - ${MIST_OVER}px), transparent)`
              : era.from === null ? `linear-gradient(90deg, transparent, black ${MIST_OVER}px)`
              : era.to === null ? `linear-gradient(90deg, black calc(100% - ${MIST_OVER}px), transparent)`
              : undefined
            return (
              <Fragment key={era.id}>
                <button id={`nv-tlg-era-${era.id}`} type="button"
                  className="nv-tlg-era"
                  style={{
                    left: x0, width: w, top: eraTop(era),
                    background: ERA_BG[era.color] ?? ERA_BG.gray, color: fg,
                    ...(fadeMask !== undefined ? { WebkitMaskImage: fadeMask, maskImage: fadeMask } : {}),
                  }}
                  onClick={() => { setEraEdit(era.id); requestAnimationFrame(() => {
                    document.getElementById(`nv-tld-era-${era.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }) }}>
                  <span style={{ paddingLeft: Math.max(0, Math.min(viewL + 4 - x0, w - 8)) }}>{era.name}</span>
                  <span className="nv-tlg-del" title={t('wg.del')} onClick={e => {
                    e.stopPropagation()
                    void send({ kind: 'timeline_remove_era', moduleId: module.id, id: era.id })
                  }}>×</span>
                </button>
                {era.from === null && (
                  <MistTail line={pastX} top={eraTop(era)} h={20} dir={-1}
                    color={ERA_BG[era.color] ?? ERA_BG.gray} />
                )}
                {era.to === null && (
                  <MistTail line={futX} top={eraTop(era)} h={20} dir={1}
                    color={ERA_BG[era.color] ?? ERA_BG.gray} />
                )}
              </Fragment>
            )
          })}
          {pendingEra !== null && (
            <div className="nv-tlg-era nv-tlg-era-pending" style={{
              left: Math.min(pxOf(pendingEra), pxOf(cur ?? pendingEra)),
              width: Math.max(6, Math.abs(pxOf(cur ?? pendingEra) - pxOf(pendingEra))),
              top: rulerH + eraLane.rows * eraRowH,
            }}>{t('tl.newEra')}</div>
          )}
          {data.marks.map(mark => (
            <div key={mark.id} id={`nv-tlg-mark-${mark.id}`} className="nv-tlg-mark" style={{ left: pxOf(mark.at) }}
              title={t('tl.markTip')}
              onClick={e => {
                // mcut 的 ⌥-点击：直接删标记，不进菜单。
                if (e.altKey) { void send({ kind: 'timeline_remove_mark', moduleId: module.id, id: mark.id }); return }
                glideTo(mark.at)
              }}>
              <span className="nv-tlg-markhit" />
              {markEdit === mark.id ? (
                <input className="nv-tlg-markin" value={markDraft} autoFocus placeholder={t('tl.markPh')}
                  onChange={e => setMarkDraft(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onBlur={() => {
                    setMarkEdit(null)
                    const label = markDraft.trim()
                    if (label !== mark.label) void send({ kind: 'timeline_update_mark', moduleId: module.id, id: mark.id, patch: { label } })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
              ) : (
                <span className="nv-tlg-markflag">{mark.label !== '' ? mark.label : null}</span>
              )}
              <span className="nv-tlg-del" title={t('wg.del')} onClick={e => {
                e.stopPropagation()
                void send({ kind: 'timeline_remove_mark', moduleId: module.id, id: mark.id })
              }}>×</span>
            </div>
          ))}
          {snapAt !== null && <div className="nv-tlg-snapline" style={{ left: pxOf(snapAt), height: graphH }} />}
          {placed.map(event => {
            const at = event.at ?? 0
            const era = eraOfEvent(event, data.eras)
            // 事件自带色覆盖纪元色；都不给则灰。
            const color = event.color ?? era?.color ?? 'gray'
            const w = event.until !== null && event.at !== null ? pxOf(event.until) - pxOf(at) : undefined
            const estW = Math.max(event.title.length * 13 + 26, w ?? 0)
            // 药丸也是实体：伸过分界线就在线处截断——标题切掉一半也是「到达未来」的表达。
            const cut = openFut && pxOf(at) + estW > futX
            return (
              <div key={event.id}>
                <span className="nv-tlg-stem" style={{ left: pxOf(at), top: rulerH, height: Math.max(0, evTop(event.id) - rulerH) }} />
                {event.ongoing === true && (
                  <Fragment>
                    <span className="nv-tlg-evbar" style={{
                      left: pxOf(at) + 4, top: evTop(event.id) + 8,
                      width: Math.max(0, futX - pxOf(at) - 4),
                      background: ERA_BG[color] ?? ERA_BG.gray,
                      WebkitMaskImage: `linear-gradient(90deg, black calc(100% - ${MIST_OVER}px), transparent)`,
                      maskImage: `linear-gradient(90deg, black calc(100% - ${MIST_OVER}px), transparent)`,
                    }} />
                    <MistTail line={futX} top={evTop(event.id)} h={22} dir={1}
                      color={ERA_BG[color] ?? ERA_BG.gray} />
                  </Fragment>
                )}
                <button id={`nv-tlg-ev-${event.id}`} type="button"
                  title={event.until === null
                    ? event.ongoing === true ? `${fmtTime(data.calendar, at)}–${t('tl.futureOpen')}` : fmtTime(data.calendar, at)
                    : `${fmtTime(data.calendar, at)}–${fmtTime(data.calendar, event.until)}`}
                  className={`nv-tlg-ev${focusId === event.id ? ' nv-tlg-ev-on' : ''}${nearId === event.id ? ' nv-tlg-ev-near' : ''}`}
                  style={{
                    left: pxOf(at), top: evTop(event.id),
                    ...(cut
                      ? {
                        width: Math.max(8, futX - pxOf(at)), borderRadius: '999px 0 0 999px', overflow: 'hidden',
                        WebkitMaskImage: `linear-gradient(90deg, black calc(100% - ${MIST_OVER}px), transparent)`,
                        maskImage: `linear-gradient(90deg, black calc(100% - ${MIST_OVER}px), transparent)`,
                      }
                      : w !== undefined ? { width: Math.max(estW, w) } : {}),
                    background: ERA_BG[color] ?? ERA_BG.gray, color: ERA_FG[color] ?? ERA_FG.gray,
                  }}
                  onClick={() => focusEvent(event.id)}>
                  {event.title !== '' ? event.title : t('tl.untitled')}
                  <span className="nv-tlg-del" title={t('wg.del')} onClick={e => {
                    e.stopPropagation()
                    if (focusRef.current === event.id) setFocusId(null)
                    void send({ kind: 'timeline_remove_event', moduleId: module.id, id: event.id })
                  }}>×</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="nv-tlg-ph">
          <span className={`nv-tlg-phv${phOn ? ' nv-tlg-phv-on' : ''}`}>
            {fmtTime(data.calendar, Math.round(cur ?? 0))}
          </span>
        </div>
      </div>
      {menu !== null && (
        <div className="nv-ed-menu" style={{ left: menu.x, top: menu.y }}>
          {menu.items.map((item, i) => item === '-'
            ? <div key={i} className="nv-ed-menusep" />
            : 'colorRow' in item ? (
              <div key={i} className="nv-ed-menucolors">
                {item.inherit && (
                  <button type="button" aria-label={t('tl.ctx.inherit')} title={t('tl.ctx.inherit')}
                    className={`nv-wg-color nv-wg-color-inherit${item.current === null ? ' nv-wg-color-on' : ''}`}
                    onClick={() => { setMenu(null); item.pick(null) }}>∅</button>
                )}
                {TL_COLORS.map(c => (
                  <button key={c} type="button" aria-label={c}
                    className={`nv-wg-color${item.current === c ? ' nv-wg-color-on' : ''}`}
                    style={{ background: ERA_BG[c] }}
                    onClick={() => { setMenu(null); item.pick(c) }} />
                ))}
              </div>
            ) : <button key={i} type="button" className="nv-ed-menuitem" data-danger={item.danger === true || undefined}
                onClick={() => { setMenu(null); item.fn() }}>{item.label}</button>)}
        </div>
      )}
      <div className="nv-tld">
        {sortedEras.map(era => {
          const events = data.events
            .filter(e => eraOfEvent(e, data.eras)?.id === era.id)
            .sort((a, b) => (a.at ?? Number.MAX_SAFE_INTEGER) - (b.at ?? Number.MAX_SAFE_INTEGER))
          return (
            <section key={era.id} id={`nv-tld-era-${era.id}`} className="nv-tld-sec">
              <EraHead era={era} count={events.length} calendar={data.calendar} moduleId={module.id}
                editing={eraEdit === era.id} onEdit={() => setEraEdit(era.id)} onClose={() => setEraEdit(null)}
                t={t} send={send} />
              <BodyField text={era.description ?? ''} placeholder={t('tl.introPh')} clamp={0}
                onSave={v => void send({ kind: 'timeline_update_era', moduleId: module.id, id: era.id, patch: { description: v } })} />
              {events.map(event => (
                <TlArticle key={event.id} event={event} era={era} calendar={data.calendar}
                  moduleId={module.id} focused={focusId === event.id} near={nearId === event.id}
                  onFocus={() => setFocusId(event.id)} onUnfocus={() => setFocusId(null)} t={t} send={send}
                  places={places} onOpenPlace={onOpenPlace} links={links} />
              ))}
              <button type="button" className="nv-tld-add" onClick={() => addEvent(era)}>
                {fmt(t, 'tl.addInEra', { name: era.name === '' ? t('tl.eraUntitled') : era.name })}
              </button>
            </section>
          )
        })}
        {(unfiled.length > 0 || data.eras.length === 0) && (
          <section className="nv-tld-sec">
            {data.eras.length > 0 && (
              <div className="nv-tld-era nv-tld-era-plain">
                <b>{t('tl.unfiled')}</b>
                <span className="nv-tld-eraline" />
              </div>
            )}
            {unfiled.map(event => (
              <TlArticle key={event.id} event={event} era={undefined} calendar={data.calendar}
                moduleId={module.id} focused={focusId === event.id} near={nearId === event.id}
                onFocus={() => setFocusId(event.id)} onUnfocus={() => setFocusId(null)} t={t} send={send}
                places={places} onOpenPlace={onOpenPlace} links={links} />
            ))}
            {data.eras.length > 0 && (
              <button type="button" className="nv-tld-add" onClick={() => addEvent(undefined)}>＋ {t('tl.newEvent')}</button>
            )}
          </section>
        )}
        {data.eras.length === 0 && data.events.length === 0 && (
          <TimelineFirstEvent moduleId={module.id} send={send} t={t} calendar={data.calendar}
            places={places} onOpenPlace={onOpenPlace} />
        )}
      </div>
    </div>
  )
}

/** 空时间线的第一条事件：直接落在轴上，不是弹窗或空文案。 */
function TimelineFirstEvent({ moduleId, send, t, places }: {
  readonly moduleId: string
  readonly send: WidgetSend
  readonly t: ShellT
  readonly calendar: TlCalendar
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (place: TlPlace) => void
}) {
  const [at, setAt] = useState('0')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [placeKey, setPlaceKey] = useState('')
  const place = (places ?? []).find(candidate => `${candidate.mapModuleId}:${candidate.markerId}` === placeKey)
  const save = (): void => {
    const name = title.trim()
    if (name === '') return
    const value = Number(at)
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ev-${String(Date.now())}`
    void send({
      kind: 'timeline_add_event', moduleId,
      event: {
        id, at: Number.isFinite(value) ? value : 0, title: name, description,
        ...(place === undefined ? {} : { place }),
      },
    })
    setAt('0'); setTitle(''); setDescription(''); setPlaceKey('')
  }
  return (
    <div className="nv-tl-first">
      <label><span>{t('tl.first.time')}</span><input type="number" value={at} onChange={event => setAt(event.target.value)} /></label>
      <label><span>{t('tl.first.title')}</span><input value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label><span>{t('tl.first.place')}</span>
        <select value={placeKey} onChange={event => setPlaceKey(event.target.value)}>
          <option value="">{t('tl.first.placeEmpty')}</option>
          {(places ?? []).map(candidate => (
            <option key={`${candidate.mapModuleId}:${candidate.markerId}`} value={`${candidate.mapModuleId}:${candidate.markerId}`}>
              {candidate.label ?? candidate.markerId}
            </option>
          ))}
        </select>
      </label>
      <label className="nv-tl-firstbody"><span>{t('tl.first.body')}</span>
        <textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} />
      </label>
      <button type="button" className="nv-tl-firstsave" disabled={title.trim() === ''} onClick={save}>{t('tl.first.save')}</button>
    </div>
  )
}

/** 总览用迷你时间线：三个事件行，右侧标纪元名——读得懂，不是一根光杆坐标轴。 */
export function MiniTimeline({ data }: { readonly data: TlData }) {
  const events = data.events.filter(event => event.at !== null).slice(0, 3)
  const eraOf = (at: number): string => data.eras.find(era =>
    (era.from ?? Number.NEGATIVE_INFINITY) <= at && at <= (era.to ?? Number.POSITIVE_INFINITY))?.name ?? ''
  if (events.length === 0) return <span className="nv-ov-excerpt">—</span>
  return (
    <span className="nv-mini-tl">
      {events.map(event => (
        <span key={event.id} className="nv-mini-tl-row">
          <i className="nv-mini-tl-dot" />
          <b>{event.title}</b>
          <span>{eraOf(event.at ?? 0) || event.description.slice(0, 10)}</span>
        </span>
      ))}
    </span>
  )
}

/** 总览用迷你关系：三条「从 — 关系 — 到」行，替代缩到看不清的迷你图。 */
export function MiniRelation({ data }: { readonly data: RelData }) {
  const rows = data.edges.slice(0, 3).map(edge => {
    const from = data.nodes.find(node => node.id === edge.from)
    const to = data.nodes.find(node => node.id === edge.to)
    return from === undefined || to === undefined ? undefined : { id: edge.id, from: from.name, label: edge.label, to: to.name }
  }).filter((row): row is { id: string, from: string, label: string, to: string } => row !== undefined)
  if (rows.length === 0) return <span className="nv-ov-excerpt">—</span>
  return (
    <span className="nv-mini-rel">
      {rows.map(row => (
        <span key={row.id} className="nv-mini-relrow">
          <b>{row.from}</b>
          <i>{row.label}</i>
          <span>{row.to}</span>
        </span>
      ))}
    </span>
  )
}

// ---------- 3D 场景 ----------

interface SceneObject {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly imageResourceId?: string
  readonly description: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly rx: number
  readonly ry: number
  readonly rz: number
  readonly scale: number
}
interface SceneData { readonly version: 1, readonly objects: readonly SceneObject[], readonly camera: { readonly yaw: number, readonly pitch: number, readonly zoom: number } }

const sceneNum = (value: unknown, fallback: number): number => Number.isFinite(Number(value)) ? Number(value) : fallback

/** 3D 场景解码（noven-cards decodeScene 的镜像）。 */
export const scene = (raw: unknown): SceneData => {
  const source = (raw ?? {}) as Partial<SceneData>
  const camera = (source.camera ?? {}) as Partial<SceneData['camera']>
  const objects = (Array.isArray(source.objects) ? source.objects : []).map((item, index): SceneObject => {
    const object = (item ?? {}) as Partial<SceneObject>
    return {
      id: typeof object.id === 'string' && object.id !== '' ? object.id : `scene-${String(index)}`,
      name: typeof object.name === 'string' ? object.name : '',
      color: typeof object.color === 'string' && object.color !== '' ? object.color : '#34D399',
      ...(typeof object.imageResourceId === 'string' && object.imageResourceId !== '' ? { imageResourceId: object.imageResourceId } : {}),
      description: typeof object.description === 'string' ? object.description : '',
      x: sceneNum(object.x, 0), y: sceneNum(object.y, 0), z: sceneNum(object.z, 0),
      rx: sceneNum(object.rx, 0), ry: sceneNum(object.ry, 0), rz: sceneNum(object.rz, 0),
      scale: Number.isFinite(Number(object.scale)) && Number(object.scale) > 0 ? Number(object.scale) : 1,
    }
  })
  return { version: 1, objects, camera: { yaw: sceneNum(camera.yaw, -18), pitch: sceneNum(camera.pitch, 12), zoom: Number(camera.zoom) > 0 ? Number(camera.zoom) : 1 } }
}

/** 通用 3D 视口：CSS 3D 变换、拖拽旋转、滚轮缩放；对象检查器复用表单控件。 */
export function SceneWidget({ module, t, send, imageUrl }: WidgetProps & { readonly imageUrl: (resourceId: string) => string }) {
  const initial = useMemo(() => scene(module.widget?.data), [module.widget?.data])
  const [data, setData] = useState(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState({ yaw: initial.camera.yaw, pitch: initial.camera.pitch, zoom: initial.camera.zoom })
  const drag = useRef<{ x: number, y: number, yaw: number, pitch: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setData(initial); setView({ yaw: initial.camera.yaw, pitch: initial.camera.pitch, zoom: initial.camera.zoom }) }, [initial])
  const selected = data.objects.find(object => object.id === selectedId)
  const commit = (next: SceneData): void => {
    setData(next)
    void send({ kind: 'set_widget_data', moduleId: module.id, widget: 'scene', data: { version: 1, kind: 'scene', noven: next } })
  }
  const patch = (objectId: string, change: Partial<SceneObject>): void => {
    commit({ ...data, objects: data.objects.map(object => object.id === objectId ? { ...object, ...change } : object) })
  }
  const add = (): void => {
    const object: SceneObject = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `scene-${String(Date.now())}`,
      name: '', color: '#34D399', description: '', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1,
    }
    setSelectedId(object.id)
    commit({ ...data, objects: [...data.objects, object] })
  }
  const remove = (objectId: string): void => {
    setSelectedId(null)
    commit({ ...data, objects: data.objects.filter(object => object.id !== objectId) })
  }
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('.nv-scene-card') !== null) return
    drag.current = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (drag.current === null) return
    setView({
      ...view,
      yaw: drag.current.yaw + (event.clientX - drag.current.x) * .35,
      pitch: Math.max(-75, Math.min(75, drag.current.pitch - (event.clientY - drag.current.y) * .3)),
    })
  }
  const pointerUp = (): void => { drag.current = null }
  return (
    <div className="nv-scene" ref={rootRef}>
      <div className="nv-scene-toolbar">
        <span>{fmt(t, 'scene.count', { n: data.objects.length })}</span>
        <span className="nv-scene-hint">{t('scene.hint')}</span>
        <button type="button" onClick={() => setView({ yaw: -18, pitch: 12, zoom: 1 })}>{t('scene.reset')}</button>
        <button type="button" onClick={() => { const root = rootRef.current; if (root === null) return; void (document.fullscreenElement === null ? root.requestFullscreen() : document.exitFullscreen()) }}>{t('scene.fullscreen')}</button>
        <button type="button" className="nv-scene-add" onClick={add}>＋ {t('scene.add')}</button>
      </div>
      <div className="nv-scene-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => setSelectedId(null)}
        onWheel={event => { event.preventDefault(); setView(current => ({ ...current, zoom: Math.max(.45, Math.min(2.2, current.zoom - event.deltaY * .0015)) })) }}>
        <div className="nv-scene-stage" style={{ transform: `rotateX(${String(view.pitch)}deg) rotateY(${String(view.yaw)}deg) scale(${String(view.zoom)})` }}>
          {data.objects.map(object => (
            <button key={object.id} type="button"
              className={`nv-scene-card${selectedId === object.id ? ' is-on' : ''}`}
              style={{
                background: object.color,
                transform: `translate(-50%,-50%) translate3d(${String(object.x)}px,${String(object.y)}px,${String(object.z)}px) rotateX(${String(object.rx)}deg) rotateY(${String(object.ry)}deg) rotateZ(${String(object.rz)}deg) scale(${String(object.scale)})`,
              }}
              onClick={event => { event.stopPropagation(); setSelectedId(object.id) }}>
              {object.imageResourceId !== undefined ? <img src={imageUrl(object.imageResourceId)} alt="" /> : null}
              <b>{object.name === '' ? t('scene.unnamed') : object.name}</b>
              {object.description !== '' && <small>{object.description}</small>}
            </button>
          ))}
          {data.objects.length === 0 && <div className="nv-scene-empty">{t('scene.empty')}</div>}
        </div>
      </div>
      {selected !== undefined && (
        <div className="nv-scene-inspector">
          <div className="nv-scene-inspectorhead">
            <b>{selected.name === '' ? t('scene.unnamed') : selected.name}</b>
            <button type="button" onClick={() => remove(selected.id)}>{t('scene.delete')}</button>
          </div>
          <div className="nv-scene-fields">
            <label><span>{t('scene.name')}</span><CollFieldInput value={selected.name} onCommit={value => patch(selected.id, { name: value })} /></label>
            {(['x', 'y', 'z', 'rx', 'ry', 'rz', 'scale'] as const).map(key => (
              <label key={key}><span>{key}</span><CollFieldInput value={String(selected[key])} numeric onCommit={value => patch(selected.id, { [key]: Number(value) || 0 })} /></label>
            ))}
            <label><span>{t('scene.color')}</span><input type="color" value={selected.color} onChange={event => patch(selected.id, { color: event.target.value })} /></label>
          </div>
          <label className="nv-scene-desc"><span>{t('scene.description')}</span><CollFieldArea value={selected.description} onCommit={value => patch(selected.id, { description: value })} /></label>
        </div>
      )}
    </div>
  )
}

// ---------- 人物关系图 ----------

const REL_W = 760
const REL_H = 680
const REL_R = 41
/** 有头像的节点：132×150 的卡片 + 72 的圆头像。 */
const REL_AVATAR = 72
const REL_AVATAR_CARD_H = 150
const REL_AVATAR_TOP = -REL_AVATAR_CARD_H / 2 + 8

/** 未摆位节点的确定性圆形布局（渲染层补位，不落库；拖到才写回）。 */
function circlePos(index: number, total: number): { x: number, y: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  return { x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.34 }
}

/** 人物关系图：SVG 节点 + 连线；拖节点摆位，点节点/线编辑。 */
export function RelationWidget({ module, t, send, imageUrl }: WidgetProps & { readonly imageUrl?: (resourceId: string) => string }) {
  const data = useMemo(() => rel(module.widget?.data), [module.widget?.data])
  const svgRef = useRef<SVGSVGElement | null>(null)
  /** 就地编辑单例（新建人物/人物/边三选一）；linking 是连线交互态，不是面板。 */
  const [panel, setPanel] = useState<{ kind: 'add' } | { kind: 'node', id: string } | { kind: 'edge', id: string } | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string, x: number, y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const movedRef = useRef(false)

  const posOf = useCallback((node: RelNode, index: number): { x: number, y: number } => {
    if (drag?.id === node.id) return { x: drag.x, y: drag.y }
    if (node.x !== null && node.y !== null) return { x: node.x, y: node.y }
    return circlePos(index, data.nodes.length)
  }, [drag, data.nodes.length])

  const positions = useMemo(() => new Map(data.nodes.map((node, i) => [node.id, posOf(node, i)])), [data.nodes, posOf])

  const svgPoint = (e: { clientX: number, clientY: number }): { x: number, y: number } => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return { x: 0.5, y: 0.5 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const commit = async (mutate: (d: RelData) => RelData): Promise<void> => {
    await send({ kind: 'set_widget_data', moduleId: module.id, widget: 'relation', data: mutate(data) })
  }

  useEffect(() => {
    if (drag === null) return
    const move = (e: MouseEvent): void => { const p = svgPoint(e); setDrag({ id: drag.id, x: p.x, y: p.y }); movedRef.current = true }
    const up = (e: MouseEvent): void => {
      const p = svgPoint(e)
      const id = drag.id
      setDrag(null)
      if (movedRef.current) {
        void commit(d => ({ ...d, nodes: d.nodes.map(n => n.id === id ? { ...n, x: p.x, y: p.y } : n) }))
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const selNode = panel?.kind === 'node' ? data.nodes.find(n => n.id === panel.id) : undefined
  const selEdge = panel?.kind === 'edge' ? data.edges.find(e => e.id === panel.id) : undefined

  return (
    <div className="nv-wg nv-relation">
      <svg ref={svgRef} className="nv-rel-canvas" viewBox={`0 0 ${REL_W} ${REL_H}`}
        style={{ transform: `scale(${zoom})`, transformOrigin: '50% 50%', transition: 'transform 160ms ease-out' }}
        onClick={() => { setPanel(null); setLinking(null) }}>
        <defs>
          <clipPath id="nv-rel-avatar-clip">
            <circle cx={0} cy={REL_AVATAR_TOP + REL_AVATAR / 2} r={REL_AVATAR / 2} />
          </clipPath>
          <marker id={`nv-rel-arrow-${module.id}`} viewBox="0 0 10 10" refX="5" refY="5"
            markerWidth="4.5" markerHeight="4.5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 Z" className="nv-rel-arrowshape" />
          </marker>
        </defs>
        {data.edges.map(edge => {
          const a = positions.get(edge.from)
          const b = positions.get(edge.to)
          if (a === undefined || b === undefined) return null
          const x1 = a.x * REL_W; const y1 = a.y * REL_H
          const x2 = b.x * REL_W; const y2 = b.y * REL_H
          const mx = x1 + (x2 - x1) * 0.58; const my = y1 + (y2 - y1) * 0.58
          return (
            <g key={edge.id} className="nv-rel-edge" onClick={e => { e.stopPropagation(); setPanel({ kind: 'edge', id: edge.id }); setLinking(null) }}>
              <polyline points={`${String(x1)},${String(y1)} ${String(mx)},${String(my)} ${String(x2)},${String(y2)}`}
                className="nv-rel-line" markerMid={`url(#nv-rel-arrow-${module.id})`} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="nv-rel-linehit" />
              {edge.label !== '' && (
                <g className="nv-rel-edgebadge">
                  <rect x={mx - (edge.label.length * 11 + 20) / 2} y={my - 22} width={edge.label.length * 11 + 20}
                    height={18} rx={9} className="nv-rel-pill" />
                  <text x={mx} y={my - 9} className="nv-rel-edgelabel" textAnchor="middle">{edge.label}</text>
                </g>
              )}
            </g>
          )
        })}
        {data.nodes.map((node, i) => {
          const p = positions.get(node.id) ?? circlePos(i, data.nodes.length)
          const cx = p.x * REL_W; const cy = p.y * REL_H
          return (
            <g key={node.id}
              className={`nv-rel-node${panel?.kind === 'node' && panel.id === node.id ? ' nv-rel-node-on' : ''}${linking !== null && linking !== node.id ? ' nv-rel-node-linkable' : ''}`}
              transform={`translate(${cx},${cy})`}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDrag({ id: node.id, x: p.x, y: p.y }); movedRef.current = false }}
              onClick={e => {
                e.stopPropagation()
                if (movedRef.current) return
                if (linking !== null && linking !== node.id) {
                  // 连完直接开边编辑面板补关系名——不用原生 prompt。
                  const id = mint()
                  const from = linking
                  setLinking(null)
                  setPanel({ kind: 'edge', id })
                  void commit(d => ({ ...d, edges: [...d.edges, { id, from, to: node.id, label: '' }] }))
                  return
                }
                setPanel({ kind: 'node', id: node.id })
              }}>
              {(() => {
                const withAvatar = node.avatar !== undefined && imageUrl !== undefined
                const cardH = withAvatar ? REL_AVATAR_CARD_H : node.note === '' ? REL_R * 1.5 : REL_R * 2.1
                const avatarSize = REL_AVATAR
                const avatarTop = REL_AVATAR_TOP
                const nameY = withAvatar ? avatarTop + avatarSize + 24 : node.note === '' ? 5 : -4
                return (
                  <>
                    <rect x={-REL_R * 1.6} y={-cardH / 2} width={REL_R * 3.2} height={cardH} rx={12} className="nv-rel-card" />
                    {withAvatar && node.avatar !== undefined && (
                      <image href={imageUrl(node.avatar)} x={-avatarSize / 2} y={avatarTop}
                        width={avatarSize} height={avatarSize} clipPath="url(#nv-rel-avatar-clip)" preserveAspectRatio="xMidYMid slice" />
                    )}
                    <text y={nameY} className="nv-rel-name" textAnchor="middle">{node.name}</text>
                    {node.note !== '' && (
                      <text y={nameY + 20} className="nv-rel-note" textAnchor="middle">
                        {node.note.length > 10 ? `${node.note.slice(0, 10)}…` : node.note}
                      </text>
                    )}
                  </>
                )
              })()}
            </g>
          )
        })}
        {data.nodes.length === 0 && (
          <text x={REL_W / 2} y={REL_H / 2} className="nv-rel-empty" textAnchor="middle">{t('wg.rel.empty')}</text>
        )}
      </svg>
      <div className="nv-rel-legend">
        <span><i className="nv-rel-dot nv-rel-dot-person" />{t('wg.rel.legend.person')}</span>
        <span><i className="nv-rel-dot nv-rel-dot-faction" />{t('wg.rel.legend.faction')}</span>
      </div>
      <div className="nv-rel-zoom">
        <button type="button" className="nv-rel-zoomb" aria-label={t('wg.rel.zoomOut')}
          onClick={() => setZoom(prev => Math.max(0.5, Math.round(prev / 1.2 * 10) / 10))}>−</button>
        <span className="nv-rel-zoomval">{Math.round(zoom * 100)}%</span>
        <button type="button" className="nv-rel-zoomb" aria-label={t('wg.rel.zoomIn')}
          onClick={() => setZoom(prev => Math.min(2, Math.round(prev * 1.2 * 10) / 10))}>＋</button>
        <button type="button" className="nv-rel-zoomb nv-rel-zoomfit" onClick={() => setZoom(1)}>{t('wg.rel.fit')}</button>
      </div>
      <div className="nv-wg-actions">
        <button type="button" className="nv-wg-add" onClick={() => setPanel({ kind: 'add' })}>＋ {t('wg.rel.addPerson')}</button>
        {linking !== null && <span className="nv-wg-hint">{t('wg.rel.linkHint')}</span>}
      </div>
      {panel?.kind === 'add' && (
        <NodeForm t={t}
          onCancel={() => setPanel(null)}
          onSubmit={async ({ name, note }) => {
            const index = data.nodes.length
            const p = circlePos(index, index + 1)
            await commit(d => ({ ...d, nodes: [...d.nodes, { id: mint(), name, note, x: p.x, y: p.y }] }))
            setPanel(null)
          }} />
      )}
      {panel?.kind === 'node' && selNode !== undefined && (
        <NodeForm t={t} node={selNode}
          onCancel={() => setPanel(null)}
          onDelete={async () => {
            await commit(d => ({
              ...d,
              nodes: d.nodes.filter(n => n.id !== selNode.id),
              edges: d.edges.filter(e => e.from !== selNode.id && e.to !== selNode.id),
            }))
            setPanel(null)
          }}
          onLink={() => { setLinking(selNode.id); setPanel(null) }}
          onSubmit={async ({ name, note }) => {
            await commit(d => ({ ...d, nodes: d.nodes.map(n => n.id === selNode.id ? { ...n, name, note } : n) }))
            setPanel(null)
          }} />
      )}
      {panel?.kind === 'edge' && selEdge !== undefined && (
        <EdgeForm t={t} edge={selEdge}
          onCancel={() => setPanel(null)}
          onDelete={async () => {
            await commit(d => ({ ...d, edges: d.edges.filter(e => e.id !== selEdge.id) }))
            setPanel(null)
          }}
          onSubmit={async label => {
            await commit(d => ({ ...d, edges: d.edges.map(e => e.id === selEdge.id ? { ...e, label } : e) }))
            setPanel(null)
          }} />
      )}
    </div>
  )
}

function NodeForm({ t, node, onSubmit, onDelete, onLink, onCancel }: {
  readonly t: ShellT
  readonly node?: RelNode
  readonly onSubmit: (v: { name: string, note: string }) => Promise<void>
  readonly onDelete?: () => Promise<void>
  readonly onLink?: () => void
  readonly onCancel: () => void
}) {
  const [name, setName] = useState(node?.name ?? '')
  const [note, setNote] = useState(node?.note ?? '')
  return (
    <EditPanel title={t('wg.rel.person')} onClose={onCancel}>
      <input className="nv-wg-input" value={name} placeholder={t('wg.field.title')} autoFocus
        onChange={e => setName(e.target.value)} />
      <input className="nv-wg-input" value={note} placeholder={t('wg.rel.note')}
        onChange={e => setNote(e.target.value)} />
      <div className="nv-wg-actions">
        {onDelete !== undefined && <button type="button" className="nv-wg-del" onClick={() => void onDelete()}>{t('wg.del')}</button>}
        <span className="nv-wg-spacer" />
        {onLink !== undefined && <button type="button" className="nv-wg-cancel" onClick={onLink}>{t('wg.rel.linkTo')}</button>}
        <button type="button" className="nv-wg-ok" disabled={name.trim() === ''}
          onClick={() => void onSubmit({ name: name.trim(), note: note.trim() })}>{t('wg.save')}</button>
      </div>
    </EditPanel>
  )
}

function EdgeForm({ t, edge, onSubmit, onDelete, onCancel }: {
  readonly t: ShellT
  readonly edge: RelEdge
  readonly onSubmit: (label: string) => Promise<void>
  readonly onDelete: () => Promise<void>
  readonly onCancel: () => void
}) {
  const [label, setLabel] = useState(edge.label)
  return (
    <EditPanel title={t('wg.rel.edge')} onClose={onCancel}>
      <input className="nv-wg-input" value={label} placeholder={t('wg.rel.edgeLabel')} autoFocus
        onChange={e => setLabel(e.target.value)} />
      <div className="nv-wg-actions">
        <button type="button" className="nv-wg-del" onClick={() => void onDelete()}>{t('wg.del')}</button>
        <span className="nv-wg-spacer" />
        <button type="button" className="nv-wg-ok" onClick={() => void onSubmit(label.trim())}>{t('wg.save')}</button>
      </div>
    </EditPanel>
  )
}

// ---------- 集合（设计稿 06 + collection-v2 B/C） ----------

/** 集合条目字段值 → 展示文本；图片值返回 ''（卡片走 resourceId 单独渲染）。 */
export const collText = (v: CollValue | undefined): string => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return 'name' in v && typeof v.name === 'string' ? v.name : ''
  if (typeof v === 'boolean') return v ? '✓' : ''
  return String(v)
}

const formLabel = (value: string | undefined, t: ShellT, fallback: string): string => {
  if (value === undefined || value === '') return fallback
  return value.startsWith('i18n:') ? t(value.slice(5) as Parameters<ShellT>[0]) : value
}

const refValueOf = (v: CollValue | undefined): { cardId: string, name: string, itemId?: string } | undefined =>
  typeof v === 'object' && v !== null && 'cardId' in v && typeof v.cardId === 'string' && 'name' in v && typeof v.name === 'string'
    ? { cardId: v.cardId, name: v.name, ...('itemId' in v && typeof v.itemId === 'string' ? { itemId: v.itemId } : {}) }
    : undefined

/** 引用单元格里的卡 id（无引用返回 undefined）。 */
const refCardId = (v: CollValue | undefined): string | undefined =>
  typeof v === 'object' && v !== null && 'cardId' in v && typeof v.cardId === 'string' && v.cardId.length > 0 ? v.cardId : undefined

/** 分组字段：优先惯用名（类别/分类…），否则取第一个取值在 2..8 种的 text 字段。 */
const GROUP_NAMES = new Set(['类别', '分类', '分组', '类型', 'category', 'type', 'group'])
const collGroupField = (data: CollData): CollField | undefined =>
  data.fields.find(f => f.type === 'text' && GROUP_NAMES.has(f.name.toLowerCase()))

/** 分区配色环：图鉴分节小圆点用。 */
const COLL_DOTS = ['#34D399', '#60A5FA', '#F59E0B', '#A78BFA', '#F472B6', '#38BDF8', '#FB923C', '#94A3B8']

interface CollSection { readonly key: string, readonly label: string, readonly items: readonly CollItem[] }

const collSections = (data: CollData, ungrouped: string): { readonly field: CollField | undefined, readonly sections: readonly CollSection[] } => {
  const field = collGroupField(data)
  if (field === undefined) return { field, sections: [{ key: '', label: '', items: data.items }] }
  const byKey = new Map<string, CollItem[]>()
  for (const item of data.items) {
    const key = collText(data.values[item.id]?.[field.id])
    byKey.set(key, [...(byKey.get(key) ?? []), item])
  }
  const sections = [...byKey.entries()].map(([key, items]) => ({ key, label: key === '' ? ungrouped : key, items }))
  sections.sort((a, b) => (a.key === '' ? 1 : 0) - (b.key === '' ? 1 : 0))
  return { field, sections }
}

/**
 * 集合渲染器：list 表格 / cards 图鉴卡 / timeline 编年长卷。
 * 前端按数据规则定版式（分组字段、关键数字、时间轴位置），AI 只供素材与值。
 */
/** 档案视图：同一张纸的编辑态与渲染态；空白时直接是编辑态。 */
function CollProfile({ data, t, imageUrl, moduleId, send, world, ownerName }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly moduleId: string
  readonly send: WidgetSend
  readonly world?: boolean
  readonly ownerName?: string
}) {
  const item = data.items[0]
  const currentValues = item === undefined ? {} : data.values[item.id] ?? {}
  const imageField = data.fields.find(field => field.type === 'image')
  const chipsField = data.fields.find(field => field.type === 'chips')
  const quoteField = data.fields.find(field => field.name === '一句话' || field.name === '一句话背景')
  const sectionsField = data.fields.find(field => field.name === '档案' || field.name === '小节')
    ?? data.fields.find(field => field.type === 'longtext' && field.name !== quoteField?.name)
  const factNames = world === true ? ['世界类型', '尺度', '规则', '历法'] : ['身份', '年龄', '阵营', '出身']
  const factFields = factNames.flatMap(name => data.fields.filter(field => field.name === name))
  const imageOf = (values: Record<string, CollValue>): string | undefined => {
    const raw = imageField === undefined ? undefined : values[imageField.id]
    return typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string' ? raw.resourceId : undefined
  }
  const initialHasContent = item !== undefined && (
    data.fields.some(field => field.type !== 'image' && collText(currentValues[field.id]).trim() !== '')
    || imageOf(currentValues) !== undefined || item.visualKey !== null
  )
  const draftId = useRef(typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `profile-${String(Date.now())}`)
  const createdId = useRef<string | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const [pendingValues, setPendingValues] = useState<Record<string, CollValue> | undefined>(undefined)
  const [pendingImage, setPendingImage] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState<Record<string, CollValue>>(() => ({ ...currentValues }))
  const [draftImage, setDraftImage] = useState<{ readonly bytes: Uint8Array, readonly base64: string, readonly mediaType: string, readonly preview: string } | undefined>(undefined)
  const [editing, setEditing] = useState(() => item === undefined || !initialHasContent)
  const [saving, setSaving] = useState(false)
  const displayValues = editing ? draft : (pendingValues ?? currentValues)
  const savedImageId = imageOf(displayValues) ?? (item?.visualKey ?? undefined)
  const shownImage = editing ? (draftImage?.preview ?? (savedImageId === undefined ? undefined : imageUrl(savedImageId))) : (pendingImage ?? (savedImageId === undefined ? undefined : imageUrl(savedImageId)))
  const textOf = (field: CollField | undefined, values: Record<string, CollValue>): string => field === undefined ? '' : collText(values[field.id])
  const source = textOf(sectionsField, displayValues)
  const chips = textOf(chipsField, displayValues)
  const quote = textOf(quoteField, displayValues)
  const chipList = chips.split('、').map(part => part.trim()).filter(part => part !== '')
  const sections = parseProfileSections(source)
  const beginEdit = (): void => {
    setDraft({ ...(pendingValues ?? currentValues) })
    setDraftImage(undefined)
    setEditing(true)
  }
  const commitRef = useRef<() => Promise<void>>(async () => undefined)
  const commit = async (): Promise<void> => {
    if (!editing || saving) return
    const hasContent = data.fields.some(field => field.type !== 'image' && collText(draft[field.id]).trim() !== '') || draftImage !== undefined || shownImage !== undefined
    if (!hasContent) return
    setSaving(true)
    const targetId = item?.id ?? createdId.current
    let ok = true
    if (targetId === undefined) {
      ok = await send({
        kind: 'collection_add_item', moduleId,
        item: { id: draftId.current, name: ownerName ?? '' },
        values: draft,
        ...(draftImage === undefined ? {} : { imageBase64: draftImage.base64, imageMediaType: draftImage.mediaType }),
      })
      if (ok) createdId.current = draftId.current
    } else {
      const base = pendingValues ?? currentValues
      for (const field of data.fields) {
        if (field.type === 'image') continue
        const next = collText(draft[field.id])
        if (next === collText(base[field.id])) continue
        ok = await send({ kind: 'collection_set_value', moduleId, itemId: targetId, fieldId: field.id, value: draft[field.id] ?? '' })
        if (!ok) break
      }
      if (ok && draftImage !== undefined) {
        ok = await send({ kind: 'collection_set_item_image', moduleId, itemId: targetId, imageBase64: draftImage.base64, mediaType: draftImage.mediaType })
      }
    }
    if (ok) {
      setPendingValues(draft)
      setPendingImage(draftImage?.preview)
      setEditing(false)
    }
    setSaving(false)
  }
  commitRef.current = commit
  useEffect(() => {
    if (!editing) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target) === true) return
      void commitRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [editing])
  useEffect(() => {
    if (editing || pendingValues === undefined || item === undefined) return
    const same = data.fields.every(field => collText(pendingValues[field.id]) === collText(currentValues[field.id]))
    const dataImage = imageOf(currentValues) ?? item.visualKey
    if (same && (pendingImage === undefined || dataImage !== undefined)) { setPendingValues(undefined); setPendingImage(undefined) }
  }, [editing, pendingValues, item, data, currentValues])
  const commitOnBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    void commit()
  }
  const facts = factFields.map(field => ({ field, value: textOf(field, displayValues).trim() })).filter(entry => entry.value !== '')
  return (
    <div ref={rootRef}
      className={`nv-prof${world === true ? ' nv-prof-world' : ''}${editing ? ' is-editing' : ' is-rendered'}${saving ? ' is-saving' : ''}`}
      role={editing ? undefined : 'button'}
      tabIndex={editing ? undefined : 0}
      onClick={editing ? undefined : beginEdit}
      onKeyDown={editing ? undefined : event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginEdit() } }}
      onBlur={editing ? commitOnBlur : undefined}>
      <div className="nv-prof-head">
        {editing ? (
          <label className={`nv-prof-portrait${shownImage === undefined ? ' is-empty' : ''}`}>
            {shownImage === undefined ? <span>＋ {t(world === true ? 'coll.world.noCover' : 'coll.profile.noImage')}</span> : <img src={shownImage} alt="" />}
            <input type="file" accept="image/*" disabled={saving} onChange={event => {
              const file = event.target.files?.[0]
              event.currentTarget.value = ''
              if (file === undefined) return
              void (async () => {
                const bytes = new Uint8Array(await file.arrayBuffer())
                const reader = new FileReader()
                reader.onload = () => {
                  const preview = typeof reader.result === 'string' ? reader.result : ''
                  const comma = preview.indexOf(',')
                  if (comma < 0) return
                  setDraftImage({ bytes, base64: preview.slice(comma + 1), mediaType: file.type === '' ? 'image/png' : file.type, preview })
                }
                reader.readAsDataURL(file)
              })()
            }} />
          </label>
        ) : (
          <div className={`nv-prof-portrait${shownImage === undefined ? ' is-empty' : ''}`}>
            {shownImage === undefined ? <span>{t(world === true ? 'coll.world.noCover' : 'coll.profile.noImage')}</span> : <img src={shownImage} alt="" />}
          </div>
        )}
        <div className="nv-prof-main">
          <div className="nv-prof-kicker">{t(world === true ? 'coll.profile.world' : 'coll.profile.character')}</div>
          <h2 className="nv-prof-name">{((item?.name ?? ownerName ?? '').trim()) || t('coll.unnamed')}</h2>
          {editing && quoteField !== undefined && (
            <textarea className="nv-prof-editquote" rows={2} value={textOf(quoteField, draft)} disabled={saving}
              placeholder={t('coll.profile.quotePh')} aria-label={quoteField.name}
              onChange={event => setDraft(prev => ({ ...prev, [quoteField.id]: event.target.value }))} />
          )}
          {!editing && quote !== '' && <div className="nv-prof-quote">{quote}</div>}
          {editing ? (
            <div className="nv-prof-facts">
              {factFields.map(field => (
                <label key={field.id} className="nv-prof-factedit">
                  <span>{field.name}</span>
                  <input className="nv-prof-editinput" value={textOf(field, draft)} placeholder={t('coll.profile.fill')} disabled={saving}
                    aria-label={field.name}
                    onChange={event => setDraft(prev => ({ ...prev, [field.id]: event.target.value }))} />
                </label>
              ))}
            </div>
          ) : facts.length > 0 && (
            <div className="nv-prof-facts">
              {facts.map(({ field, value }) => <span key={field.id} className="nv-prof-fact"><span>{field.name}</span><b>{value}</b></span>)}
            </div>
          )}
          {editing && chipsField !== undefined && (
            <ProfileChips t={t} value={textOf(chipsField, draft)}
              onCommit={value => setDraft(prev => ({ ...prev, [chipsField.id]: value }))} />
          )}
          {!editing && chipList.length > 0 && (
            <div className="nv-prof-chips-read">{chipList.map((chip, index) => <span key={`${chip}:${String(index)}`} className="nv-prof-chip">{chip}</span>)}</div>
          )}
        </div>
      </div>
      {editing && sectionsField !== undefined && (
        <textarea className="nv-prof-editbody" value={textOf(sectionsField, draft)} disabled={saving}
          placeholder={t('coll.profile.write')} aria-label={sectionsField.name}
          onChange={event => setDraft(prev => ({ ...prev, [sectionsField.id]: event.target.value }))} />
      )}
      {!editing && sections.length > 0 && (
        <div className="nv-prof-sections">
          {sections.map((section, index) => (
            <section key={`${section.title}:${String(index)}`} className="nv-prof-section">
              {section.title !== '' && <h3>{section.title}</h3>}
              {section.body.trim() !== '' && <p>{section.body}</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** 词条编辑器：点击词条改名，行尾删除，加号新增；值以「、」分隔。 */
function ChipsEditor({ value, placeholder, onCommit }: {
  readonly value: string
  readonly placeholder: string
  readonly onCommit: (value: string) => void
}) {
  const chips = value.split('、').map(part => part.trim()).filter(part => part !== '')
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState('')
  const save = (next: readonly string[]): void => {
    const text = next.join('、')
    if (text !== value) onCommit(text)
  }
  const commitEdit = (index: number): void => {
    const next = draft.trim()
    const rest = chips.filter((_, i) => i !== index)
    if (next === '' || rest.includes(next)) save(rest)
    else save([...rest.slice(0, index), next, ...rest.slice(index)])
    setEditing(null)
    setDraft('')
  }
  const commitNew = (): void => {
    const next = fresh.trim()
    if (next !== '' && !chips.includes(next)) save([...chips, next])
    setFresh('')
    setAdding(false)
  }
  return (
    <span className="nv-coll-chips">
      {chips.map((chip, index) => editing === index ? (
        <input key={`edit:${String(index)}`} className="nv-coll-chip-edit" value={draft} autoFocus
          onChange={event => setDraft(event.target.value)}
          onBlur={() => commitEdit(index)}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            else if (event.key === 'Escape') { setEditing(null); setDraft('') }
          }} />
      ) : (
        <span key={`${chip}:${String(index)}`} className="nv-coll-chip nv-coll-chip-neutral">
          <button type="button" className="nv-coll-chipname" title={chip}
            onClick={() => { setDraft(chip); setEditing(index) }}>{chip}</button>
          <button type="button" className="nv-coll-chipx" aria-label="remove"
            onClick={() => save(chips.filter((_, i) => i !== index))}>×</button>
        </span>
      ))}
      {adding ? (
        <input className="nv-coll-chipinput" value={fresh} autoFocus placeholder={placeholder}
          onChange={event => setFresh(event.target.value)}
          onBlur={commitNew}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            else if (event.key === 'Escape') { setAdding(false); setFresh('') }
          }} />
      ) : (
        <button type="button" className="nv-coll-chipadd" aria-label={placeholder}
          onClick={() => { setFresh(''); setAdding(true) }}>＋</button>
      )}
    </span>
  )
}

/** 档案页的关键词行：直接复用词条编辑器。 */
function ProfileChips({ value, t, onCommit }: { readonly value: string, readonly t: ShellT, readonly onCommit: (value: string) => void }) {
  return <ChipsEditor value={value} placeholder={t('coll.chips.add')} onCommit={onCommit} />
}

interface ProfSection { readonly title: string, readonly body: string }

/** 档案正文：`## 小节` 分段，段内保留换行。 */
function parseProfileSections(markdown: string): ProfSection[] {
  const sections: ProfSection[] = []
  let current: { title: string, body: string } | undefined
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^#{2,3}\s*(.*)$/.exec(line)
    if (heading !== null) {
      if (current !== undefined) sections.push(current)
      current = { title: heading[1]?.trim() ?? '', body: '' }
      continue
    }
    if (current === undefined) current = { title: '', body: '' }
    current.body = current.body === '' ? line : `${current.body}\n${line}`
  }
  if (current !== undefined) sections.push(current)
  return sections.filter(section => section.title !== '' || section.body.trim() !== '')
}

interface GraphPoint { readonly x: number, readonly y: number }

/** 关系图布局：环形起步，斥力 + 连边弹簧 + 向心；坐标是画布的百分比。 */
function layoutGraph(nodes: readonly string[], edges: readonly { readonly from: string, readonly to: string }[], compact: boolean): Map<string, GraphPoint> {
  const points = nodes.map((name, index) => {
    const angle = nodes.length === 1 ? 0 : (Math.PI * 2 * index) / nodes.length - Math.PI / 2
    const radius = compact ? 34 : nodes.length <= 4 ? 22 : 30
    return { name, x: 50 + Math.cos(angle) * radius, y: 46 + Math.sin(angle) * radius * 0.92, vx: 0, vy: 0 }
  })
  const byName = new Map(points.map(point => [point.name, point]))
  const pairs = edges.flatMap(edge => {
    const a = byName.get(edge.from); const b = byName.get(edge.to)
    return a === undefined || b === undefined || a === b ? [] : [{ a, b }]
  })
  const repulsion = compact ? 150 : nodes.length > 8 ? 190 : 170
  for (let step = 0; step < 220; step += 1) {
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i]!; const b = points[j]!
        let dx = a.x - b.x; let dy = a.y - b.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.01) { dx = 0.1; dy = 0.1; dist = 0.14 }
        const push = repulsion / (dist * dist)
        a.vx += (dx / dist) * push; a.vy += (dy / dist) * push
        b.vx -= (dx / dist) * push; b.vy -= (dy / dist) * push
      }
    }
    for (const { a, b } of pairs) {
      const dx = b.x - a.x; const dy = b.y - a.y
      const dist = Math.max(0.01, Math.hypot(dx, dy))
      const pull = (dist - (compact ? 19 : 32)) * 0.015
      a.vx += (dx / dist) * pull; a.vy += (dy / dist) * pull
      b.vx -= (dx / dist) * pull; b.vy -= (dy / dist) * pull
    }
    for (const point of points) {
      point.vx += (50 - point.x) * 0.004; point.vy += (46 - point.y) * 0.004
      point.vx *= 0.82; point.vy *= 0.82
      point.x = Math.min(compact ? 90 : 84, Math.max(compact ? 10 : 16, point.x + point.vx))
      point.y = Math.min(compact ? 88 : 82, Math.max(compact ? 12 : 18, point.y + point.vy))
    }
  }
  if (compact) {
    // 紧凑胶囊：按近似尺寸做碰撞松弛，几十个人时不叠成一张网。
    const padX = 17
    const padY = 9
    for (let step = 0; step < 60; step += 1) {
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i]!; const b = points[j]!
          const dx = b.x - a.x; const dy = b.y - a.y
          const ox = padX - Math.abs(dx); const oy = padY - Math.abs(dy)
          if (ox <= 0 || oy <= 0) continue
          if (ox / padX > oy / padY) {
            const push = (ox / 2 + 0.05) * (dx < 0 ? -1 : 1)
            a.x = Math.min(90, Math.max(10, a.x - push)); b.x = Math.min(90, Math.max(10, b.x + push))
          } else {
            const push = (oy / 2 + 0.05) * (dy < 0 ? -1 : 1)
            a.y = Math.min(88, Math.max(12, a.y - push)); b.y = Math.min(88, Math.max(12, b.y + push))
          }
        }
      }
    }
  }
  return new Map(points.map(point => [point.name, { x: point.x, y: point.y }]))
}

interface PersonCandidate { readonly name: string, readonly source: string }

/** 关系端点：一个输入框同时承担输入和选择，候选按来源标注。 */
function PersonPicker({ value, candidates, placeholder, t, onChange, onCommit }: {
  readonly value: string
  readonly candidates: readonly PersonCandidate[]
  readonly placeholder: string
  readonly t: ShellT
  readonly onChange: (name: string) => void
  readonly onCommit: (name: string) => void
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { setQuery(value) }, [value])
  const place = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect()
    setAnchor(rect ?? null)
  }, [])
  useEffect(() => {
    if (!open) return
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === '' ? candidates : candidates.filter(candidate => candidate.name.toLowerCase().includes(needle))
  }, [candidates, query])
  const choose = (name: string): void => {
    setQuery(name)
    setOpen(false)
    onChange(name)
    onCommit(name)
  }
  const menu = open && anchor !== null && filtered.length > 0 ? createPortal(
    <div className={`nv-personpick-menu nv-personpick-menu-float${window.innerHeight - anchor.bottom < 220 ? ' is-up' : ''}`}
      role="listbox"
      style={{
        left: anchor.left, width: Math.max(180, anchor.width),
        top: window.innerHeight - anchor.bottom < 220 ? anchor.top - 4 : anchor.bottom + 4,
        transform: window.innerHeight - anchor.bottom < 220 ? 'translateY(-100%)' : undefined,
      }}>
      {filtered.map((candidate, index) => (
        <button key={`${candidate.source}:${candidate.name}`} type="button" role="option"
          aria-selected={index === active}
          className={`nv-personpick-option${index === active ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => choose(candidate.name)}>
          <span>{candidate.name}</span><small>{candidate.source}</small>
        </button>
      ))}
    </div>,
    document.body,
  ) : null
  return (
    <div className="nv-personpick">
      <input ref={inputRef} value={query} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); onChange(event.target.value) }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 120); onCommit(query.trim()) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault(); setOpen(true); setActive(index => Math.min(filtered.length - 1, index + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault(); setActive(index => Math.max(0, index - 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const pick = filtered[active]
            if (open && pick !== undefined) choose(pick.name)
            else { setOpen(false); onCommit(query.trim()) }
          } else if (event.key === 'Escape') {
            setOpen(false); setQuery(value)
          }
        }} />
      {menu}
    </div>
  )
}

/** 关系视图：图在上、文字行在下；行是「从—关系—到」，点人聚焦，图可缩放。 */
function CollGraph({ data, t, ownerName, ownerId, cardKind, refTargets, moduleId, send }: {
  readonly data: CollData
  readonly t: ShellT
  readonly ownerName?: string
  readonly ownerId?: string
  readonly cardKind?: string
  readonly refTargets?: readonly RefTarget[]
  readonly moduleId: string
  readonly send: WidgetSend
}) {
  const [hot, setHot] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [focus, setFocus] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  /** 空态的第一条关系：一行直接写完，不先开编辑面板；世界关系不把世界本身当实体。 */
  const emptyOwner = cardKind === 'WORLD' ? undefined : ownerName
  const [quick, setQuick] = useState({ from: emptyOwner ?? '', to: '', relation: '' })
  useEffect(() => {
    if (emptyOwner === undefined) return
    setQuick(current => current.from === '' ? { ...current, from: emptyOwner } : current)
  }, [emptyOwner])
  const editorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (editing !== null) editorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [editing])
  const fromField = data.fields.find(field => field.name === '从') ?? data.fields.find(field => field.name === '中心')
  const toField = data.fields.find(field => field.name === '到') ?? data.fields.find(field => field.name === '对象')
  const relationField = data.fields.find(field => field.name === '关系')
  const noteField = data.fields.find(field => field.name === '说明' || field.type === 'longtext')
  const rows = data.items.map(item => {
    const values = data.values[item.id]
    return {
      id: item.id,
      from: fromField === undefined ? '' : collText(values?.[fromField.id]),
      to: toField === undefined ? '' : collText(values?.[toField.id]),
      relation: relationField === undefined ? '' : collText(values?.[relationField.id]),
      note: noteField === undefined ? '' : collText(values?.[noteField.id]),
    }
  })
  const named = rows.filter(row => row.from !== '' && row.to !== '')
  const nodes = [...new Set(named.flatMap(row => [row.from, row.to]))]
  const graphCandidates: PersonCandidate[] = [...nodes]
    .sort((a, b) => a.localeCompare(b, 'zh'))
    .map(name => ({ name, source: t('coll.graph.source.graph') }))
  const seen = new Set(nodes)
  const cardSource = (kind: string): string => kind === 'WORLD'
    ? t('coll.graph.source.worlds') : t('coll.graph.source.characters')
  const cardCandidates: PersonCandidate[] = (refTargets ?? [])
    .filter(target => target.cardId !== ownerId)
    .filter(target => cardKind === 'WORLD' ? target.kind === 'WORLD' || target.kind === 'CHARACTER' : target.kind === 'CHARACTER')
    .filter(target => { if (seen.has(target.name)) return false; seen.add(target.name); return true })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map(target => ({ name: target.name, source: cardSource(target.kind) }))
  const candidates = [...graphCandidates, ...cardCandidates]
  const quickCandidates: PersonCandidate[] = emptyOwner === undefined || candidates.some(candidate => candidate.name === emptyOwner)
    ? candidates
    : [{ name: emptyOwner, source: t('coll.graph.self') }, ...candidates]
  const compact = nodes.length > 5
  const positions = layoutGraph(nodes, named, compact)
  const visible = focus === null ? named : named.filter(row => row.from === focus || row.to === focus)
  const draftRow = adding !== null && !rows.some(row => row.id === adding)
    ? {
        id: adding,
        from: fromField === undefined ? '' : (draft[fromField.id] ?? ''),
        to: toField === undefined ? '' : (draft[toField.id] ?? ''),
        relation: relationField === undefined ? '' : (draft[relationField.id] ?? ''),
        note: noteField === undefined ? '' : (draft[noteField.id] ?? ''),
      }
    : undefined
  const listRows = draftRow === undefined ? rows : [...rows, draftRow]
  const editorFields = [fromField, toField, relationField, noteField].filter((field): field is CollField => field !== undefined)
  const openEditor = (id: string): void => {
    const row = rows.find(candidate => candidate.id === id)
    if (row === undefined) return
    setHot(id)
    setEditing(id)
    setDraft({
      ...(fromField === undefined ? {} : { [fromField.id]: row.from }),
      ...(toField === undefined ? {} : { [toField.id]: row.to }),
      ...(relationField === undefined ? {} : { [relationField.id]: row.relation }),
      ...(noteField === undefined ? {} : { [noteField.id]: row.note }),
    })
  }
  const add = (): void => {
    const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `rel-${String(Date.now())}`
    setAdding(id); setEditing(id); setDraft({})
  }
  const commitQuick = (): void => {
    const from = quick.from.trim()
    const to = quick.to.trim()
    const relation = quick.relation.trim()
    if (from === '' || to === '' || relation === '') return
    const values: Record<string, CollValue> = {}
    if (fromField !== undefined) values[fromField.id] = from
    if (toField !== undefined) values[toField.id] = to
    if (relationField !== undefined) values[relationField.id] = relation
    void send({ kind: 'collection_add_item', moduleId, item: { name: from }, values })
    setQuick({ from: emptyOwner ?? '', to: '', relation: '' })
  }
  const setValue = (rowId: string, field: CollField, value: string): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId: rowId, fieldId: field.id, value })
  }
  const commitEditor = (): void => {
    if (editing !== null && editing === adding) {
      const values: Record<string, CollValue> = {}
      for (const field of editorFields) {
        const value = (draft[field.id] ?? '').trim()
        if (value !== '') values[field.id] = value
      }
      if (Object.keys(values).length > 0) {
        void send({
          kind: 'collection_add_item', moduleId, item: {
            id: editing,
            name: fromField === undefined ? '' : (draft[fromField.id] ?? '').trim(),
          }, values,
        })
      }
      setAdding(null)
    }
    setEditing(null)
  }
  const editor = editing === null || editorFields.length === 0 ? null : (
    <div className="nv-graphview-editor" ref={editorRef}>
      {editorFields.map(field => {
        const isPerson = field.id === fromField?.id || field.id === toField?.id
        return (
          <div key={field.id} className="nv-graphview-input">
            <span>{field.name}</span>
            {field.type === 'longtext'
              ? <textarea rows={2} value={draft[field.id] ?? ''} placeholder={field.name}
                onChange={e => setDraft(prev => ({ ...prev, [field.id]: e.target.value }))}
                onBlur={() => {
                  if (editing === adding) return
                  const next = (draft[field.id] ?? '').trim()
                  if (next === collText(data.values[editing]?.[field.id])) return
                  setValue(editing, field, next)
                }} />
              : isPerson ? (
                <PersonPicker value={draft[field.id] ?? ''} candidates={candidates} t={t} placeholder={field.name}
                  onChange={name => setDraft(prev => ({ ...prev, [field.id]: name }))}
                  onCommit={name => {
                    if (editing === adding) return
                    const next = name.trim()
                    if (next === collText(data.values[editing]?.[field.id])) return
                    setValue(editing, field, next)
                  }} />
              ) : (
                <input value={draft[field.id] ?? ''} placeholder={field.name}
                  onChange={e => setDraft(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onBlur={() => {
                    if (editing === adding) return
                    const next = (draft[field.id] ?? '').trim()
                    if (next === collText(data.values[editing]?.[field.id])) return
                    setValue(editing, field, next)
                  }} />
              )}
          </div>
        )
      })}
      <p className="nv-graphview-tip">{t('coll.graph.pick')}</p>
      <button type="button" className="nv-graphview-done" onClick={commitEditor}>{t('coll.graph.done')}</button>
    </div>
  )
  return (
    <div className="nv-graphview">
      <div className="nv-graphview-canvas" onClick={() => setFocus(null)}>
        <div className="nv-graphview-stage" style={{ transform: `scale(${String(zoom)})` }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <marker id={`graph-arrow-${moduleId}`} viewBox="0 0 10 10" refX="5" refY="5"
                markerWidth="4.5" markerHeight="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 10 5 L 0 10 Z" className="nv-graphview-arrowshape" />
              </marker>
            </defs>
            {visible.map(row => {
              const a = positions.get(row.from); const b = positions.get(row.to)
              if (a === undefined || b === undefined) return null
              const mx = a.x + (b.x - a.x) * 0.62
              const my = a.y + (b.y - a.y) * 0.62
              return <polyline key={row.id} points={`${String(a.x)},${String(a.y)} ${String(mx)},${String(my)} ${String(b.x)},${String(b.y)}`}
                markerMid={`url(#graph-arrow-${moduleId})`}
                className={`nv-graphview-edge${hot === row.id ? ' is-hot' : ''}`}></polyline>
            })}
          </svg>
          {visible.map(row => {
            const a = positions.get(row.from); const b = positions.get(row.to)
            if (a === undefined || b === undefined) return null
            if (hot !== row.id) return null
            return <span key={`l:${row.id}`} className={`nv-graphview-label${hot === row.id ? ' is-hot' : ''}`}
              style={{ left: `${String((a.x + b.x) / 2)}%`, top: `${String((a.y + b.y) / 2)}%` }}>
              {row.relation === '' ? '—' : row.relation}
            </span>
          })}
          {nodes.map(name => {
            const point = positions.get(name)
            if (point === undefined) return null
            const self = ownerName !== undefined && (ownerName === name || ownerName.startsWith(name))
            const related = focus === null || name === focus || visible.some(row => row.from === name || row.to === name)
            return (
              <button key={name} type="button" className={`nv-graphview-node${compact ? ' is-compact' : ''}${self ? ' is-self' : ''}${related ? '' : ' is-dim'}${focus === name ? ' is-focus' : ''}`}
                style={{ left: `${String(point.x)}%`, top: `${String(point.y)}%` }}
                onClick={e => { e.stopPropagation(); setFocus(focus === name ? null : name) }}>
                <span className="nv-graphview-mono">{name.slice(0, 1)}</span><b>{name}</b>
                {!compact && <small>{self ? t('coll.graph.self') : t(cardKind === 'WORLD' ? 'coll.graph.faction' : 'coll.graph.person')}</small>}
              </button>
            )
          })}
          {named.length === 0 && (
            <div className="nv-graphview-ghost" aria-hidden="true">
              {emptyOwner === undefined ? (
                <>
                  <span className="nv-graphview-ghostnode"><i>？</i></span>
                  <span className="nv-graphview-ghostline" />
                  <span className="nv-graphview-ghostadd">＋</span>
                  <span className="nv-graphview-ghostline" />
                  <span className="nv-graphview-ghostnode"><i>？</i></span>
                </>
              ) : (
                <>
                  <span className="nv-graphview-ghostnode">
                    <i>{emptyOwner.slice(0, 1)}</i>
                    <b>{emptyOwner}</b>
                  </span>
                  <span className="nv-graphview-ghostline" />
                  <span className="nv-graphview-ghostadd">＋</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="nv-graphview-zoom" onClick={e => e.stopPropagation()}>
          <button type="button" aria-label={t('wg.rel.zoomOut')} onClick={() => setZoom(value => Math.max(0.55, Math.round((value - 0.15) * 100) / 100))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label={t('wg.rel.zoomIn')} onClick={() => setZoom(value => Math.min(1.8, Math.round((value + 0.15) * 100) / 100))}>＋</button>
          <button type="button" className="nv-graphview-fit" onClick={() => setZoom(1)}>{t('wg.rel.fit')}</button>
        </div>
        {focus !== null && <button type="button" className="nv-graphview-clear" onClick={() => setFocus(null)}>{fmt(t, 'coll.graph.focus', { name: focus })} ×</button>}
        {named.length > 0 && <span className="nv-graphview-hint">{t('coll.graph.hint')}</span>}
      </div>
      <div className="nv-graphview-list">
        {named.length === 0 ? (
          <div className="nv-graphview-quick">
            <input list={`nv-rel-from-${moduleId}`} value={quick.from}
              placeholder={t(cardKind === 'WORLD' ? 'coll.graph.pickEntity' : 'coll.graph.pickCharacter')}
              onChange={event => setQuick(current => ({ ...current, from: event.target.value }))} />
            <datalist id={`nv-rel-from-${moduleId}`}>
              {quickCandidates.map(candidate => <option key={`${candidate.source}:${candidate.name}`} value={candidate.name} label={candidate.source} />)}
            </datalist>
            <span aria-hidden="true">→</span>
            <input value={quick.relation} placeholder={t('coll.graph.relationPh')}
              onChange={event => setQuick(current => ({ ...current, relation: event.target.value }))} />
            <span aria-hidden="true">→</span>
            <input list={`nv-rel-to-${moduleId}`} value={quick.to}
              placeholder={t(cardKind === 'WORLD' ? 'coll.graph.pickEntity' : 'coll.graph.pickCharacter')}
              onChange={event => setQuick(current => ({ ...current, to: event.target.value }))} />
            <datalist id={`nv-rel-to-${moduleId}`}>
              {quickCandidates.map(candidate => <option key={`${candidate.source}:${candidate.name}`} value={candidate.name} label={candidate.source} />)}
            </datalist>
            <button type="button" className="nv-graphview-quicksave"
              disabled={quick.from === '' || quick.to === '' || quick.relation.trim() === ''}
              onClick={commitQuick}>{t('coll.graph.save')}</button>
          </div>
        ) : (
          <>
            {listRows.map(row => (
              <Fragment key={row.id}>
                <button type="button" className={`nv-graphview-row${hot === row.id ? ' is-hot' : ''}`}
                  onClick={() => openEditor(row.id)}
                  onMouseEnter={() => setHot(row.id)} onFocus={() => setHot(row.id)}>
                  <span className="nv-graphview-pair">
                    <b className={row.from === '' ? 'is-ph' : undefined}>{row.from === '' ? t('coll.graph.fromPh') : row.from}</b>
                    <i>{row.relation === '' ? t('coll.graph.pending') : row.relation}</i>
                    <span className="nv-graphview-dir" aria-hidden="true">→</span>
                    <b className={row.to === '' ? 'is-ph' : undefined}>{row.to === '' ? t('coll.graph.toPh') : row.to}</b>
                    {row.id !== adding && <span className="nv-graphview-chev" aria-hidden="true">›</span>}
                  </span>
                  <small>{row.note === '' ? t('coll.graph.noNote') : row.note}</small>
                </button>
                {editing === row.id && editor}
              </Fragment>
            ))}
            <button type="button" className="nv-graphview-add" onClick={add}>{t('coll.graph.add')}</button>
          </>
        )}
      </div>
    </div>
  )
}

export function CollectionWidget({ module, t, send, imageUrl, refTargets, siblings, ownerName, ownerId, cardKind, onOpenModule, places }: WidgetProps & { readonly imageUrl: (resourceId: string) => string, readonly refTargets?: readonly RefTarget[], readonly siblings?: readonly CardModuleDoc[], readonly ownerName?: string, readonly ownerId?: string, readonly cardKind?: string, readonly onOpenModule?: (moduleId: string) => void, readonly places?: readonly TlPlace[] }) {
  const decoded = coll(module.widget?.data)
  const presentation = decoded.presentation ?? presentationFallback(module.name)
  const data = presentation === decoded.presentation ? decoded : { ...decoded, presentation }
  const layout = presentation?.layout
  const curated = layout !== undefined && layout !== 'list' && layout !== 'collection'
  const generic = !curated
  const view = data.view === 'cards' || data.view === 'form' || data.view === 'timeline' || data.view === 'profile' || data.view === 'graph' ? data.view : 'list'
  const [openId, setOpenId] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [fieldName, setFieldName] = useState('')
  const [fieldType, setFieldType] = useState('text')
  const itemFocus = useCollectionFocus()
  const moduleFocus = useModuleLinkFocus()
  const backlink = moduleFocus !== undefined && moduleFocus.targetModuleId === module.id
    && (moduleFocus.cardId === undefined || ownerId === undefined || moduleFocus.cardId === ownerId)
    ? moduleFocus : undefined
  useEffect(() => {
    if (itemFocus === undefined || itemFocus.moduleId !== module.id) return
    if (itemFocus.cardId !== undefined && ownerId !== undefined && itemFocus.cardId !== ownerId) return
    setOpenId(itemFocus.itemId)
    clearCollectionFocus()
  }, [itemFocus, module.id, ownerId])
  const openItem = data.items.find(item => item.id === openId)
  const sourceModule = data.source === undefined ? undefined : (siblings ?? []).find(candidate =>
    candidate.id === data.source?.moduleId || candidate.name === data.source?.moduleName)
  const sourceData = sourceModule?.widget?.type === 'collection' ? coll(sourceModule.widget.data) : undefined
  const sourceItem = sourceData?.items.find(item => item.id === data.source?.itemId) ?? sourceData?.items[0]
  const sourceLabel = data.source?.label === undefined
    ? (sourceModule?.name ?? data.source?.moduleName)
    : formLabel(data.source.label, t, sourceModule?.name ?? data.source?.moduleName ?? '')
  const sourceSend = useCallback<WidgetSend>(async command => {
    if (sourceModule === undefined) return false
    return send({ ...command, moduleId: sourceModule.id })
  }, [send, sourceModule])
  const setView = (next: string): void => { void send({ kind: 'collection_set_view', moduleId: module.id, view: next }) }
  const VIEWS: readonly { readonly id: string, readonly label: string }[] = [
    { id: 'list', label: t('coll.view.list') },
    { id: 'cards', label: t('coll.view.cards') },
    { id: 'form', label: t('coll.view.form') },
    { id: 'timeline', label: t('coll.view.timeline') },
  ]
  const hasImages = data.fields.some(field => field.type === 'image')
  const hasTime = data.fields.some(field => field.type === 'date' || field.type === 'time')
  const special = view === 'profile' || view === 'graph'
  const empty = data.items.length === 0
  // Curated layouts decide their own geometry; only the generic collection keeps the view switcher.
  const views = generic && !special && !empty ? (data.items.length === 1
    ? VIEWS.filter(entry => entry.id === view)
    : VIEWS.filter(entry => entry.id === 'list' || entry.id === 'form'
      || (entry.id === 'cards' && hasImages) || (entry.id === 'timeline' && hasTime))) : []
  const showAdd = generic && !special && view !== 'cards' && !(view === 'form' && data.items.length === 1)
  // 地图现在是完整 FMG 编辑器文档；旧自定义 marker 链接先隐藏，
  // 待地理/时间线改绑 FMG markers/burgs 后再恢复。
  const mapModule: CardModuleDoc | undefined = LEGACY_MAP_LINKS
    ? (siblings ?? []).find(candidate => candidate.widget?.type === 'map')
    : undefined
  const placeField = data.fields.find(field => field.name === '地图标记' || field.name === '地点')
  const openPlaceFor = (item: CollItem): void => {
    if (mapModule === undefined) return
    const text = placeField === undefined ? '' : collText(data.values[item.id]?.[placeField.id]).trim()
    const marker = (places ?? []).find(candidate => candidate.label === text || candidate.markerId === text)
    if (marker !== undefined) {
      setPlaceFocus({ ...(ownerId === undefined ? {} : { cardId: ownerId }), mapModuleId: marker.mapModuleId, markerId: marker.markerId, ...(marker.label === undefined ? {} : { label: marker.label }), sourceModuleId: module.id, sourceModuleName: module.name, sourceItemId: item.id, sourceItemName: item.name })
    } else {
      clearPlaceFocus()
    }
    onOpenModule?.(mapModule.id)
  }
  const bindPlaceFor = (item: CollItem, marker: TlPlace): void => {
    if (mapModule === undefined) return
    if (placeField !== undefined) void send({ kind: 'collection_set_value', moduleId: module.id, itemId: item.id, fieldId: placeField.id, value: marker.label ?? marker.markerId })
    setPlaceFocus({ ...(ownerId === undefined ? {} : { cardId: ownerId }), mapModuleId: marker.mapModuleId, markerId: marker.markerId, ...(marker.label === undefined ? {} : { label: marker.label }), sourceModuleId: module.id, sourceModuleName: module.name, sourceItemId: item.id, sourceItemName: item.name })
    onOpenModule?.(mapModule.id)
  }
  const createPlaceFor = (item: CollItem): void => {
    if (mapModule === undefined) return
    const text = placeField === undefined ? '' : collText(data.values[item.id]?.[placeField.id]).trim()
    const label = text === '' ? (item.name.trim() === '' ? t('coll.unnamed') : item.name.trim()) : text
    const markerId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `mark-${String(Date.now())}`
    const focus = { ...(ownerId === undefined ? {} : { cardId: ownerId }), mapModuleId: mapModule.id, markerId, label, sourceModuleId: module.id, sourceModuleName: module.name, sourceItemId: item.id, sourceItemName: item.name }
    void send({ kind: 'map_add_marker', moduleId: mapModule.id, marker: { id: markerId, label, x: .5, y: .5 } }).then(() => {
      if (placeField !== undefined) void send({ kind: 'collection_set_value', moduleId: module.id, itemId: item.id, fieldId: placeField.id, value: label })
      setPlaceFocus(focus)
      onOpenModule?.(mapModule.id)
    })
  }
  const linkTarget = (kind: string): string | undefined => {
    if (kind === 'map') return (siblings ?? []).find(module => module.widget?.type === 'map')?.id
    if (kind === 'place') {
      const collections = (siblings ?? []).filter(module => module.widget?.type === 'collection')
      return (collections.find(module => coll(module.widget?.data).presentation?.contract === 'geography')
        ?? collections.find(module => module.name === '地理' || module.name === '地区'))?.id
    }
    if (kind === 'timeline') return (siblings ?? []).find(module => module.widget?.type === 'timeline')?.id
    if (kind === 'relation') return (siblings ?? []).find(module => module.widget?.type === 'collection' && coll(module.widget.data).view === 'graph')?.id
    if (kind === 'character' || kind === 'profile') return (siblings ?? []).find(module => module.name === '角色档案' || module.name === '基本信息')?.id
    return undefined
  }
  const linkEntries = (presentation?.links ?? []).flatMap(kind => {
    const target = linkTarget(kind)
    const labelKey = kind === 'map' ? 'coll.link.map' : kind === 'timeline' ? 'coll.link.timeline' : kind === 'relation' ? 'coll.link.relation' : kind === 'character' || kind === 'profile' ? 'coll.link.character' : kind === 'place' ? 'coll.link.place' : undefined
    return labelKey === undefined ? [] : [{ kind, target, label: t(labelKey as Parameters<ShellT>[0]) }]
  })
  const followLink = (entry: { readonly kind: string, readonly target?: string }): void => {
    if (entry.target === undefined) {
      const spec = entry.kind === 'character' || entry.kind === 'profile'
        ? { name: '角色档案', preset: 'profile' }
        : entry.kind === 'timeline' ? { name: '时间线', preset: 'timeline' }
          : entry.kind === 'relation' ? { name: '关系', preset: 'graph' }
            : { name: '地图', preset: 'map' }
      void send({ kind: 'add_module', name: spec.name, preset: spec.preset })
      return
    }
    setModuleLinkFocus({ ...(ownerId === undefined ? {} : { cardId: ownerId }), targetModuleId: entry.target, sourceModuleId: module.id, sourceModuleName: module.name })
    onOpenModule?.(entry.target)
  }
  const mapBanner = mapModule === undefined ? undefined : (
    <GeographyBanner t={t} mapModule={mapModule}
      placeCount={(places ?? []).filter(place => place.mapModuleId === mapModule.id).length}
      onOpen={onOpenModule === undefined ? undefined : () => onOpenModule(mapModule.id)} />
  )
  const addItem = (result: DraftResult): Promise<boolean> => send({
    kind: 'collection_add_item', moduleId: module.id,
    item: { name: result.name }, values: result.values,
    ...(result.image === undefined ? {} : {
      imageBase64: result.image.base64, imageMediaType: result.image.mediaType,
    }),
  })
  const sendItemImage = async (itemId: string, file: File): Promise<void> => {
    const base64 = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        const comma = dataUrl.indexOf(',')
        resolve(comma < 0 ? '' : dataUrl.slice(comma + 1))
      }
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
    if (base64 === '') return
    await send({
      kind: 'collection_set_item_image', moduleId: module.id, itemId, imageBase64: base64,
      mediaType: file.type === '' ? 'image/png' : file.type,
    })
  }
  const draftLayout = layout ?? 'collection'
  const commitDraft = async (result: DraftResult): Promise<boolean> => {
    const ok = await addItem(result)
    if (ok) setDraftOpen(false)
    return ok
  }
  const emptyDraft = <CollDraftCard layout={draftLayout} data={data} t={t} onCreate={addItem} />
  const addDraft = <CollDraftCard layout={draftLayout} data={data} t={t} onCreate={commitDraft}
    onCancel={() => setDraftOpen(false)} />
  // Curated layouts always show one live blank instance at the end; it is the empty state and the add affordance.
  const liveDraft = <CollDraftCard layout={draftLayout} data={data} t={t} onCreate={addItem} resetOnCreate requireName />
  const dossierLayouts = new Set(['atlas', 'heraldry', 'bestiary', 'magazine', 'armory', 'skillSheet', 'gallery'])
  const dossierImageLabel = layout === 'heraldry' ? t('coll.image.emblem')
    : layout === 'bestiary' ? t('coll.image.portrait')
      : layout === 'magazine' || layout === 'atlas' ? t('coll.image.scene')
        : layout === 'armory' ? t('coll.image.item') : undefined
  const dossier = openItem !== undefined && dossierLayouts.has(layout ?? '') ? (
    <CollDossier data={data} item={openItem} t={t} moduleId={module.id} imageUrl={imageUrl} send={send}
      onClose={() => setOpenId(null)} links={linkEntries} onFollowLink={followLink} onImage={sendItemImage}
      {...(dossierImageLabel === undefined ? {} : { imageLabel: dossierImageLabel })} />
  ) : undefined
  const banner = openItem === undefined ? mapBanner : undefined
  const renderCurated = (): ReactNode => {
    if (dossier !== undefined) return dossier
    switch (layout) {
      case 'profile':
        return <CollProfile data={data} t={t} imageUrl={imageUrl} moduleId={module.id} send={send} ownerName={ownerName}
          world={cardKind === 'WORLD' || data.fields.some(field => ['世界类型', '尺度', '历法', '灵气', '规则'].includes(field.name))} />
      case 'graph':
        return <CollGraph data={data} t={t} ownerName={ownerName} ownerId={ownerId} cardKind={cardKind}
          refTargets={refTargets} moduleId={module.id} send={send} />
      case 'gallery':
        return <CollGallery data={data} t={t} imageUrl={imageUrl} moduleId={module.id} send={send} onOpen={setOpenId} />
      case 'atlas':
        return <CollAtlas data={data} t={t} imageUrl={imageUrl} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={<CollAtlasDraft data={data} t={t} onCreate={addItem} />}
          places={places} onOpenPlace={mapModule === undefined ? undefined : openPlaceFor}
          onBindPlace={mapModule === undefined ? undefined : bindPlaceFor}
          onCreatePlace={mapModule === undefined ? undefined : createPlaceFor} />
      case 'heraldry':
        return <CollHeraldry data={data} t={t} imageUrl={imageUrl} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={liveDraft} />
      case 'bestiary':
        return <CollBestiary data={data} t={t} imageUrl={imageUrl} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={liveDraft} />
      case 'magazine':
        return <CollMagazine data={data} t={t} imageUrl={imageUrl} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={liveDraft} />
      case 'armory':
        return <CollArmory data={data} t={t} imageUrl={imageUrl} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={liveDraft} />
      case 'skillSheet':
        return <CollSkillSheet data={data} t={t} moduleName={module.name} onOpen={setOpenId}
          onAdd={() => undefined} draft={liveDraft} />
      case 'rulebook':
        return <CollRulebook data={data} t={t} moduleId={module.id} send={send} onCreate={addItem} />
      case 'quoteWall':
        return <CollQuoteWall data={data} t={t} moduleId={module.id} send={send} onCreate={addItem} />
      case 'multiForm':
        return <CollMultiForm data={data} t={t} moduleId={module.id} send={send} imageUrl={imageUrl}
          sourceData={sourceData} sourceItem={sourceItem} onImage={sendItemImage} onCreate={addItem}
          {...(onOpenModule === undefined || sourceModule === undefined ? {} : { onOpenSource: () => onOpenModule(sourceModule.id) })} />
      default:
        return <CollCards data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId}
          moduleId={module.id} send={send} moduleName={module.name} onAdd={() => setDraftOpen(true)} draft={liveDraft}
          places={places} onOpenPlace={mapModule === undefined ? undefined : openPlaceFor}
          onBindPlace={mapModule === undefined ? undefined : bindPlaceFor} onCreatePlace={mapModule === undefined ? undefined : createPlaceFor}
          sourceData={sourceData} sourceItem={sourceItem} />
    }
  }
  if (empty && generic && view !== 'graph' && view !== 'profile') {
    return (
      <div className={`nv-coll nv-coll-first${layout === undefined ? '' : ` nv-coll-layout-${layout}`}`} data-layout={layout}>
        {(sourceModule !== undefined || sourceLabel !== undefined) && (
          <div className="nv-coll-source nv-coll-firstsource">
            <span>↳ {fmt(t, 'coll.sourceRef', { label: sourceLabel ?? '' })}</span>
            {sourceModule !== undefined && onOpenModule !== undefined && (
              <button type="button" onClick={() => onOpenModule(sourceModule.id)}>{t('coll.sourceOpen')}</button>
            )}
          </div>
        )}
        <div className="nv-coll-main"><div className="nv-coll-drafts">{emptyDraft}</div></div>
      </div>
    )
  }
  return (
    <div className={`nv-coll${generic && views.length <= 1 && !showAdd ? ' nv-coll-noactions' : ''}${layout === undefined ? '' : ` nv-coll-layout-${layout}`}${curated ? ' nv-coll-curated' : ''}`} data-layout={layout}>
      {presentation?.contract === 'geography' && banner}
      <div className="nv-coll-main">
        {generic && !special && !empty && <div className="nv-coll-fieldbar"><button type="button" className="nv-coll-fieldtoggle" onClick={() => setFieldsOpen(value => !value)}>{t('coll.fields')}</button></div>}
        {generic && fieldsOpen && (
          <div className="nv-coll-fieldspanel">
            {data.fields.map(field => (
              <div key={field.id} className="nv-coll-fieldrow">
                <input defaultValue={field.name} onBlur={event => {
                  const name = event.target.value.trim()
                  if (name !== '' && name !== field.name) void send({ kind: 'collection_update_field', moduleId: module.id, id: field.id, patch: { name } })
                }} />
                <select value={field.type} onChange={event => { void send({ kind: 'collection_update_field', moduleId: module.id, id: field.id, patch: { type: event.target.value } }) }}>
                  {['text', 'longtext', 'chips', 'image', 'number', 'place', 'person', 'date', 'time', 'link'].map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <button type="button" onClick={() => { if (window.confirm(fmt(t, 'coll.fields.removeConfirm', { name: field.name }))) void send({ kind: 'collection_remove_field', moduleId: module.id, id: field.id }) }}>×</button>
              </div>
            ))}
            <div className="nv-coll-fieldrow nv-coll-fieldadd">
              <input value={fieldName} placeholder={t('coll.fields.namePh')} onChange={event => setFieldName(event.target.value)} />
              <select value={fieldType} onChange={event => setFieldType(event.target.value)}>
                {['text', 'longtext', 'chips', 'image', 'number', 'place', 'person', 'date', 'time', 'link'].map(type => <option key={type} value={type}>{type}</option>)}
              </select>
              <button type="button" disabled={fieldName.trim() === ''} onClick={() => { const name = fieldName.trim(); if (name === '') return; void send({ kind: 'collection_add_field', moduleId: module.id, field: { name, type: fieldType } }); setFieldName('') }}>＋</button>
            </div>
          </div>
        )}
        {generic && backlink !== undefined && (
          <div className="nv-coll-backlink">
            <button type="button" onClick={() => { clearModuleLinkFocus(); onOpenModule?.(backlink.sourceModuleId) }}>← {t('coll.link.back')} {backlink.sourceModuleName}</button>
          </div>
        )}
        {generic && !empty && view !== 'profile' && linkEntries.length > 0 && (
          <div className="nv-coll-links">
            {linkEntries.map(entry => (
              <button key={`${entry.kind}:${entry.target ?? 'missing'}`} type="button"
                className={`nv-coll-link${entry.target === undefined ? ' is-missing' : ''}`}
                onClick={() => followLink(entry)}>
                {entry.target === undefined ? fmt(t, 'coll.link.missing', { label: entry.label }) : `${entry.label} →`}
              </button>
            ))}
          </div>
        )}
        {generic && (views.length > 1 || showAdd) && (
          <div className="nv-coll-bar">
            {views.length > 1 && (
              <span className="nv-coll-views">
                {views.map(v => (
                  <button key={v.id} type="button"
                    className={`nv-coll-view${view === v.id ? ' nv-coll-view-on' : ''}`}
                    onClick={() => setView(v.id)}>{v.label}</button>
                ))}
              </span>
            )}
            {showAdd && (
              <button type="button" className="nv-coll-add" onClick={() => setDraftOpen(true)}>＋ {t('coll.add')}</button>
            )}
          </div>
        )}
        {generic && (sourceModule !== undefined || sourceLabel !== undefined) && (
          <div className="nv-coll-source">↳ {fmt(t, 'coll.sourceRef', { label: sourceLabel ?? '' })}{sourceItem === undefined ? '' : ` · ${sourceItem.name}`}</div>
        )}
        {curated ? renderCurated() : (
          <>
            {view === 'profile' && <CollProfile data={data} t={t} imageUrl={imageUrl} moduleId={module.id} send={send}
              ownerName={ownerName}
              world={cardKind === 'WORLD' || data.fields.some(field => ['世界类型', '尺度', '历法', '灵气', '规则'].includes(field.name))} />}
            {view === 'graph' && <CollGraph data={data} t={t} ownerName={ownerName} ownerId={ownerId} cardKind={cardKind}
              refTargets={refTargets} moduleId={module.id} send={send} />}
            {view === 'list' && <CollList data={data} t={t} moduleId={module.id} send={send} onOpen={setOpenId}
              draftCard={draftOpen ? addDraft : undefined}
              {...(refTargets === undefined ? {} : { refTargets })} />}
            {view === 'cards' && <CollCards data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId}
              moduleId={module.id} send={send} moduleName={module.name} onAdd={() => setDraftOpen(true)} draft={draftOpen ? addDraft : undefined}
              places={places} onOpenPlace={mapModule === undefined ? undefined : openPlaceFor}
              onBindPlace={mapModule === undefined ? undefined : bindPlaceFor} onCreatePlace={mapModule === undefined ? undefined : createPlaceFor}
              sourceData={sourceData} sourceItem={sourceItem} />}
            {view === 'form' && draftOpen && <div className="nv-coll-listdraft">{addDraft}</div>}
            {view === 'form' && <CollForm data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId}
              moduleId={module.id} send={send} refTargets={refTargets} />}
            {view === 'timeline' && draftOpen && <div className="nv-coll-listdraft">{addDraft}</div>}
            {view === 'timeline' && <CollScroll data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId} />}
          </>
        )}
        {generic && openItem !== undefined && (
          <CollDetail data={data} item={openItem} t={t} moduleId={module.id} imageUrl={imageUrl}
            send={send} refTargets={refTargets} onClose={() => setOpenId(null)} presentation={data.presentation}
            places={places} onOpenPlace={mapModule === undefined ? undefined : openPlaceFor}
            sourceData={sourceData} sourceItem={sourceItem} sourceSend={sourceSend}
            {...(onOpenModule === undefined || sourceModule === undefined ? {} : { onOpenSource: () => onOpenModule(sourceModule.id) })} />
        )}
      </div>
    </div>
  )
}

/** Shared lookup helpers for the reading-family renderers. */
const collFieldOf = (data: CollData, name: string): CollField | undefined => data.fields.find(field => field.name === name)
const collValueOf = (data: CollData, item: CollItem, ...names: readonly string[]): string => {
  for (const name of names) {
    const field = collFieldOf(data, name)
    const value = field === undefined ? '' : collText(data.values[item.id]?.[field.id]).trim()
    if (value !== '') return value
  }
  return ''
}
const collImageOf = (data: CollData, item: CollItem): string | undefined => {
  if (item.visualKey !== null) return item.visualKey
  const field = data.fields.find(field => field.type === 'image')
  const raw = field === undefined ? undefined : data.values[item.id]?.[field.id]
  return typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string' ? raw.resourceId : undefined
}
/** Place binding control shared by atlas/cards: view, bind, or create on map. */
function CollPlaceAction({ data, item, t, places, onOpenPlace, onBindPlace, onCreatePlace }: {
  readonly data: CollData; readonly item: CollItem; readonly t: ShellT
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (item: CollItem) => void
  readonly onBindPlace?: (item: CollItem, marker: TlPlace) => void
  readonly onCreatePlace?: (item: CollItem) => void
}) {
  const field = data.fields.find(candidate => candidate.name === '地图标记' || candidate.name === '地点')
  if (field === undefined || onOpenPlace === undefined) return null
  const text = collText(data.values[item.id]?.[field.id]).trim()
  const marker = (places ?? []).find(place => place.label === text || place.markerId === text)
  if (marker !== undefined) {
    return <button type="button" className="nv-coll-placelink" onClick={event => { event.stopPropagation(); onOpenPlace(item) }}>{t('coll.map.open')}</button>
  }
  return <select className="nv-coll-placebind" defaultValue="" onClick={event => event.stopPropagation()}
    onChange={event => {
      const value = event.target.value
      if (value === '__create__') { onCreatePlace?.(item); return }
      const chosen = (places ?? []).find(place => place.markerId === value)
      if (chosen !== undefined) onBindPlace?.(item, chosen)
    }}>
    <option value="">{text === '' ? t('coll.map.bind') : fmt(t, 'coll.map.missing', { name: text })}</option>
    {(places ?? []).map(place => <option key={place.markerId} value={place.markerId}>{place.label ?? place.markerId}</option>)}
    <option value="__create__">{t('coll.map.create')}</option>
  </select>
}

const CollReadAdd = ({ t, moduleName, onAdd }: { readonly t: ShellT, readonly moduleName: string, readonly onAdd: () => void }) => (
  <button type="button" className="nv-read-add" onClick={onAdd}>
    <span>＋</span><b>{fmt(t, 'coll.addLabel', { name: moduleName })}</b>
  </button>
)

/** 地理页的地图对象：显真实地图模块名与地点数，不画假地名。 */
function GeographyBanner({ t, mapModule, placeCount, onOpen }: {
  readonly t: ShellT
  readonly mapModule?: CardModuleDoc
  readonly placeCount: number
  readonly onOpen?: () => void
}) {
  return <section className="nv-geo-banner" aria-label={t('coll.link.map')}>
    <span className="nv-geo-banner-grid" aria-hidden="true" />
    <span className="nv-geo-banner-info">
      <span className="nv-geo-banner-icon" aria-hidden="true">{glyph.map(15)}</span>
      <span>
        <b>{mapModule?.name ?? t('coll.link.map')}</b>
        <small>{mapModule === undefined ? t('coll.map.unlinked') : placeCount === 0 ? t('ov.blank') : fmt(t, 'coll.map.places', { count: placeCount })}</small>
      </span>
    </span>
    {mapModule !== undefined && onOpen !== undefined && (
      <button type="button" className="nv-geo-banner-open" onClick={onOpen}>{t('coll.map.openMap')} →</button>
    )}
  </section>
}


/** 地理空白卡：新增面和空态共用同一张最终卡；文字就地改，图片只预览，卡外失焦才整张落库。 */
function CollAtlasDraft({ data, t, onCreate, onCancel }: {
  readonly data: CollData
  readonly t: ShellT
  readonly onCreate: (result: DraftResult) => Promise<boolean>
  readonly onCancel?: () => void
}) {
  const [values, setValues] = useState<Record<string, CollValue>>({})
  const [image, setImage] = useState<{ readonly base64: string, readonly mediaType: string, readonly preview: string } | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const created = useRef(false)
  const cancelled = useRef(false)
  const cardRef = useRef<HTMLElement>(null)
  const imageField = data.fields.find(field => field.type === 'image')
  const nameField = data.fields.find(field => field.name === '名称' && field.type === 'text')
    ?? data.fields.find(field => field.type === 'text')
  const metaFields = data.fields.filter(field => field.type !== 'image' && field.type !== 'longtext' && field.id !== nameField?.id).slice(0, 3)
  const noteField = data.fields.find(field => field.type === 'longtext')
  const text = (field: CollField): string => collText(values[field.id])
  const create = async (): Promise<void> => {
    const hasContent = Object.values(values).some(value => collText(value).trim() !== '') || image !== undefined
    if (created.current || cancelled.current || saving || !hasContent) return
    const preferred = nameField === undefined ? '' : text(nameField).trim()
    if (nameField !== undefined && preferred === '') return
    const firstText = data.fields.find(field => field.type === 'text' && collText(values[field.id]).trim() !== '')
    created.current = true
    setSaving(true)
    const ok = await onCreate({
      name: preferred !== '' ? preferred : firstText === undefined ? '' : collText(values[firstText.id]).trim(),
      values,
      ...(image === undefined ? {} : { image: { base64: image.base64, mediaType: image.mediaType } }),
    })
    if (!ok) { created.current = false; setSaving(false); return }
    setValues({})
    setImage(undefined)
    created.current = false
    setSaving(false)
  }
  const pickImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const preview = typeof reader.result === 'string' ? reader.result : ''
      const comma = preview.indexOf(',')
      if (comma < 0) return
      setImage({ base64: preview.slice(comma + 1), mediaType: file.type === '' ? 'image/jpeg' : file.type, preview })
    }
    reader.readAsDataURL(file)
  }
  const commitRef = useRef(create)
  commitRef.current = create
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target) === true) return
      void commitRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [])
  return <article ref={cardRef} className="nv-atlas-card nv-atlas-edit"
    onBlur={event => {
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      void create()
    }}>
    <label className="nv-atlas-visual nv-atlas-edit-visual">
      {image === undefined ? <span>＋ {imageField?.name ?? t('coll.image.scene')}</span> : <img src={image.preview} alt="" />}
      <input type="file" accept="image/*" disabled={saving} onChange={event => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (file !== undefined) pickImage(file)
      }} />
    </label>
    <div className="nv-atlas-body">
      <input className="nv-atlas-edit-name" value={nameField === undefined ? '' : text(nameField)} disabled={saving}
        aria-label={nameField?.name ?? t('coll.unnamed')}
        placeholder={t('coll.geo.namePh')}
        onChange={event => { if (nameField !== undefined) setValues(prev => ({ ...prev, [nameField.id]: event.target.value })) }} />
      {metaFields.length > 0 && <div className="nv-atlas-meta nv-atlas-edit-meta">
        {metaFields.map(field => (
          <label key={field.id}>
            <span>{field.name}</span>
            <input value={text(field)} aria-label={field.name} placeholder="—" disabled={saving}
              onChange={event => setValues(prev => ({ ...prev, [field.id]: event.target.value }))} />
          </label>
        ))}
      </div>}
      {noteField !== undefined && <textarea className="nv-atlas-edit-note" rows={2} value={text(noteField)} disabled={saving}
        aria-label={noteField.name}
        placeholder={t('coll.geo.notePh')}
        onChange={event => setValues(prev => ({ ...prev, [noteField.id]: event.target.value }))} />}
    </div>
    {onCancel !== undefined && (
      <button type="button" className="nv-atlas-edit-cancel" aria-label={t('create.cancel')}
        onClick={() => { cancelled.current = true; onCancel() }}>×</button>
    )}
  </article>
}


/** 集合草稿的共享生命周期：本地值/图片、卡外 pointerdown 提交、失败可重试。 */
function useCollDraft({ data, onCreate, onCancel, seed, resetOnCreate, requireName, contentFields, nameFallback }: {
  readonly data: CollData
  readonly onCreate: (result: DraftResult) => Promise<boolean>
  readonly onCancel?: () => void
  /** 新草稿的初始字段值；分类筛选下新增规则时预填当前分类。 */
  readonly seed?: Record<string, CollValue>
  /** 常驻空白条目（规则/语录）提交成功后清空自身，继续等下一条。 */
  readonly resetOnCreate?: boolean
  /** 标题/语录为空时不落库，避免把分类或场景当成条目名。 */
  readonly requireName?: boolean
  /** 只有这些字段算“有内容”；分类预填不算，避免空白规则被误创建。 */
  readonly contentFields?: readonly (string | undefined)[]
  /** 标题为空时从正文取的兜底名（规则允许先写正文）。 */
  readonly nameFallback?: (values: Record<string, CollValue>) => string
}) {
  const [values, setValues] = useState<Record<string, CollValue>>(() => ({ ...(seed ?? {}) }))
  const [image, setImage] = useState<{ readonly base64: string, readonly mediaType: string, readonly preview: string } | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const created = useRef(false)
  const cancelled = useRef(false)
  const cardRef = useRef<HTMLElement>(null)
  const nameField = data.fields.find(field => ['名称', '姓名', '语录'].includes(field.name) && field.type === 'text')
    ?? data.fields.find(field => field.type === 'text')
  const text = (field: CollField | undefined): string => field === undefined ? '' : collText(values[field.id])
  const submit = async (): Promise<void> => {
    const relevant = contentFields === undefined
      ? Object.values(values)
      : contentFields.flatMap(id => id === undefined ? [] : [values[id]])
    const hasContent = relevant.some(value => collText(value).trim() !== '') || image !== undefined
    if (created.current || cancelled.current || saving || !hasContent) return
    const preferred = text(nameField).trim()
    if (requireName === true && nameField !== undefined && preferred === '') return
    const fallback = nameFallback?.(values).trim() ?? ''
    const firstText = data.fields.find(field => field.type === 'text' && collText(values[field.id]).trim() !== '')
    created.current = true
    setSaving(true)
    const ok = await onCreate({
      name: preferred !== '' ? preferred : fallback !== '' ? fallback : firstText === undefined ? '' : collText(values[firstText.id]).trim(),
      values,
      ...(image === undefined ? {} : { image: { base64: image.base64, mediaType: image.mediaType } }),
    })
    if (!ok) { created.current = false; setSaving(false); return }
    if (resetOnCreate === true) {
      setValues({ ...(seed ?? {}) })
      setImage(undefined)
      created.current = false
      setSaving(false)
    }
  }
  const commitRef = useRef(submit)
  commitRef.current = submit
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && cardRef.current?.contains(target) === true) return
      void commitRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [])
  const cancel = (): void => { cancelled.current = true; onCancel?.() }
  const pickImage = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      const preview = typeof reader.result === 'string' ? reader.result : ''
      const comma = preview.indexOf(',')
      if (comma < 0) return
      setImage({ base64: preview.slice(comma + 1), mediaType: file.type === '' ? 'image/jpeg' : file.type, preview })
    }
    reader.readAsDataURL(file)
  }
  return {
    values, setValues, image, pickImage, saving, cardRef, submit, cancel, nameField,
    setField: (field: CollField, value: CollValue): void => setValues(prev => ({ ...prev, [field.id]: value })),
    blur: (event: FocusEvent<HTMLElement>): void => {
      const next = event.relatedTarget
      if (next instanceof Node && event.currentTarget.contains(next)) return
      void submit()
    },
    text,
  }
}

/** 各集合布局自己的空白卡：共享提交生命周期，不共享一张通用表单。 */
function CollDraftCard({ layout, data, t, onCreate, onCancel, inherited, seed, resetOnCreate, requireName }: {
  readonly layout: string
  readonly data: CollData
  readonly t: ShellT
  readonly onCreate: (result: DraftResult) => Promise<boolean>
  readonly onCancel?: () => void
  readonly inherited?: readonly { readonly name: string, readonly value: string }[]
  readonly seed?: Record<string, CollValue>
  readonly resetOnCreate?: boolean
  readonly requireName?: boolean
}) {
  const draft = useCollDraft({ data, onCreate, ...(onCancel === undefined ? {} : { onCancel }), ...(seed === undefined ? {} : { seed }), ...(resetOnCreate === undefined ? {} : { resetOnCreate }), ...(requireName === undefined ? {} : { requireName }) })
  const field = (name: string): CollField | undefined => data.fields.find(candidate => candidate.name === name)
  const imageField = data.fields.find(candidate => candidate.type === 'image')
  const noteField = field('说明') ?? data.fields.find(candidate => candidate.type === 'longtext')
  const input = (target: CollField | undefined, className = 'nv-draft-input', placeholder?: string): ReactNode => target === undefined ? null : (
    <input className={className} value={draft.text(target)} aria-label={target.name}
      placeholder={placeholder ?? target.name} disabled={draft.saving}
      onChange={event => draft.setField(target, event.target.value)} />
  )
  const note = (target: CollField | undefined, className = 'nv-draft-note', placeholder?: string): ReactNode => target === undefined ? null : (
    <textarea className={className} rows={2} value={draft.text(target)} aria-label={target.name}
      placeholder={placeholder ?? target.name} disabled={draft.saving}
      onChange={event => draft.setField(target, event.target.value)} />
  )
  const mainImage = imageField !== undefined || ['heraldry', 'bestiary', 'magazine', 'armory', 'multiForm'].includes(layout)
  const imageLabel = imageField?.name
    ?? (layout === 'heraldry' ? t('coll.image.emblem')
      : layout === 'bestiary' ? t('coll.image.portrait')
        : layout === 'magazine' ? t('coll.image.scene')
          : layout === 'armory' ? t('coll.image.item')
            : layout === 'multiForm' ? t('coll.image.form') : '')
  const media = (className: string): ReactNode => mainImage ? (
    <label className={`${className} nv-draft-media`}>
      {draft.image === undefined ? <span>＋ {imageLabel}</span> : <img src={draft.image.preview} alt="" />}
      <input type="file" accept="image/*" disabled={draft.saving} onChange={event => {
        const file = event.target.files?.[0]
        event.currentTarget.value = ''
        if (file !== undefined) draft.pickImage(file)
      }} />
    </label>
  ) : null
  const name = input(draft.nameField, 'nv-draft-title', draft.nameField?.name ?? t('coll.unnamed'))
  const cancel = onCancel === undefined ? null : (
    <button type="button" className="nv-draft-cancel" aria-label={t('create.cancel')} onClick={draft.cancel}>×</button>
  )
  const article = (className: string, content: ReactNode): ReactNode => (
    <article ref={draft.cardRef} className={`${className} nv-draftcard`} onBlur={draft.blur}>
      {content}
      {cancel}
    </article>
  )
  switch (layout) {
    case 'heraldry':
      return article('nv-heraldry-card', <>
        {media('nv-heraldry-emblem')}
        {name}
        <div className="nv-draft-rows">
          {field('立场') !== undefined && <label className="nv-draft-row"><span>立场</span>{input(field('立场'), 'nv-draft-input', '')}</label>}
          {field('实力') !== undefined && <label className="nv-draft-row"><span>实力</span>{input(field('实力'), 'nv-draft-input nv-draft-num', '')}</label>}
          {field('驻地') !== undefined && <label className="nv-draft-row"><span>驻地</span>{input(field('驻地'), 'nv-draft-input', '')}</label>}
          {field('首领') !== undefined && <label className="nv-draft-row"><span>首领</span>{input(field('首领'), 'nv-draft-input', '')}</label>}
        </div>
        {noteField !== undefined && <label className="nv-draft-noterow"><span>说明</span>{note(noteField, 'nv-draft-note', '')}</label>}
      </>)
    case 'bestiary':
      return article('nv-bestiary-card', <>
        {media('nv-bestiary-portrait')}
        <div className="nv-bestiary-body">
          {name}
          <div className="nv-bestiary-facts">
            <span><small>{field('寿命')?.name ?? ''}</small>{input(field('寿命'), 'nv-draft-input nv-draft-small', '—')}</span>
            <span><small>{field('分布')?.name ?? ''}</small>{input(field('分布'), 'nv-draft-input nv-draft-small', '—')}</span>
          </div>
          {note(noteField, 'nv-draft-note nv-draft-note-inline')}
        </div>
      </>)
    case 'magazine':
      return article('nv-magazine-card', <>
        {media('nv-magazine-cover')}
        <div className="nv-magazine-body">
          {input(field('类别'), 'nv-draft-input nv-draft-kicker')}
          {name}
          {input(field('场合'), 'nv-draft-input nv-draft-small')}
          {input(field('日历'), 'nv-draft-input nv-draft-small')}
          {note(noteField, 'nv-draft-note nv-draft-note-inline')}
        </div>
      </>)
    case 'armory': {
      const rest = data.fields.filter(candidate => candidate.id !== draft.nameField?.id && candidate.id !== imageField?.id)
      return article('nv-armory-card', <>
        {media('nv-armory-visual')}
        <div className="nv-armory-body">
          {name}
          {rest.map(candidate => candidate.type === 'longtext'
            ? <Fragment key={candidate.id}>{note(candidate, 'nv-draft-note nv-draft-note-inline')}</Fragment>
            : <Fragment key={candidate.id}>{input(candidate, 'nv-draft-input nv-draft-small')}</Fragment>)}
        </div>
      </>)
    }
    case 'skillSheet':
      return article('nv-skill-card', <>
        <div className="nv-skill-head">{name}{input(field('类型'), 'nv-draft-input nv-draft-small')}</div>
        {note(field('效果') ?? noteField, 'nv-draft-note nv-draft-note-inline')}
        <div className="nv-skill-facts">
          <span><small>{field('代价')?.name ?? ''}</small>{input(field('代价'), 'nv-draft-input nv-draft-small', '—')}</span>
        </div>
      </>)
    case 'quoteWall':
      return article('nv-quote-draft', <>
        <textarea className="nv-draft-quote" rows={4} value={draft.text(draft.nameField)}
          aria-label={draft.nameField?.name ?? t('coll.unnamed')} placeholder={t('coll.quoteDraftPh')}
          disabled={draft.saving} onChange={event => { if (draft.nameField !== undefined) draft.setField(draft.nameField, event.target.value) }} />
        <div className="nv-draft-metarow">
          {input(field('场景'), 'nv-draft-input nv-draft-small')}
          {input(field('情绪'), 'nv-draft-input nv-draft-small')}
          {input(field('对象'), 'nv-draft-input nv-draft-small')}
        </div>
      </>)
    case 'rulebook':
      return article('nv-rule-draft', <>
        {input(field('类别'), 'nv-draft-input nv-draft-kicker')}
        {name}
        {note(field('说明') ?? noteField, 'nv-draft-note nv-draft-note-inline')}
        {note(field('详细说明'), 'nv-draft-note nv-draft-note-inline')}
      </>)
    case 'multiForm':
      return article('nv-coll-card nv-draft-form', <>
        {media('nv-draft-cover')}
        <div className="nv-draft-body">
          {name}
          {note(noteField, 'nv-draft-note nv-draft-note-inline')}
          {inherited !== undefined && inherited.length > 0 && (
            <div className="nv-draft-inherited">
              {inherited.map(row => <span key={row.name}>{row.name}<b>{row.value === '' ? '—' : row.value}</b></span>)}
            </div>
          )}
          <div className="nv-draft-overrides">
            {input(field('身份'), 'nv-draft-input nv-draft-small')}
            {input(field('年龄'), 'nv-draft-input nv-draft-small')}
            {input(field('阵营'), 'nv-draft-input nv-draft-small')}
            {input(field('出身'), 'nv-draft-input nv-draft-small')}
          </div>
        </div>
      </>)
    default:
      return article('nv-coll-card nv-draft-form', <>
        {media('nv-draft-cover')}
        <div className="nv-draft-body">
          {name}
          {note(noteField, 'nv-draft-note nv-draft-note-inline')}
        </div>
      </>)
  }
}


/** 规则页：分类 rail + 纸面规则条目；最后一条空白规则就是空态，不另做表单。 */
const RULE_ALL = '$all'

interface RuleGroup { readonly key: string, readonly label: string, readonly items: readonly CollItem[] }

const ruleGroups = (data: CollData, t: ShellT): readonly RuleGroup[] => {
  const field = data.fields.find(candidate => candidate.name === '类别')
  if (field === undefined) return [{ key: '', label: '', items: data.items }]
  const byKey = new Map<string, CollItem[]>()
  for (const item of data.items) {
    const key = collText(data.values[item.id]?.[field.id]).trim()
    const bucket = byKey.get(key)
    if (bucket === undefined) byKey.set(key, [item])
    else bucket.push(item)
  }
  return [...byKey.entries()]
    .map(([key, items]) => ({ key, label: key === '' ? t('coll.rule.uncategorized') : key, items }))
    .sort((a, b) => (a.key === '' ? 1 : 0) - (b.key === '' ? 1 : 0))
}

const firstLine = (value: CollValue | undefined): string => {
  const text = collText(value).trim()
  const at = text.search(/\r?\n/)
  return (at < 0 ? text : text.slice(0, at)).trim()
}

/** 常驻空白规则：title/body/detail 都在同一条目里；提交成功后清空，等下一条。 */
function CollRuleDraft({ data, t, moduleId, category, categories, index, onCreate }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly category: string
  readonly categories: readonly string[]
  readonly index: number
  readonly onCreate: (result: DraftResult) => Promise<boolean>
}) {
  const nameField = data.fields.find(field => ['名称', '姓名', '语录'].includes(field.name) && field.type === 'text')
    ?? data.fields.find(field => field.type === 'text')
  const categoryField = data.fields.find(field => field.name === '类别')
  const bodyField = data.fields.find(field => field.name === '说明')
  const detailField = data.fields.find(field => field.name === '详细说明')
  const seed = categoryField !== undefined && category !== '' ? { [categoryField.id]: category } : undefined
  const draft = useCollDraft({
    data, onCreate,
    ...(seed === undefined ? {} : { seed }),
    resetOnCreate: true,
    contentFields: [nameField?.id, bodyField?.id, detailField?.id],
    nameFallback: values => firstLine(bodyField === undefined ? undefined : values[bodyField.id])
      || firstLine(detailField === undefined ? undefined : values[detailField.id]),
  })
  const listId = `nv-rule-cats-${moduleId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  return (
    <article ref={draft.cardRef} className="nv-rule-item is-new" onBlur={draft.blur}>
      <div className="nv-rule-no">{String(index).padStart(2, '0')}</div>
      <div className="nv-rule-main">
        {categoryField !== undefined && (
          <label className="nv-rule-catline">
            <span>{t('coll.rule.category')}</span>
            <input className="nv-rule-catinput" list={listId} value={draft.text(categoryField)}
              placeholder={t('coll.rule.uncategorized')} disabled={draft.saving}
              aria-label={t('coll.rule.category')}
              onChange={event => draft.setField(categoryField, event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
            <datalist id={listId}>{categories.map(candidate => <option key={candidate} value={candidate} />)}</datalist>
          </label>
        )}
        <input className="nv-rule-titleinput" value={draft.text(nameField)} placeholder={t('coll.rule.titlePh')}
          aria-label={t('coll.rule.titlePh')} disabled={draft.saving}
          onChange={event => { if (nameField !== undefined) draft.setField(nameField, event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        {bodyField !== undefined && (
          <textarea className="nv-rule-bodyinput" rows={2} value={draft.text(bodyField)}
            placeholder={t('coll.rule.bodyPh')} aria-label={t('coll.rule.bodyPh')} disabled={draft.saving}
            onChange={event => draft.setField(bodyField, event.target.value)} />
        )}
        {detailField !== undefined && (
          <textarea className="nv-rule-detailinput" rows={1} value={draft.text(detailField)}
            placeholder={t('coll.rule.detailPh')} aria-label={t('coll.rule.detailPh')} disabled={draft.saving}
            onChange={event => draft.setField(detailField, event.target.value)} />
        )}
      </div>
    </article>
  )
}

/** 已落库的规则：标题/正文/详细说明/分类都点一下就地改。 */
function CollRuleEntry({ data, item, index, t, moduleId, send, showCategory }: {
  readonly data: CollData
  readonly item: CollItem
  readonly index: number
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly showCategory: boolean
}) {
  const values = data.values[item.id] ?? {}
  const categoryField = data.fields.find(field => field.name === '类别')
  const bodyField = data.fields.find(field => field.name === '说明')
  const detailField = data.fields.find(field => field.name === '详细说明')
  const [detailOpen, setDetailOpen] = useState(false)
  const body = bodyField === undefined ? '' : collText(values[bodyField.id])
  const detail = detailField === undefined ? '' : collText(values[detailField.id])
  const setValue = (field: CollField, value: string): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id, value })
  }
  return (
    <article className="nv-rule-item">
      <div className="nv-rule-no">{String(index).padStart(2, '0')}</div>
      <div className="nv-rule-main">
        <h2 className="nv-rule-title">
          <CollInlineText value={item.name} placeholder={t('coll.unnamed')}
            onCommit={name => void send({ kind: 'collection_update_item', moduleId, id: item.id, patch: { name } })} />
          {showCategory && categoryField !== undefined && (
            <span className="nv-rule-cat">
              <CollInlineText value={collText(values[categoryField.id])} placeholder={t('coll.rule.uncategorized')}
                onCommit={value => setValue(categoryField, value)} />
            </span>
          )}
        </h2>
        {bodyField !== undefined && (
          <div className="nv-rule-body">
            <CollInlineText value={body} placeholder={t('coll.rule.bodyPh')} multiline
              onCommit={value => setValue(bodyField, value)} />
          </div>
        )}
        {detailField !== undefined && (detail !== '' || detailOpen ? (
          <div className="nv-rule-detail">
            <CollInlineText value={detail} placeholder={t('coll.rule.detailPh')} multiline autoEdit={detailOpen}
              onCommit={value => { setDetailOpen(false); setValue(detailField, value) }} />
          </div>
        ) : (
          <button type="button" className="nv-rule-detailadd" onClick={() => setDetailOpen(true)}>{t('coll.rule.detailAdd')}</button>
        ))}
      </div>
    </article>
  )
}

/** 规则页唯一渲染器：空集合也画同一张纸，最后一条空白规则就是新增入口。 */
function CollRulebook({ data, t, moduleId, send, onCreate }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly onCreate: (result: DraftResult) => Promise<boolean>
}) {
  const groups = ruleGroups(data, t)
  const [active, setActive] = useState(RULE_ALL)
  const effective = active === RULE_ALL || groups.some(group => group.key === active) ? active : RULE_ALL
  const visible = effective === RULE_ALL ? groups : groups.filter(group => group.key === effective)
  const count = visible.reduce((total, group) => total + group.items.length, 0)
  const numbers = new Map<string, number>()
  let next = 1
  for (const group of visible) for (const item of group.items) numbers.set(item.id, next++)
  const categories = groups.map(group => group.key).filter(key => key !== '')
  return (
    <div className="nv-rulebook">
      <nav className="nv-rule-rail" aria-label={t('coll.rule.category')}>
        <span className="nv-rule-raillabel">{t('coll.rule.category')}</span>
        <button type="button" className={effective === RULE_ALL ? 'is-on' : ''} onClick={() => setActive(RULE_ALL)}>
          <span>{t('coll.rule.all')}</span><small>{data.items.length}</small>
        </button>
        {groups.filter(group => group.label !== '').map(group => (
          <button key={group.key || '$none'} type="button" className={effective === group.key ? 'is-on' : ''}
            onClick={() => setActive(group.key)}>
            <span>{group.label}</span><small>{group.items.length}</small>
          </button>
        ))}
      </nav>
      <section className="nv-rule-paper">
        {visible.map(group => (
          <section key={group.key || '$none'} className="nv-rule-group">
            {group.label !== '' && <div className="nv-rule-sectionhead">{group.label}</div>}
            {group.items.map((item, index) => (
              <CollRuleEntry key={item.id} data={data} item={item} index={numbers.get(item.id) ?? 1} t={t}
                moduleId={moduleId} send={send} showCategory={effective === RULE_ALL} />
            ))}
          </section>
        ))}
        {effective !== RULE_ALL && visible.length === 0 && <div className="nv-rule-sectionhead">{effective}</div>}
        <CollRuleDraft key={effective} data={data} t={t} moduleId={moduleId} category={effective === RULE_ALL ? '' : effective}
          categories={categories} index={count + 1} onCreate={onCreate} />
      </section>
    </div>
  )
}

/** 常驻空白语录：与落库后的引文块同一几何。 */
function CollQuoteDraft({ data, t, onCreate }: {
  readonly data: CollData
  readonly t: ShellT
  readonly onCreate: (result: DraftResult) => Promise<boolean>
}) {
  const nameField = data.fields.find(field => ['名称', '姓名', '语录'].includes(field.name) && field.type === 'text')
    ?? data.fields.find(field => field.type === 'text')
  const sceneField = data.fields.find(field => field.name === '场景')
  const moodField = data.fields.find(field => field.name === '情绪')
  const targetField = data.fields.find(field => field.name === '对象')
  const draft = useCollDraft({
    data, onCreate, resetOnCreate: true, requireName: true, contentFields: [nameField?.id],
  })
  return (
    <article ref={draft.cardRef} className="nv-quote-block is-new" onBlur={draft.blur}>
      <div className="nv-quote-mark">“</div>
      <textarea className="nv-quote-input" rows={3} value={draft.text(nameField)}
        placeholder={t('coll.quote.editPh')} aria-label={t('coll.quote.editPh')} disabled={draft.saving}
        onChange={event => { if (nameField !== undefined) draft.setField(nameField, event.target.value) }} />
      <div className="nv-quote-meta">
        {sceneField !== undefined && (
          <label><small>{t('coll.quote.scene')}</small>
            <input value={draft.text(sceneField)} placeholder={t('coll.quote.scenePh')} disabled={draft.saving}
              aria-label={t('coll.quote.scene')} onChange={event => draft.setField(sceneField, event.target.value)} />
          </label>
        )}
        {moodField !== undefined && (
          <label><small>{t('coll.quote.mood')}</small>
            <input value={draft.text(moodField)} placeholder={t('coll.quote.moodPh')} disabled={draft.saving}
              aria-label={t('coll.quote.mood')} onChange={event => draft.setField(moodField, event.target.value)} />
          </label>
        )}
        {targetField !== undefined && (
          <label><small>{t('coll.quote.target')}</small>
            <input value={draft.text(targetField)} placeholder={t('coll.quote.targetPh')} disabled={draft.saving}
              aria-label={t('coll.quote.target')} onChange={event => draft.setField(targetField, event.target.value)} />
          </label>
        )}
      </div>
    </article>
  )
}

/** 已落库的引文：句子、场景、情绪、对象点哪改哪。 */
function CollQuoteBlock({ data, item, t, moduleId, send }: {
  readonly data: CollData
  readonly item: CollItem
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
}) {
  const values = data.values[item.id] ?? {}
  const quoteField = data.fields.find(field => field.name === '语录')
  const sceneField = data.fields.find(field => field.name === '场景')
  const moodField = data.fields.find(field => field.name === '情绪')
  const targetField = data.fields.find(field => field.name === '对象')
  const quote = collText(quoteField === undefined ? undefined : values[quoteField.id]).trim() || item.name
  const setValue = (field: CollField, value: string): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id, value })
  }
  const setQuote = (value: string): void => {
    void send({ kind: 'collection_update_item', moduleId, id: item.id, patch: { name: value } })
    if (quoteField !== undefined && collText(values[quoteField.id]) !== value) setValue(quoteField, value)
  }
  return (
    <article className="nv-quote-block">
      <div className="nv-quote-mark">“</div>
      <div className="nv-quote-text">
        <CollInlineText value={quote} placeholder={t('coll.quote.editPh')} multiline onCommit={setQuote} />
      </div>
      <div className="nv-quote-meta">
        {sceneField !== undefined && (
          <span><small>{t('coll.quote.scene')}</small>
            <CollInlineText value={collText(values[sceneField.id])} placeholder={t('coll.quote.scenePh')}
              onCommit={value => setValue(sceneField, value)} />
          </span>
        )}
        {moodField !== undefined && (
          <span><small>{t('coll.quote.mood')}</small>
            <CollInlineText value={collText(values[moodField.id])} placeholder={t('coll.quote.moodPh')}
              onCommit={value => setValue(moodField, value)} />
          </span>
        )}
        {targetField !== undefined && (
          <span><small>{t('coll.quote.target')}</small>
            <CollInlineText value={collText(values[targetField.id])} placeholder={t('coll.quote.targetPh')}
              onCommit={value => setValue(targetField, value)} />
          </span>
        )}
      </div>
    </article>
  )
}

/** 引文墙唯一渲染器：空集合也只剩最后一条空白引文。 */
function CollQuoteWall({ data, t, moduleId, send, onCreate }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly onCreate: (result: DraftResult) => Promise<boolean>
}) {
  return (
    <div className="nv-quote-wall">
      {data.items.map(item => <CollQuoteBlock key={item.id} data={data} item={item} t={t} moduleId={moduleId} send={send} />)}
      <CollQuoteDraft data={data} t={t} onCreate={onCreate} />
    </div>
  )
}

/* ---------- 多形态：继承与覆写都在同一张卡上 ---------- */

const FORM_FACT_NAMES = ['身份', '年龄', '阵营', '出身'] as const

interface FormFact {
  /** 旧多形态模块可能没有覆写字段；没有时只展示继承值。 */
  readonly field?: CollField
  readonly label: string
  readonly inherited: string
  readonly value: string
}

const formFacts = (data: CollData, values: Readonly<Record<string, CollValue>>, sourceData?: CollData, sourceItem?: CollItem): readonly FormFact[] => {
  const sourceValues = sourceData === undefined || sourceItem === undefined ? {} : sourceData.values[sourceItem.id] ?? {}
  return FORM_FACT_NAMES.flatMap(name => {
    const field = data.fields.find(candidate => candidate.name === name)
    const sourceField = sourceData?.fields.find(candidate => candidate.name === name)
    if (field === undefined && sourceField === undefined) return []
    return [{
      ...(field === undefined ? {} : { field }), label: name,
      inherited: sourceField === undefined ? '' : collText(sourceValues[sourceField.id]),
      value: field === undefined ? '' : collText(values[field.id]),
    }]
  })
}

function CollMultiFormCard({ data, item, index, t, moduleId, send, imageUrl, sourceData, sourceItem, onOpenSource, onImage }: {
  readonly data: CollData
  readonly item: CollItem
  readonly index: number
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly imageUrl: (resourceId: string) => string
  readonly sourceData?: CollData
  readonly sourceItem?: CollItem
  readonly onOpenSource?: () => void
  readonly onImage?: (itemId: string, file: File) => void
  readonly imageLabel?: string
}) {
  const values = data.values[item.id] ?? {}
  const imageId = collImageOf(data, item)
  const descriptionField = data.fields.find(field => field.name === '说明') ?? data.fields.find(field => field.type === 'longtext')
  const facts = formFacts(data, values, sourceData, sourceItem)
  const setValue = (field: CollField, value: string): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id, value })
  }
  return (
    <article className="nv-form-card">
      <label className="nv-form-visual" title={t('coll.image.replace')}>
        {imageId === undefined ? <span className="nv-form-noimage">＋ {t('coll.image.form')}</span> : <img src={imageUrl(imageId)} alt="" />}
        {onImage !== undefined && <input type="file" accept="image/*" onChange={event => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (file !== undefined) onImage(item.id, file)
        }} />}
      </label>
      <div className="nv-form-main">
        <div className="nv-form-eyebrow">{t('coll.form.eyebrow')} · {String(index + 1).padStart(2, '0')}</div>
        <h2 className="nv-form-name">
          <CollInlineText value={item.name} placeholder={t('coll.form.namePh')}
            onCommit={name => void send({ kind: 'collection_update_item', moduleId, id: item.id, patch: { name } })} />
        </h2>
        {sourceItem !== undefined && <p className="nv-form-base">{fmt(t, 'coll.form.base', { name: sourceItem.name })}</p>}
        <div className="nv-form-facts">
          {facts.map(fact => (
            <div key={fact.field?.id ?? fact.label} className="nv-form-fact">
              <span className="label">{fact.label}</span>
              <span className="value">
                {fact.field === undefined ? (
                  <>
                    <span className="old">{fact.inherited === '' ? '—' : fact.inherited}</span>
                    <span className="inherit">{t('coll.form.inherit')}</span>
                    <button type="button" className="nv-form-overrideadd"
                      onClick={() => void send({ kind: 'collection_add_field', moduleId, field: { name: fact.label, type: fact.label === '年龄' ? 'number' : 'text' } })}>
                      {t('coll.form.overrideAdd')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="old">{fact.inherited === '' ? '—' : fact.inherited}</span>
                    <span className="arrow">→</span>
                    <CollInlineText value={fact.value} placeholder={sourceItem === undefined ? t('coll.cell.fill') : t('coll.form.inherit')}
                      onCommit={value => { if (fact.field !== undefined) setValue(fact.field, value) }} />
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        {descriptionField !== undefined && (
          <div className="nv-form-desc">
            <CollInlineText value={collText(values[descriptionField.id])} placeholder={t('coll.form.descPh')} multiline
              onCommit={value => setValue(descriptionField, value)} />
          </div>
        )}
        {onOpenSource !== undefined && sourceItem !== undefined && (
          <button type="button" className="nv-form-foot" onClick={onOpenSource}>{t('coll.form.openProfile')}</button>
        )}
      </div>
    </article>
  )
}

function CollMultiFormDraft({ data, t, moduleId, send, onCreate, sourceData, sourceItem }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly onCreate: (result: DraftResult) => Promise<boolean>
  readonly sourceData?: CollData
  readonly sourceItem?: CollItem
}) {
  const nameField = data.fields.find(field => field.name === '名称' && field.type === 'text')
    ?? data.fields.find(field => field.type === 'text')
  const descriptionField = data.fields.find(field => field.name === '说明') ?? data.fields.find(field => field.type === 'longtext')
  const facts = formFacts(data, {}, sourceData, sourceItem)
  const draft = useCollDraft({
    data, onCreate, resetOnCreate: true, requireName: true,
    contentFields: [nameField?.id, descriptionField?.id, ...facts.flatMap(fact => fact.field === undefined ? [] : [fact.field.id])],
  })
  return (
    <article ref={draft.cardRef} className="nv-form-card is-new" onBlur={draft.blur}>
      <label className="nv-form-visual" title={t('coll.image.replace')}>
        {draft.image === undefined ? <span className="nv-form-noimage">＋ {t('coll.image.form')}</span> : <img src={draft.image.preview} alt="" />}
        <input type="file" accept="image/*" disabled={draft.saving} onChange={event => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (file !== undefined) draft.pickImage(file)
        }} />
      </label>
      <div className="nv-form-main">
        <div className="nv-form-eyebrow">{t('coll.form.new')}</div>
        <input className="nv-form-nameinput" value={draft.text(nameField)} placeholder={t('coll.form.namePh')}
          aria-label={t('coll.form.namePh')} disabled={draft.saving}
          onChange={event => { if (nameField !== undefined) draft.setField(nameField, event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        {sourceItem !== undefined && <p className="nv-form-base">{fmt(t, 'coll.form.base', { name: sourceItem.name })}</p>}
        <div className="nv-form-facts">
          {facts.map(fact => (
            <div key={fact.field?.id ?? fact.label} className="nv-form-fact">
              <span className="label">{fact.label}</span>
              <span className="value">
                {fact.field === undefined ? (
                  <>
                    <span className="old">{fact.inherited === '' ? '—' : fact.inherited}</span>
                    <span className="inherit">{t('coll.form.inherit')}</span>
                    <button type="button" className="nv-form-overrideadd"
                      onClick={() => void send({ kind: 'collection_add_field', moduleId, field: { name: fact.label, type: fact.label === '年龄' ? 'number' : 'text' } })}>
                      {t('coll.form.overrideAdd')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="old">{fact.inherited === '' ? '—' : fact.inherited}</span>
                    <span className="arrow">→</span>
                    <input className="nv-form-factinput" value={collText(draft.values[fact.field.id])}
                      placeholder={sourceItem === undefined ? t('coll.cell.fill') : t('coll.form.inherit')}
                      aria-label={fact.label} disabled={draft.saving}
                      onChange={event => { if (fact.field !== undefined) draft.setField(fact.field, event.target.value) }} />
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        {descriptionField !== undefined && (
          <textarea className="nv-form-descinput" rows={2} value={draft.text(descriptionField)}
            placeholder={t('coll.form.descPh')} aria-label={t('coll.form.descPh')} disabled={draft.saving}
            onChange={event => draft.setField(descriptionField, event.target.value)} />
        )}
      </div>
    </article>
  )
}

/** 多形态唯一渲染器：每张卡自己写继承与覆写；最后一张空白卡就是新增入口。 */
function CollMultiForm({ data, t, moduleId, send, imageUrl, sourceData, sourceItem, onOpenSource, onImage, onCreate }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly imageUrl: (resourceId: string) => string
  readonly sourceData?: CollData
  readonly sourceItem?: CollItem
  readonly onOpenSource?: () => void
  readonly onImage?: (itemId: string, file: File) => void
  readonly onCreate: (result: DraftResult) => Promise<boolean>
}) {
  return (
    <div className="nv-formcards">
      {data.items.map((item, index) => (
        <CollMultiFormCard key={item.id} data={data} item={item} index={index} t={t} moduleId={moduleId}
          send={send} imageUrl={imageUrl} sourceData={sourceData} sourceItem={sourceItem}
          {...(onOpenSource === undefined ? {} : { onOpenSource })}
          {...(onImage === undefined ? {} : { onImage })} />
      ))}
      <CollMultiFormDraft data={data} t={t} moduleId={moduleId} send={send} onCreate={onCreate} sourceData={sourceData} sourceItem={sourceItem} />
    </div>
  )
}

/** 条目档案：读在前，点事实/正文就地改；图片可直接换。 */
function CollDossier({ data, item, t, moduleId, imageUrl, send, onClose, links, onFollowLink, onImage, imageLabel }: {
  readonly data: CollData
  readonly item: CollItem
  readonly t: ShellT
  readonly moduleId: string
  readonly imageUrl: (resourceId: string) => string
  readonly send: WidgetSend
  readonly onClose: () => void
  readonly links?: readonly { readonly kind: string, readonly target?: string, readonly label: string }[]
  readonly onFollowLink?: (entry: { readonly kind: string, readonly target?: string, readonly label: string }) => void
  readonly onImage?: (itemId: string, file: File) => void
  readonly imageLabel?: string
}) {
  const values = data.values[item.id] ?? {}
  const imageId = collImageOf(data, item)
  const imageField = data.fields.find(field => field.type === 'image')
  const imageText = imageLabel ?? imageField?.name ?? t('coll.image.replace')
  const chipsField = data.fields.find(field => field.type === 'chips')
  const kicker = chipsField === undefined ? '' : collText(values[chipsField.id]).replace(/、/g, ' · ')
  const factFields = data.fields.filter(field => field.type !== 'image' && field.type !== 'longtext' && field.type !== 'chips'
    && field.name !== '名称' && field.name !== '姓名')
  const bodyFields = data.fields.filter(field => field.type === 'longtext')
  const setValue = (field: CollField, value: string): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id, value })
  }
  return (
    <section className="nv-dossier">
      <button type="button" className="nv-dossier-back" onClick={onClose}>‹ {t('coll.dossier.back')}</button>
      <div className="nv-dossier-grid">
        <aside>
          <label className="nv-dossier-visual" title={t('coll.dossier.editImage')}>
            {imageId === undefined
              ? <span className="nv-dossier-noimage">＋ {imageText}</span>
              : <img src={imageUrl(imageId)} alt="" />}
            {onImage !== undefined && <input type="file" accept="image/*" onChange={event => {
              const file = event.target.files?.[0]
              event.currentTarget.value = ''
              if (file !== undefined) onImage(item.id, file)
            }} />}
          </label>
        </aside>
        <div className="nv-dossier-main">
          {kicker !== '' && <p className="nv-dossier-kicker">{kicker}</p>}
          <h2 className="nv-dossier-name">
            <CollInlineText value={item.name} placeholder={t('coll.unnamed')}
              onCommit={name => void send({ kind: 'collection_update_item', moduleId, id: item.id, patch: { name } })} />
          </h2>
          {factFields.length > 0 && (
            <div className="nv-dossier-facts">
              {factFields.map(field => (
                <div key={field.id} className="nv-dossier-fact">
                  <div className="label">{field.name}</div>
                  <div className="value">
                    <CollInlineText value={collText(values[field.id])} placeholder={t('coll.cell.fill')}
                      numeric={field.type === 'number' || field.type === 'time'}
                      onCommit={value => setValue(field, value)} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {bodyFields.map(field => (
            <div key={field.id} className="nv-dossier-body">
              <h4>{field.name}</h4>
              <CollInlineText value={collText(values[field.id])} placeholder={t('coll.cell.fill')} multiline
                onCommit={value => setValue(field, value)} />
            </div>
          ))}
          {links !== undefined && links.length > 0 && (
            <nav className="nv-dossier-rel" aria-label={t('coll.dossier.relations')}>
              <h4>{t('coll.dossier.relations')}</h4>
              {links.map(entry => (
                <button key={`${entry.kind}:${entry.target ?? 'missing'}`} type="button" onClick={() => onFollowLink?.(entry)}>
                  <span>{entry.target === undefined ? fmt(t, 'coll.link.missing', { label: entry.label }) : entry.label}</span>
                  <b>{t('coll.dossier.open')}</b>
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}

/** 地理：地图册式横版地点卡。 */
function CollAtlas({ data, t, imageUrl, moduleName, onOpen, onAdd, draft, places, onOpenPlace, onBindPlace, onCreatePlace }: {
  readonly data: CollData; readonly t: ShellT; readonly imageUrl: (id: string) => string
  readonly moduleName: string; readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
  readonly places?: readonly TlPlace[]; readonly onOpenPlace?: (item: CollItem) => void; readonly onBindPlace?: (item: CollItem, marker: TlPlace) => void; readonly onCreatePlace?: (item: CollItem) => void
}) {
  return <div className="nv-atlas-grid">
    {data.items.map(item => {
      const image = collImageOf(data, item)
      const terrain = collValueOf(data, item, '地貌')
      const climate = collValueOf(data, item, '气候')
      const faction = collValueOf(data, item, '主要势力')
      const note = collValueOf(data, item, '一句话', '说明')
      return <article key={item.id} className="nv-atlas-card" onClick={() => onOpen(item.id)}>
        <div className="nv-atlas-visual">{image === undefined ? <span>◇</span> : <img src={imageUrl(image)} alt="" />}</div>
        <div className="nv-atlas-body">
          <h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>
          <div className="nv-atlas-meta">
            {terrain !== '' && <span>地貌 · {terrain}</span>}
            {climate !== '' && <span>气候 · {climate}</span>}
            {faction !== '' && <span>势力 · {faction}</span>}
          </div>
          {note !== '' && <p>{note}</p>}
          <CollPlaceAction data={data} item={item} t={t} places={places} onOpenPlace={onOpenPlace} onBindPlace={onBindPlace} onCreatePlace={onCreatePlace} />
        </div>
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 势力：方形徽记墙。 */
function CollHeraldry({ data, t, imageUrl, moduleName, onOpen, onAdd, draft }: {
  readonly data: CollData; readonly t: ShellT; readonly imageUrl: (id: string) => string
  readonly moduleName: string; readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
}) {
  return <div className="nv-heraldry-grid">
    {data.items.map(item => {
      const image = collImageOf(data, item)
      const stance = collValueOf(data, item, '立场')
      const strength = collValueOf(data, item, '实力')
      const seat = collValueOf(data, item, '驻地')
      const leader = collValueOf(data, item, '首领')
      const note = collValueOf(data, item, '说明')
      return <article key={item.id} className="nv-heraldry-card" onClick={() => onOpen(item.id)}>
        <div className="nv-heraldry-emblem">{image === undefined ? <span>◆</span> : <img src={imageUrl(image)} alt="" />}</div>
        <h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>
        {stance !== '' && <div className="nv-heraldry-tags">{stance.split(/[、,，]/).filter(Boolean).map(tag => <span key={tag}>{tag}</span>)}</div>}
        {strength !== '' && <div className="nv-heraldry-stat"><span>实力</span><b>{strength}</b></div>}
        {seat !== '' && <small>驻地 · {seat}</small>}
        {leader !== '' && <small>首领 · {leader}</small>}
        {note !== '' && <p className="nv-heraldry-note">{note}</p>}
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 种族：竖版肖像图鉴。 */
function CollBestiary({ data, t, imageUrl, moduleName, onOpen, onAdd, draft }: {
  readonly data: CollData; readonly t: ShellT; readonly imageUrl: (id: string) => string
  readonly moduleName: string; readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
}) {
  return <div className="nv-bestiary-grid">
    {data.items.map(item => {
      const image = collImageOf(data, item)
      const lifespan = collValueOf(data, item, '寿命')
      const distribution = collValueOf(data, item, '分布')
      const traits = collValueOf(data, item, '特征')
      return <article key={item.id} className="nv-bestiary-card" onClick={() => onOpen(item.id)}>
        <div className="nv-bestiary-portrait">{image === undefined ? <span>◇</span> : <img src={imageUrl(image)} alt="" />}</div>
        <div className="nv-bestiary-body">
          <h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>
          <div className="nv-bestiary-facts">
            {lifespan !== '' && <span><small>寿命</small>{lifespan}</span>}
            {distribution !== '' && <span><small>分布</small>{distribution}</span>}
          </div>
          {traits !== '' && <p>{traits}</p>}
        </div>
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 文化：杂志式场景卡。 */
function CollMagazine({ data, t, imageUrl, moduleName, onOpen, onAdd, draft }: {
  readonly data: CollData; readonly t: ShellT; readonly imageUrl: (id: string) => string
  readonly moduleName: string; readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
}) {
  return <div className="nv-magazine-grid">
    {data.items.map(item => {
      const image = collImageOf(data, item)
      const category = collValueOf(data, item, '类别')
      const occasion = collValueOf(data, item, '场合')
      const calendar = collValueOf(data, item, '日历')
      const note = collValueOf(data, item, '说明', '一句话')
      return <article key={item.id} className="nv-magazine-card" onClick={() => onOpen(item.id)}>
        <div className="nv-magazine-cover">{image === undefined ? <span>◇</span> : <img src={imageUrl(image)} alt="" />}</div>
        <div className="nv-magazine-body">
          <div className="nv-magazine-kicker">{category === '' ? t('coll.unnamed') : category}</div>
          <h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>
          {occasion !== '' && <small>{occasion}</small>}
          {calendar !== '' && <small className="nv-magazine-cal">{calendar}</small>}
          {note !== '' && <p>{note}</p>}
        </div>
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 装备：器物陈列卡。 */
function CollArmory({ data, t, imageUrl, moduleName, onOpen, onAdd, draft }: {
  readonly data: CollData; readonly t: ShellT; readonly imageUrl: (id: string) => string
  readonly moduleName: string; readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
}) {
  return <div className="nv-armory-grid">
    {data.items.map(item => {
      const image = collImageOf(data, item)
      const kind = collValueOf(data, item, '类型')
      const effect = collValueOf(data, item, '效果', '说明')
      const owner = collValueOf(data, item, '归属')
      const detail = collValueOf(data, item, '详细说明')
      return <article key={item.id} className="nv-armory-card" onClick={() => onOpen(item.id)}>
        <div className="nv-armory-visual">{image === undefined ? <span>◇</span> : <img src={imageUrl(image)} alt="" />}</div>
        <div className="nv-armory-body">
          <h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>
          {kind !== '' && <div className="nv-armory-kind">{kind}</div>}
          {effect !== '' && <p>{effect}</p>}
          {detail !== '' && <p className="nv-armory-detail">{detail}</p>}
          {owner !== '' && <small>归属 · {owner}</small>}
        </div>
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 能力：技能表，效果与代价/冷却并排。 */
function CollSkillSheet({ data, t, moduleName, onOpen, onAdd, draft }: {
  readonly data: CollData; readonly t: ShellT; readonly moduleName: string
  readonly onOpen: (id: string) => void; readonly onAdd: () => void
  readonly draft?: ReactNode
}) {
  return <div className="nv-skillsheet">
    {data.items.map(item => {
      const kind = collValueOf(data, item, '类型')
      const effect = collValueOf(data, item, '效果', '说明')
      const cost = collValueOf(data, item, '代价')
      const cooldown = collValueOf(data, item, '冷却')
      const detail = collValueOf(data, item, '详细说明')
      return <article key={item.id} className="nv-skill-card" onClick={() => onOpen(item.id)}>
        <div className="nv-skill-head"><h3>{item.name === '' ? t('coll.unnamed') : item.name}</h3>{kind !== '' && <span>{kind}</span>}</div>
        {effect !== '' && <p>{effect}</p>}
        {detail !== '' && <p className="nv-skill-detail">{detail}</p>}
        <div className="nv-skill-facts">
          {cost !== '' && <span><small>代价</small>{cost}</span>}
          {cooldown !== '' && <span><small>冷却</small>{cooldown}</span>}
        </div>
      </article>
    })}
    {draft ?? <CollReadAdd t={t} moduleName={moduleName} onAdd={onAdd} />}
  </div>
}

/** 图集：瀑布流 + 灯箱 + 拖图上传；图片是唯一主角。 */
function CollGallery({ data, t, imageUrl, moduleId, send, onOpen }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly moduleId: string
  readonly send: WidgetSend
  readonly onOpen: (id: string) => void
}) {
  const imageField = data.fields.find(field => field.type === 'image')
  const titleField = data.fields.find(field => field.name === '标题' || field.name === '名称')
  const descriptionField = data.fields.find(field => field.name === '说明' || field.name === '描述')
  const photos = data.items.flatMap(item => {
    const raw = imageField === undefined ? undefined : data.values[item.id]?.[imageField.id]
    const imageId = item.visualKey ?? (typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string' ? raw.resourceId : undefined)
    return imageId === undefined ? [] : [{ item, imageId, title: item.name, description: descriptionField === undefined ? '' : collText(data.values[item.id]?.[descriptionField.id]) }]
  })
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const upload = (files: FileList | readonly File[]): void => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : ''
        const comma = dataUrl.indexOf(',')
        if (comma < 0) return
        void send({
          kind: 'collection_add_item', moduleId,
          item: { name: file.name.replace(/\.[^.]+$/, '') || t('coll.gallery.untitled') },
          imageBase64: dataUrl.slice(comma + 1),
          imageMediaType: file.type === '' ? 'image/jpeg' : file.type,
        })
      }
      reader.readAsDataURL(file)
    }
  }
  useEffect(() => {
    if (lightbox === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLightbox(null)
      if (event.key === 'ArrowLeft') setLightbox(current => current === null ? null : (current + photos.length - 1) % photos.length)
      if (event.key === 'ArrowRight') setLightbox(current => current === null ? null : (current + 1) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [lightbox, photos.length])
  const current = lightbox === null ? undefined : photos[lightbox]
  return (
    <div className={`nv-gallery${dragging ? ' is-drag' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files) }}>
      {photos.map((photo, index) => (
        <figure key={photo.item.id} className="nv-gallery-card" onClick={() => setLightbox(index)}>
          <img src={imageUrl(photo.imageId)} alt={photo.title} />
          <figcaption>
            <b>{photo.title === '' ? t('coll.unnamed') : photo.title}</b>
            {photo.description !== '' && <span>{photo.description}</span>}
          </figcaption>
        </figure>
      ))}
      <button type="button" className="nv-gallery-upload" onClick={() => fileInput.current?.click()}>
        <span>＋</span>
        <b>{t('coll.gallery.upload')}</b>
        <small>{t('coll.gallery.drop')}</small>
      </button>
      {photos.length === 0 && (
        <>
          <span className="nv-gallery-ghost" aria-hidden="true" />
          <span className="nv-gallery-ghost" aria-hidden="true" />
        </>
      )}
      <input ref={fileInput} type="file" accept="image/*" multiple hidden
        onChange={event => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; upload(files) }} />
      {current !== undefined && createPortal(
        <div className="nv-lightbox" onClick={() => setLightbox(null)}>
          <div className="nv-lightbox-inner" onClick={event => event.stopPropagation()}>
            <button type="button" className="nv-lightbox-close" onClick={() => setLightbox(null)} aria-label={t('create.cancel')}>×</button>
            <img className="nv-lightbox-img" src={imageUrl(current.imageId)} alt={current.title} />
            <div className="nv-lightbox-bar">
              <div>
                <b>{current.title === '' ? t('coll.unnamed') : current.title}</b>
                {current.description !== '' && <p>{current.description}</p>}
              </div>
              <div className="nv-lightbox-actions">
                <button type="button" onClick={() => onOpen(current.item.id)}>{t('coll.detail')}</button>
                <button type="button" disabled={photos.length <= 1} onClick={() => setLightbox(((lightbox ?? 0) + photos.length - 1) % photos.length)}>‹</button>
                <button type="button" disabled={photos.length <= 1} onClick={() => setLightbox(((lightbox ?? 0) + 1) % photos.length)}>›</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** 图鉴卡：分区标题 + 卡网格。卡 = 主图（visualKey→资源图，无图给淡色占位）+ 名 + 关键数字 + 摘要。 */
function CollCards({ data, t, imageUrl, openId, onOpen, moduleId, send, moduleName, onAdd, draft, sourceData, sourceItem, places, onOpenPlace, onBindPlace, onCreatePlace }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly openId: string | null
  readonly onOpen: (id: string | null) => void
  readonly moduleId: string
  readonly send: WidgetSend
  readonly moduleName: string
  readonly onAdd: () => void
  readonly draft?: ReactNode
  readonly sourceData?: CollData
  readonly sourceItem?: CollItem
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (item: CollItem) => void
  readonly onBindPlace?: (item: CollItem, marker: TlPlace) => void
  readonly onCreatePlace?: (item: CollItem) => void
}) {
  const { sections } = collSections(data, t('coll.ungrouped'))
  const statField = data.fields.find(f => f.type === 'number')
  const imageField = data.fields.find(f => f.type === 'image')
  const primaryLabel = data.form?.labels?.primary === undefined
    ? undefined : formLabel(data.form.labels.primary, t, t('coll.primary'))
  const addLabel = data.form?.labels?.add === undefined ? fmt(t, 'coll.addLabel', { name: moduleName }) : formLabel(data.form.labels.add, t, t('coll.add'))
  const placeField = data.fields.find(field => field.name === '地图标记' || field.name === '地点')
  const placeText = (item: CollItem): string => placeField === undefined ? '' : collText(data.values[item.id]?.[placeField.id]).trim()
  const imageIdOf = (source: CollData | undefined, item: CollItem | undefined): string | undefined => {
    if (source === undefined || item === undefined) return undefined
    if (item.visualKey !== null) return item.visualKey
    const image = source.fields.find(field => field.type === 'image')
    const raw = image === undefined ? undefined : source.values[item.id]?.[image.id]
    return typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string' ? raw.resourceId : undefined
  }
  const sourceImageId = sourceItem === undefined ? undefined : imageIdOf(sourceData, sourceItem)
  const sourceSubtitleField = sourceData?.fields.find(field => (field.type === 'text' || field.type === 'longtext')
    && sourceItem !== undefined && collText(sourceData.values[sourceItem.id]?.[field.id]) !== ''
    && collText(sourceData.values[sourceItem.id]?.[field.id]) !== sourceItem.name)
  const sourceSubtitle = sourceSubtitleField === undefined || sourceData === undefined || sourceItem === undefined
    ? '' : collText(sourceData.values[sourceItem.id]?.[sourceSubtitleField.id])
  return (
    <div className={`nv-coll-deck${data.presentation === undefined ? '' : ` nv-coll-deck-${data.presentation.layout}`}`}>
      {sections.map((section, si) => (
        <section key={section.key || '$'} className="nv-coll-sec">
          {section.label !== '' && (
            <h3 className="nv-coll-secname">
              <span className="nv-coll-dot" style={{ background: COLL_DOTS[si % COLL_DOTS.length] }} />
              {section.label}
            </h3>
          )}
          <div className="nv-coll-grid">
            {section.items.map((item, index) => {
              const stat = statField !== undefined ? data.values[item.id]?.[statField.id] : undefined
              const statText = typeof stat === 'number' ? String(stat) : collText(stat)
              const subtitleField = data.fields.find(field => (field.type === 'text' || field.type === 'longtext')
                && collText(data.values[item.id]?.[field.id]) !== ''
                && collText(data.values[item.id]?.[field.id]) !== item.name)
              const subtitle = subtitleField === undefined
                ? (item.summary === '' ? sourceSubtitle : item.summary)
                : collText(data.values[item.id]?.[subtitleField.id])
              const imageId = imageIdOf(data, item) ?? sourceImageId
              return (
                <div key={item.id} role="button" tabIndex={0}
                  className={`nv-coll-card${openId === item.id ? ' nv-coll-card-on' : ''}`}
                  onClick={() => onOpen(openId === item.id ? null : item.id)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(openId === item.id ? null : item.id) } }}>
                  {primaryLabel !== undefined && data.items[0]?.id === item.id && <span className="nv-coll-primary">{primaryLabel}</span>}
                  {primaryLabel !== undefined && data.items[0]?.id !== item.id && (
                    <button type="button" className="nv-coll-setprimary"
                      onClick={e => { e.stopPropagation(); void send({ kind: 'collection_move_item', moduleId, id: item.id }) }}>
                      {fmt(t, 'coll.setAs', { label: primaryLabel })}
                    </button>
                  )}
                  {data.presentation?.layout === 'quoteWall' ? null : imageId !== undefined ? (
                    <img className={`nv-coll-cardimg${data.cardAspect === undefined ? '' : ` nv-coll-cardimg-${data.cardAspect}`}`} src={imageUrl(imageId)} alt="" />
                  ) : (
                    <span className={`nv-coll-cardimg nv-coll-cardimg-empty${data.cardAspect === undefined ? '' : ` nv-coll-cardimg-${data.cardAspect}`}`} title={t('coll.image.pending')}>
                      {glyph.sparkle(20)}
                    </span>
                  )}
                  <span className={`nv-coll-cardname${item.name === '' ? ' is-ph' : ''}`}>{item.name === '' ? (sourceItem?.name ?? t('coll.unnamed')) : item.name}</span>
                  {subtitle !== '' && <span className="nv-coll-cardsum">{subtitle}</span>}
                  {statText !== '' && <span className="nv-coll-cardstat">{statText}</span>}
                  {onOpenPlace !== undefined && placeField !== undefined && (() => {
                    const text = placeText(item)
                    const marker = (places ?? []).find(place => place.label === text || place.markerId === text)
                    if (marker !== undefined) return (
                      <button type="button" className="nv-coll-placelink"
                        onClick={event => { event.stopPropagation(); onOpenPlace(item) }}>{t('coll.map.open')}</button>
                    )
                    return (
                      <select className="nv-coll-placebind" defaultValue="" onClick={event => event.stopPropagation()}
                        onChange={event => {
                          const value = event.target.value
                          if (value === '__create__') { onCreatePlace?.(item); return }
                          const chosen = (places ?? []).find(place => place.markerId === value)
                          if (chosen !== undefined) onBindPlace?.(item, chosen)
                        }}>
                        <option value="">{text === '' ? t('coll.map.bind') : fmt(t, 'coll.map.missing', { name: text })}</option>
                        {(places ?? []).map(place => <option key={place.markerId} value={place.markerId}>{place.label ?? place.markerId}</option>)}
                        <option value="__create__">{t('coll.map.create')}</option>
                      </select>
                    )
                  })()}
                </div>
              )
            })}
            {si === sections.length - 1 && (draft ?? (
              <button type="button"
                className={`nv-coll-addtile${data.cardAspect === undefined ? '' : ` nv-coll-addtile-${data.cardAspect}`}${data.presentation === undefined ? '' : ` nv-coll-addtile-${data.presentation.layout}`}`}
                onClick={onAdd}>
                <span className="nv-coll-addtile-plus">＋</span>
                <b>{addLabel}</b>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 表单视图：一条一张表单卡；字段本身点一下就能改，卡头只负责进详情。 */
function CollForm({ data, t, imageUrl, openId, onOpen, moduleId, send, refTargets }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly openId: string | null
  readonly onOpen: (id: string | null) => void
  readonly moduleId: string
  readonly send: WidgetSend
  readonly refTargets?: readonly RefTarget[]
}) {
  const setValue = (itemId: string, field: CollField, value: CollValue): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId, fieldId: field.id, value })
  }
  return (
    <div className="nv-coll-forms">
      {data.items.map(item => (
        <section key={item.id} className={`nv-coll-formcard${openId === item.id ? ' nv-coll-formcard-on' : ''}`}>
          <button type="button" className={`nv-coll-formhead${data.items.length === 1 ? ' nv-coll-formhead-solo' : ''}`}
            onClick={() => onOpen(openId === item.id ? null : item.id)}>
            {data.items.length > 1 && <span className="nv-coll-formname">{item.name}</span>}
            <span className="nv-coll-formedit">{t('coll.detail')}</span>
          </button>
          <div className="nv-coll-formmain">
          {(() => {
            const avatarField = data.fields.find(field => field.type === 'image')
            const avatarValue = avatarField === undefined ? undefined : data.values[item.id]?.[avatarField.id]
            const avatarId = typeof avatarValue === 'object' && avatarValue !== null && 'resourceId' in avatarValue && typeof avatarValue.resourceId === 'string'
              ? avatarValue.resourceId : undefined
            return avatarId === undefined ? null : <img className="nv-coll-formavatar" src={imageUrl(avatarId)} alt="" />
          })()}
          <div className="nv-coll-formrows">
            {data.fields.map(field => {
              const raw = data.values[item.id]?.[field.id]
              // 图片字段已由表单头部的头像承接，行内不再重复一张大图；背景句移到整幅引用块。
              if (field.type === 'image') return null
              if (field.name === '一句话' || field.name === '一句话背景') return null
              return (
                <div key={field.id} className="nv-coll-formrow">
                  <span className="nv-coll-formlabel">{field.name}</span>
                  <span className="nv-coll-formvalue">
                    <CollInlineValue field={field} raw={raw} t={t} refTargets={refTargets}
                      placeholder={t('coll.cell.fill')} onSet={value => setValue(item.id, field, value)} />
                  </span>
                </div>
              )
            })}
          </div>
          </div>
          {(() => {
            const quoteField = data.fields.find(field => field.name === '一句话' || field.name === '一句话背景')
            const quoteText = quoteField === undefined ? '' : collText(data.values[item.id]?.[quoteField.id])
            return quoteText === ''
              ? null
              : (
                <div className="nv-coll-formquote">
                  <CollInlineText value={quoteText} placeholder={t('coll.cell.fill')} multiline
                    onCommit={next => setValue(item.id, quoteField!, next)} />
                </div>
              )
          })()}
        </section>
      ))}
    </div>
  )
}

/** 立场/阵营这类短标签的色阶：正道绿、魔道红、中立灰，其余中性。 */
export const chipTone = (text: string): string => {
  if (/正道|正统|光明|秩序/.test(text)) return 'green'
  if (/魔道|邪|混乱|暗/.test(text)) return 'red'
  if (/中立|灰色/.test(text)) return 'gray'
  return 'neutral'
}

/** 单元格本地草稿：平时是文字，单击就进入输入态；回车/失焦保存。 */
function CollInlineText({ value, placeholder, multiline, numeric, onCommit, className, autoEdit }: {
  readonly value: string
  readonly placeholder: string
  readonly multiline?: boolean
  readonly numeric?: boolean
  readonly onCommit: (text: string) => void
  readonly className?: string
  /** 直接进入编辑态：用于“＋ 详细说明”这类先点后写的空字段。 */
  readonly autoEdit?: boolean
}) {
  const [editing, setEditing] = useState(autoEdit === true)
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const commit = (): void => {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }
  if (!editing) {
    return (
      <button type="button" className={`nv-coll-cell${value === '' ? ' is-ph' : ''}${className === undefined ? '' : ` ${className}`}`}
        onClick={() => { setDraft(value); setEditing(true) }}>
        {value === '' ? placeholder : value}
      </button>
    )
  }
  return multiline === true ? (
    <textarea className="nv-coll-cellinput nv-coll-cellarea" value={draft} autoFocus rows={2}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Escape') { setDraft(value); setEditing(false) }
      }} />
  ) : (
    <input className="nv-coll-cellinput" type={numeric === true ? 'number' : 'text'} value={draft} autoFocus
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
        else if (event.key === 'Escape') { setDraft(value); setEditing(false) }
      }} />
  )
}

interface DraftResult {
  readonly name: string
  readonly values: Record<string, CollValue>
  readonly image?: { readonly base64: string, readonly mediaType: string }
}

/** 引用格：始终是下拉，点一次即改。 */
function CollRefSelect({ field, raw, t, refTargets, onSet }: {
  readonly field: CollField
  readonly raw: CollValue | undefined
  readonly t: ShellT
  readonly refTargets?: readonly RefTarget[]
  readonly onSet: (value: CollValue) => void
}) {
  const current = refValueOf(raw)
  const currentKey = current === undefined ? '' : `ref:${current.itemId ?? current.cardId}`
  const targets = (refTargets ?? []).filter(target => field.type === 'person' ? target.kind === 'CHARACTER' : target.kind === 'WORLD')
  return (
    <select className="nv-coll-ref nv-coll-cellref" value={currentKey}
      onChange={event => {
        if (event.target.value.startsWith('ref:')) return
        const target = targets.find(candidate => candidate.cardId === event.target.value)
        onSet(target === undefined ? '' : { cardId: target.cardId, name: target.name })
      }}>
      {current !== undefined && <option value={currentKey}>{current.name}</option>}
      <option value="">—</option>
      {targets.map(target => <option key={target.cardId} value={target.cardId}>{target.name}</option>)}
    </select>
  )
}

/** 字段值控件：文本/数字/长文本/词条/引用各用各的直编控件。 */
function CollInlineValue({ field, raw, t, refTargets, placeholder, onSet }: {
  readonly field: CollField
  readonly raw: CollValue | undefined
  readonly t: ShellT
  readonly refTargets?: readonly RefTarget[]
  readonly placeholder: string
  readonly onSet: (value: CollValue) => void
}) {
  if (field.type === 'person' || field.type === 'place') {
    return <CollRefSelect field={field} raw={raw} t={t} refTargets={refTargets} onSet={onSet} />
  }
  const text = collText(raw)
  if (field.type === 'chips') {
    return <ChipsEditor value={text} placeholder={t('coll.chips.add')} onCommit={next => onSet(next)} />
  }
  return (
    <CollInlineText value={text} placeholder={placeholder} multiline={field.type === 'longtext'}
      numeric={field.type === 'number' || field.type === 'time'}
      onCommit={next => {
        if (field.type === 'number' || field.type === 'time') {
          const number = Number(next)
          onSet(next.trim() !== '' && Number.isFinite(number) ? number : next)
        } else onSet(next)
      }} />
  )
}

/** 名称格：单击改名，行尾 › 进详情。 */
function CollNameCell({ item, t, onRename, onOpen }: {
  readonly item: CollItem
  readonly t: ShellT
  readonly onRename: (name: string) => void
  readonly onOpen?: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  useEffect(() => { if (!editing) setDraft(item.name) }, [item.name, editing])
  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next !== '' && next !== item.name) onRename(next)
  }
  return (
    <span className="nv-coll-nameline">
      {editing ? (
        <input className="nv-coll-cellinput nv-coll-nameinput" value={draft} autoFocus
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
            else if (event.key === 'Escape') { setDraft(item.name); setEditing(false) }
          }} />
      ) : (
        <button type="button" className={`nv-coll-cell nv-coll-cellname${item.name === '' ? ' is-ph' : ''}`}
          onClick={() => { setDraft(item.name); setEditing(true) }}>
          {item.name === '' ? t('coll.unnamed') : item.name}
        </button>
      )}
      {onOpen !== undefined && (
        <button type="button" className="nv-coll-rowopen" aria-label={t('coll.detail')} title={t('coll.detail')}
          onClick={() => onOpen(item.id)}>›</button>
      )}
    </span>
  )
}

/** 列表视图：字段列 + 条目行；引用列是行内选择器，立场列是彩色芯片。 */
function CollList({ data, t, moduleId, send, refTargets, onOpen, draftCard }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly refTargets?: readonly RefTarget[]
  readonly onOpen?: (id: string) => void
  readonly draftCard?: ReactNode
}) {
  const setValue = (itemId: string, field: CollField, value: CollValue): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId, fieldId: field.id, value })
  }
  const patchItem = (itemId: string, patch: Record<string, string>): void => {
    void send({ kind: 'collection_update_item', moduleId, id: itemId, patch })
  }
  // 条目自带名称列；与条目名全等的字段（例如语录的正文）也不再重复一列。
  const columns = data.fields.filter(field => field.name !== '名称' && field.name !== 'Name'
    && data.items.some(item => collText(data.values[item.id]?.[field.id]) !== item.name))
  const showSummary = data.items.some(item => item.summary !== '')
  return (
    <>
      {draftCard !== undefined && <div className="nv-coll-listdraft">{draftCard}</div>}
    <table className="nv-coll-table">
      <thead>
        <tr>
          <th>{t('coll.col.name')}</th>
          {columns.map(f => <th key={f.id}>{f.name}</th>)}
          {showSummary && <th>{t('coll.col.summary')}</th>}
        </tr>
      </thead>
      <tbody>
        {data.items.map(item => (
          <tr key={item.id}>
            <td className="nv-coll-tdname">
              <CollNameCell item={item} t={t} onOpen={onOpen} onRename={name => patchItem(item.id, { name })} />
            </td>
            {columns.map(f => (
              <td key={f.id} data-label={f.name}>
                <CollInlineValue field={f} raw={data.values[item.id]?.[f.id]} t={t} refTargets={refTargets}
                  placeholder={t('coll.cell.fill')} onSet={value => setValue(item.id, f, value)} />
              </td>
            ))}
            {showSummary && (
              <td className="nv-coll-tdsum" data-label={t('coll.col.summary')}>
                <CollInlineText value={item.summary} placeholder={t('coll.cell.fill')}
                  onCommit={next => patchItem(item.id, { summary: next })} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
    </>
  )
}

/** 编年长卷（设计稿 C）：time 字段定轴位，条目卡挂在轴下；number 字段画底部面积曲线。 */
function CollScroll({ data, t, imageUrl, openId, onOpen }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly openId: string | null
  readonly onOpen: (id: string | null) => void
}) {
  const timeField = data.fields.find(f => f.type === 'time')
  const numField = data.fields.find(f => f.type === 'number')
  const placed = timeField === undefined ? [] : data.items
    .map(item => ({ item, at: data.values[item.id]?.[timeField.id] }))
    .filter((row): row is { item: CollItem, at: number } => typeof row.at === 'number' && Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at)
  const unplaced = data.items.filter(item => !placed.some(row => row.item.id === item.id))
  const lo = placed.length > 0 ? (placed[0]?.at ?? 0) : 0
  const hi = placed.length > 0 ? (placed[placed.length - 1]?.at ?? 1) : 1
  const span = Math.max(hi - lo, 1e-9)
  const curve = numField === undefined ? undefined : placed
    .map(row => ({ at: row.at, v: data.values[row.item.id]?.[numField.id] }))
    .filter((row): row is { at: number, v: number } => typeof row.v === 'number' && Number.isFinite(row.v))
  const vmax = Math.max(1, ...(curve ?? []).map(row => row.v))
  if (timeField === undefined || placed.length === 0) {
    return <div className="nv-coll-empty">{t('coll.noTime')}</div>
  }
  const W = 720
  const H = 44
  const pts = (curve ?? []).map(row => `${String(((row.at - lo) / span * W).toFixed(1))},${String((H - (row.v / vmax) * (H - 8)).toFixed(1))}`)
  return (
    <div className="nv-coll-scroll">
      <div className="nv-coll-axis">
        {placed.map(row => (
          <span key={row.item.id} className="nv-coll-tick" style={{ left: `${((row.at - lo) / span * 100).toFixed(2)}%` }}>
            <span className="nv-coll-ticklab">{String(row.at)}</span>
          </span>
        ))}
      </div>
      <div className="nv-coll-hang">
        {placed.map(row => (
          <button key={row.item.id} type="button"
            className={`nv-coll-hangcard${openId === row.item.id ? ' nv-coll-card-on' : ''}`}
            style={{ left: `${((row.at - lo) / span * 100).toFixed(2)}%` }}
            onClick={() => onOpen(openId === row.item.id ? null : row.item.id)}>
            {row.item.visualKey !== null && <img className="nv-coll-hangimg" src={imageUrl(row.item.visualKey)} alt="" />}
            <span className="nv-coll-hangname">{row.item.name}</span>
          </button>
        ))}
      </div>
      {curve !== undefined && curve.length >= 2 && (
        <svg className="nv-coll-curve" viewBox={`0 0 ${String(W)} ${String(H)}`} preserveAspectRatio="none">
          <polygon points={`0,${String(H)} ${pts.join(' ')} ${String(W)},${String(H)}`} className="nv-coll-curvefill" />
          <polyline points={pts.join(' ')} className="nv-coll-curveline" />
        </svg>
      )}
      {numField !== undefined && curve !== undefined && curve.length >= 2 && (
        <div className="nv-coll-curvelab">{numField.name}</div>
      )}
      {unplaced.length > 0 && (
        <div className="nv-coll-unplaced">
          <span className="nv-coll-unplacedlab">{t('coll.unplaced')}</span>
          {unplaced.map(item => (
            <button key={item.id} type="button" className="nv-coll-minirow" onClick={() => onOpen(item.id)}>{item.name}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 条目详情面板：字段可就地编辑（blur 提交），名称/摘要/正文走 update_item。 */
/** 芯片字段：回车加一枚、点 × 删一枚；存成「、」连接的字符串。 */
function ChipsField({ value, placeholder, onCommit }: {
  readonly value: string
  readonly placeholder: string
  readonly onCommit: (text: string) => void
}) {
  return <ChipsEditor value={value} placeholder={placeholder} onCommit={onCommit} />
}

function CollDetail({ data, item, t, moduleId, imageUrl, send, refTargets, onClose, sourceData, sourceItem, sourceSend, onOpenSource, presentation, places, onOpenPlace }: {
  readonly data: CollData
  readonly item: CollItem
  readonly t: ShellT
  readonly moduleId: string
  readonly imageUrl: (resourceId: string) => string
  readonly send: WidgetSend
  readonly refTargets?: readonly RefTarget[]
  readonly onClose: () => void
  readonly sourceData?: CollData
  readonly sourceItem?: CollItem
  readonly sourceSend?: WidgetSend
  readonly onOpenSource?: () => void
  readonly presentation?: CollData['presentation']
  readonly places?: readonly TlPlace[]
  readonly onOpenPlace?: (item: CollItem) => void
}) {
  const [showOptional, setShowOptional] = useState(false)
  const optionalNames = new Set(presentation?.optional ?? [])
  const hiddenOptional = data.fields.filter(field => field.type !== 'image' && optionalNames.has(field.name) && collText(data.values[item.id]?.[field.id]).trim() === '').length
  const setValue = (field: CollField, raw: string): void => {
    const current = collText(data.values[item.id]?.[field.id])
    if (raw === current) return
    const value: CollValue = (field.type === 'number' || field.type === 'time') && raw.trim() !== '' && Number.isFinite(Number(raw))
      ? Number(raw) : raw
    void send({ kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id, value })
  }
  const patchItem = (patch: Record<string, string>): void => {
    void send({ kind: 'collection_update_item', moduleId, id: item.id, patch })
  }
  const sourceImageId = ((): string | undefined => {
    if (sourceData === undefined || sourceItem === undefined) return undefined
    if (sourceItem.visualKey !== null) return sourceItem.visualKey
    const image = sourceData.fields.find(field => field.type === 'image')
    const raw = image === undefined ? undefined : sourceData.values[sourceItem.id]?.[image.id]
    return typeof raw === 'object' && raw !== null && 'resourceId' in raw && typeof raw.resourceId === 'string' ? raw.resourceId : undefined
  })()
  const imageId = item.visualKey ?? sourceImageId
  const setSourceValue = (field: CollField, raw: string): void => {
    if (sourceData === undefined || sourceItem === undefined || sourceSend === undefined) return
    const current = collText(sourceData.values[sourceItem.id]?.[field.id])
    if (raw === current) return
    const value: CollValue = (field.type === 'number' || field.type === 'time') && raw.trim() !== '' && Number.isFinite(Number(raw))
      ? Number(raw) : raw
    void sourceSend({ kind: 'collection_set_value', itemId: sourceItem.id, fieldId: field.id, value })
  }
  return (
    <div className="nv-coll-detail">
      <div className="nv-coll-detailhead">
        <CollItemName item={item} t={t} onRename={name => patchItem({ name })} />
        <button type="button" className="nv-coll-detailclose" aria-label={t('create.cancel')} onClick={onClose}>×</button>
      </div>
      {imageId !== undefined && <img className="nv-coll-detailimg" src={imageUrl(imageId)} alt="" />}
      {onOpenPlace !== undefined && data.fields.some(field => field.name === '地图标记' || field.name === '地点') && (
        <button type="button" className="nv-coll-placelink" onClick={() => onOpenPlace(item)}>
          {(() => {
            const field = data.fields.find(candidate => candidate.name === '地图标记' || candidate.name === '地点')
            const text = field === undefined ? '' : collText(data.values[item.id]?.[field.id]).trim()
            const found = (places ?? []).some(place => place.label === text || place.markerId === text)
            return found ? t('coll.map.open') : text === '' ? t('coll.map.bind') : fmt(t, 'coll.map.missing', { name: text })
          })()}
        </button>
      )}
      {sourceData !== undefined && sourceItem !== undefined && sourceSend !== undefined && (
        <div className="nv-coll-sourcebox">
          <div className="nv-coll-sourceboxhead">
            <b>{fmt(t, 'coll.sourceBase', { name: sourceItem.name })}</b>
            {onOpenSource !== undefined && <button type="button" onClick={onOpenSource}>{t('card.refOpen')}</button>}
          </div>
          <p>{t('coll.sourceBaseHint')}</p>
          <div className="nv-coll-detailgrid">
            {sourceData.fields.filter(field => field.type !== 'image' && field.name !== '档案' && field.name !== '名称' && field.name !== '姓名').map(field => {
              const value = collText(sourceData.values[sourceItem.id]?.[field.id])
              return (
                <label key={field.id} className="nv-coll-field">
                  <span className="nv-coll-fieldname">{field.name}</span>
                  {field.type === 'chips' ? (
                    <ChipsField value={value} placeholder={t('coll.chips.add')} onCommit={next => setSourceValue(field, next)} />
                  ) : field.type === 'longtext' ? (
                    <CollFieldArea value={value} onCommit={next => setSourceValue(field, next)} />
                  ) : (
                    <CollFieldInput value={value} numeric={field.type === 'number' || field.type === 'time'} onCommit={next => setSourceValue(field, next)} />
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}
      {(() => {
        const fieldNode = (field: CollField) => {
          if (field.type === 'image') return null
          const v = collText(data.values[item.id]?.[field.id])
          if (!showOptional && optionalNames.has(field.name) && v.trim() === '') return null
          return (
            <label key={field.id} className="nv-coll-field">
              <span className="nv-coll-fieldname">{field.name}</span>
              {field.name === '地图标记' && places !== undefined && places.length > 0 ? (
                <select className="nv-coll-ref" value={collText(data.values[item.id]?.[field.id])} onChange={event => setValue(field, event.target.value)}>
                  <option value="">—</option>
                  {places.map(place => <option key={`${place.mapModuleId}:${place.markerId}`} value={place.label ?? place.markerId}>{place.label ?? place.markerId}</option>)}
                </select>
              ) : field.type === 'person' || field.type === 'place' ? (
                <select className="nv-coll-ref" value={refCardId(data.values[item.id]?.[field.id]) ?? ''}
                  onChange={event => {
                    const target = (refTargets ?? []).find(candidate => candidate.cardId === event.target.value)
                    void send({
                      kind: 'collection_set_value', moduleId, itemId: item.id, fieldId: field.id,
                      value: target === undefined ? '' : { cardId: target.cardId, name: target.name },
                    })
                  }}>
                  <option value="">—</option>
                  {(refTargets ?? [])
                    .filter(target => field.type === 'person' ? target.kind === 'CHARACTER' : target.kind === 'WORLD')
                    .map(target => <option key={target.cardId} value={target.cardId}>{target.name}</option>)}
                </select>
              ) : field.type === 'chips' ? (
                <ChipsField value={v} placeholder={t('coll.chips.add')} onCommit={text => setValue(field, text)} />
              ) : field.type === 'longtext' ? (
                <CollFieldArea value={v} onCommit={text => setValue(field, text)} />
              ) : (
                <CollFieldInput value={v} numeric={field.type === 'number' || field.type === 'time'} onCommit={text => setValue(field, text)} />
              )}
            </label>
          )
        }
        const sections = (presentation?.detail ?? []).map(section => ({
          title: section.title,
          fields: data.fields.filter(field => section.fields.includes(field.name) && (showOptional || !optionalNames.has(field.name) || collText(data.values[item.id]?.[field.id]).trim() !== '')),
        })).filter(section => section.fields.length > 0)
        const covered = new Set(sections.flatMap(section => section.fields.map(field => field.name)))
        const rest = data.fields.filter(field => !covered.has(field.name))
        const toggle = hiddenOptional > 0 ? (
          <button type="button" className="nv-coll-optionaltoggle" onClick={() => setShowOptional(value => !value)}>
            {showOptional ? t('coll.optional.hide') : fmt(t, 'coll.optional.show', { n: hiddenOptional })}
          </button>
        ) : null
        if (sections.length === 0) return <><div className="nv-coll-detailgrid">{data.fields.map(fieldNode)}</div>{toggle}</>
        return (
          <>
            {sections.map(section => (
              <section key={section.title} className="nv-coll-detailsec">
                <h4>{section.title}</h4>
                <div className="nv-coll-detailgrid">{section.fields.map(fieldNode)}</div>
              </section>
            ))}
            {rest.length > 0 && <div className="nv-coll-detailgrid">{rest.map(fieldNode)}</div>}
            {toggle}
          </>
        )
      })()}
      <label className="nv-coll-field">
        <span className="nv-coll-fieldname">{t('coll.col.summary')}</span>
        <CollFieldInput value={item.summary} onCommit={text => patchItem({ summary: text })} />
      </label>
      <label className="nv-coll-field">
        <span className="nv-coll-fieldname">{t('coll.col.desc')}</span>
        <CollFieldArea value={item.description} onCommit={text => patchItem({ description: text })} />
      </label>
    </div>
  )
}

/** 条目名就地改名（click-to-rename 与模块头一致）。 */
function CollItemName({ item, t, onRename }: { readonly item: CollItem, readonly t: ShellT, readonly onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next !== '' && next !== item.name) onRename(next)
  }
  if (!editing) {
    return <h3 className="nv-coll-detailname" title={t('coll.rename.tip')} onClick={() => { setDraft(item.name); setEditing(true) }}>{item.name}</h3>
  }
  return (
    <input className="nv-modbox-rename" value={draft} autoFocus
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }} />
  )
}

/** 受控草稿输入：本地编辑、blur/Enter 才提交（避免逐键发命令）。 */
function CollFieldInput({ value, numeric, onCommit }: { readonly value: string, readonly numeric?: boolean, readonly onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <input className="nv-wg-input" type={numeric === true ? 'number' : 'text'} value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={() => onCommit(draft)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

function CollFieldArea({ value, onCommit }: { readonly value: string, readonly onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <textarea className="nv-wg-input nv-wg-area" value={draft}
      onChange={e => setDraft(e.target.value)} onBlur={() => onCommit(draft)} />
  )
}
