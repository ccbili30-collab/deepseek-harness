/**
 * 预制模块渲染器（设计稿 P2）：时间线 / 人物关系图 / 地图。
 * 三者的真数据都在模块首个文字块的 JSON 里——服务端按 widget.type
 * 解码后以 `widget.data` 下发；这里只读 data、写回走编辑命令
 * （timeline_* 逐条命令 / set_widget_data 整份覆盖）。
 * @module noven-shell/client/widgets
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CardCommand, CardModuleDoc } from './card-api.ts'
import { fmt, type ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/** 渲染器拿到的写入面：一条编辑命令 → apply。 */
export type WidgetSend = (command: CardCommand) => Promise<void>

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
interface TlEvent { readonly id: string, readonly at: number | null, readonly until: number | null, readonly ongoing?: boolean, readonly title: string, readonly description: string, readonly color?: string }
interface TlData { readonly calendar: TlCalendar, readonly views: readonly TlCalendar[], readonly eras: readonly TlEra[], readonly events: readonly TlEvent[], readonly marks: readonly TlMark[] }

interface RelNode { readonly id: string, readonly name: string, readonly note: string, readonly x: number | null, readonly y: number | null }
interface RelEdge { readonly id: string, readonly from: string, readonly to: string, readonly label: string }
interface RelData { readonly nodes: readonly RelNode[], readonly edges: readonly RelEdge[] }

interface MapMarker { readonly id: string, readonly x: number, readonly y: number, readonly label: string, readonly description: string }
interface MapData { readonly description: string, readonly markers: readonly MapMarker[] }

/** 解码器同时服务详情页与设定总览的缩略图——导出给 card-page 复用。 */
export const tl = (data: unknown): TlData => {
  const d = (data ?? {}) as Partial<TlData>
  return {
    calendar: tlCalendar(d.calendar),
    views: (d.views ?? []).map(tlCalendar).filter(v => v.name !== ''),
    eras: d.eras ?? [],
    events: d.events ?? [],
    marks: d.marks ?? [],
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

export const mapData = (data: unknown): MapData => {
  const d = (data ?? {}) as Partial<MapData>
  return { description: d.description ?? '', markers: d.markers ?? [] }
}

interface CollField { readonly id: string, readonly name: string, readonly type: string }
interface CollItem { readonly id: string, readonly name: string, readonly summary: string, readonly description: string, readonly visualKey: string | null }
type CollValue = string | number | boolean | null
  | { readonly resourceId?: string }
  | { readonly cardId?: string, readonly name?: string, readonly itemId?: string }

/** 引用选择器的目标：项目内一张卡。 */
export interface RefTarget { readonly cardId: string, readonly name: string, readonly kind: string }

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
function TlArticle({ event, era, calendar, moduleId, focused, near, onFocus, onUnfocus, t, send }: {
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
      </div>
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
export function TimelineWidget({ module, t, send }: WidgetProps) {
  const data = useMemo(() => tl(module.widget?.data), [module.widget?.data])
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
        <button type="button" className="nv-tlp-cal"
          onClick={e => { e.stopPropagation(); setCalOpen(v => !v) }}
          title={t('tl.calChip')}>
          {data.calendar.name !== '' ? data.calendar.name : data.calendar.unit}
        </button>
        <span className="nv-tlp-hint">{pendingEra !== null ? t('tl.pendingEra') : t('tl.hint')}</span>
        <span className="nv-tlp-spacer" />
        <button type="button" className="nv-wg-add" onClick={startEra}>＋ {t('tl.newEra')}</button>
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
                  onFocus={() => setFocusId(event.id)} onUnfocus={() => setFocusId(null)} t={t} send={send} />
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
                onFocus={() => setFocusId(event.id)} onUnfocus={() => setFocusId(null)} t={t} send={send} />
            ))}
            {data.eras.length > 0 && (
              <button type="button" className="nv-tld-add" onClick={() => addEvent(undefined)}>＋ {t('tl.newEvent')}</button>
            )}
          </section>
        )}
        {data.eras.length === 0 && data.events.length === 0 && (
          <div className="nv-tld-emptyhint">{t('tl.empty')}</div>
        )}
      </div>
    </div>
  )
}

/** 总览用迷你时间线：纪元色带 + 事件点，纯展示无交互。 */
export function MiniTimeline({ data }: { readonly data: TlData }) {
  const domain = ((): [number, number] => {
    const values = [
      ...data.eras.flatMap(e => [e.from, e.to].filter((v): v is number => v !== null)),
      ...data.events.flatMap(e => e.at === null ? [] : [e.at, ...(e.until === null ? [] : [e.until])]),
    ]
    if (values.length === 0) return [0, 100]
    const min = Math.min(...values); const max = Math.max(...values)
    return min === max ? [min - 1, max + 1] : [min, max]
  })()
  const [lo, hi] = domain
  const pct = (v: number): number => ((v - lo) / (hi - lo)) * 100
  const eraLaneMap = new Map<string, number>()
  {
    const ends: number[] = []
    for (const era of [...data.eras].sort((a, b) => ((b.to ?? hi) - (b.from ?? lo)) - ((a.to ?? hi) - (a.from ?? lo)))) {
      const start = era.from ?? lo
      let l = ends.findIndex(end => start >= end)
      if (l < 0) { l = ends.length; ends.push(Number.NEGATIVE_INFINITY) }
      ends[l] = era.to ?? hi
      eraLaneMap.set(era.id, l)
    }
  }
  return (
    <div className="nv-mini-tl">
      {data.eras.map(era => (
        <span key={era.id} className="nv-mini-tl-era"
          style={{
            left: `${pct(era.from ?? lo)}%`, width: `${Math.max(2, pct(era.to ?? hi) - pct(era.from ?? lo))}%`,
            top: `${(eraLaneMap.get(era.id) ?? 0) * 12}px`, background: ERA_BG[era.color] ?? ERA_BG.gray,
          }} />
      ))}
      {data.events.filter(e => e.at !== null).map(e => (
        <span key={e.id} className="nv-mini-tl-ev" style={{ left: `${pct(e.at ?? 0)}%` }} />
      ))}
    </div>
  )
}

/** 总览用迷你关系图：节点和边原样缩进小框。 */
export function MiniRelation({ data }: { readonly data: RelData }) {
  const positions = new Map(data.nodes.map((node, i) => [
    node.id,
    node.x !== null && node.y !== null ? { x: node.x, y: node.y } : circlePos(i, data.nodes.length),
  ]))
  return (
    <svg className="nv-mini-rel" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet">
      {data.edges.map(edge => {
        const a = positions.get(edge.from); const b = positions.get(edge.to)
        if (a === undefined || b === undefined) return null
        return <line key={edge.id} x1={a.x * 1000} y1={a.y * 560} x2={b.x * 1000} y2={b.y * 560} className="nv-mini-rel-line" />
      })}
      {data.nodes.map(node => {
        const p = positions.get(node.id) ?? { x: 0.5, y: 0.5 }
        return <circle key={node.id} cx={p.x * 1000} cy={p.y * 560} r={34} className="nv-mini-rel-node" />
      })}
    </svg>
  )
}

// ---------- 人物关系图 ----------

const REL_W = 1000
const REL_H = 560
const REL_R = 34

/** 未摆位节点的确定性圆形布局（渲染层补位，不落库；拖到才写回）。 */
function circlePos(index: number, total: number): { x: number, y: number } {
  const angle = (index / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2
  return { x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.34 }
}

/** 人物关系图：SVG 节点 + 连线；拖节点摆位，点节点/线编辑。 */
export function RelationWidget({ module, t, send }: WidgetProps) {
  const data = useMemo(() => rel(module.widget?.data), [module.widget?.data])
  const svgRef = useRef<SVGSVGElement | null>(null)
  /** 就地编辑单例（新建人物/人物/边三选一）；linking 是连线交互态，不是面板。 */
  const [panel, setPanel] = useState<{ kind: 'add' } | { kind: 'node', id: string } | { kind: 'edge', id: string } | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string, x: number, y: number } | null>(null)
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
        onClick={() => { setPanel(null); setLinking(null) }}>
        {data.edges.map(edge => {
          const a = positions.get(edge.from)
          const b = positions.get(edge.to)
          if (a === undefined || b === undefined) return null
          const x1 = a.x * REL_W; const y1 = a.y * REL_H
          const x2 = b.x * REL_W; const y2 = b.y * REL_H
          const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2
          return (
            <g key={edge.id} className="nv-rel-edge" onClick={e => { e.stopPropagation(); setPanel({ kind: 'edge', id: edge.id }); setLinking(null) }}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="nv-rel-line" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="nv-rel-linehit" />
              {edge.label !== '' && (
                <text x={mx} y={my - 6} className="nv-rel-edgelabel" textAnchor="middle">{edge.label}</text>
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
              <rect x={-REL_R * 1.6} y={node.note === '' ? -REL_R * 0.75 : -REL_R * 1.05} width={REL_R * 3.2}
                height={node.note === '' ? REL_R * 1.5 : REL_R * 2.1} rx={12} className="nv-rel-card" />
              <text y={node.note === '' ? 5 : -4} className="nv-rel-name" textAnchor="middle">{node.name}</text>
              {node.note !== '' && (
                <text y={12} className="nv-rel-note" textAnchor="middle">
                  {node.note.length > 10 ? `${node.note.slice(0, 10)}…` : node.note}
                </text>
              )}
            </g>
          )
        })}
        {data.nodes.length === 0 && (
          <text x={REL_W / 2} y={REL_H / 2} className="nv-rel-empty" textAnchor="middle">{t('wg.rel.empty')}</text>
        )}
      </svg>
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

// ---------- 地图 ----------

/** 地图：模块的图片块是底图；点空白放标记、点标记编辑、拖动改位。 */
export function MapWidget({ module, t, send, imageUrl, imageResources }: WidgetProps & {
  readonly imageUrl: (resourceId: string) => string
  readonly imageResources: readonly { readonly id: string }[]
}) {
  const data = useMemo(() => mapData(module.widget?.data), [module.widget?.data])
  const image = module.blocks.find(b => b.kind === 'image')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [pending, setPending] = useState<{ x: number, y: number } | null>(null)
  const [editing, setEditing] = useState<MapMarker | null>(null)
  const [picking, setPicking] = useState(false)
  const [drag, setDrag] = useState<{ id: string, x: number, y: number } | null>(null)
  const movedRef = useRef(false)

  const point = (e: { clientX: number, clientY: number }): { x: number, y: number } => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect === undefined || rect.width === 0) return { x: 0.5, y: 0.5 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const commit = (markers: MapMarker[], description = data.description): Promise<void> =>
    send({ kind: 'set_widget_data', moduleId: module.id, widget: 'map', data: { description, markers } })

  useEffect(() => {
    if (drag === null) return
    const move = (e: MouseEvent): void => { const p = point(e); setDrag({ id: drag.id, x: p.x, y: p.y }); movedRef.current = true }
    const up = (e: MouseEvent): void => {
      const p = point(e)
      const id = drag.id
      setDrag(null)
      if (movedRef.current) {
        void commit(data.markers.map(mk => mk.id === id ? { ...mk, x: p.x, y: p.y } : mk))
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, data.markers])

  if (image === undefined || image.resourceId === undefined) {
    return (
      <div className="nv-wg nv-map">
        <div className="nv-map-empty">
          <span className="nv-map-emptyicon">{glyph.map(26)}</span>
          <span>{t('wg.map.noImage')}</span>
          {imageResources.length > 0 && (
            <button type="button" className="nv-wg-add" onClick={() => setPicking(v => !v)}>{t('wg.map.pick')}</button>
          )}
        </div>
        {picking && (
          <div className="nv-map-picker">
            {imageResources.map(resource => (
              <button key={resource.id} type="button" className="nv-map-pick"
                onClick={() => {
                  setPicking(false)
                  void send({ kind: 'insert_owned_image', moduleId: module.id, resourceId: resource.id })
                }}>
                <img src={imageUrl(resource.id)} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="nv-wg nv-map">
      <div className="nv-map-stage" ref={wrapRef}
        onClick={e => {
          if ((e.target as HTMLElement).closest('.nv-map-pin') !== null) return
          if (editing !== null || pending !== null) return
          setPending(point(e))
        }}>
        <img className="nv-map-img" src={imageUrl(image.resourceId)} alt="" draggable={false} />
        {data.markers.map(marker => {
          const p = drag?.id === marker.id ? drag : marker
          return (
            <button key={marker.id} type="button" className="nv-map-pin"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDrag({ id: marker.id, x: marker.x, y: marker.y }); movedRef.current = false }}
              onClick={e => { e.stopPropagation(); if (!movedRef.current) { setEditing(marker); setPending(null) } }}>
              <span className="nv-map-pindot" />
              {marker.label !== '' && <span className="nv-map-pinlabel">{marker.label}</span>}
            </button>
          )
        })}
        {pending !== null && (
          <span className="nv-map-pin nv-map-pin-new" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }}>
            <span className="nv-map-pindot" />
          </span>
        )}
      </div>
      <div className="nv-wg-actions">
        <span className="nv-wg-hint">{t('wg.map.hint')}</span>
      </div>
      {pending !== null && (
        <MarkerForm t={t} title={t('wg.map.newMarker')}
          onCancel={() => setPending(null)}
          onSubmit={async ({ label, description }) => {
            await commit([...data.markers, { id: mint(), x: pending.x, y: pending.y, label, description }])
            setPending(null)
          }} />
      )}
      {editing !== null && (
        <MarkerForm t={t} title={t('wg.map.marker')} marker={editing}
          onCancel={() => setEditing(null)}
          onDelete={async () => {
            await commit(data.markers.filter(mk => mk.id !== editing.id))
            setEditing(null)
          }}
          onSubmit={async ({ label, description }) => {
            await commit(data.markers.map(mk => mk.id === editing.id ? { ...mk, label, description } : mk))
            setEditing(null)
          }} />
      )}
    </div>
  )
}

function MarkerForm({ t, title, marker, onSubmit, onDelete, onCancel }: {
  readonly t: ShellT
  readonly title: string
  readonly marker?: MapMarker
  readonly onSubmit: (v: { label: string, description: string }) => Promise<void>
  readonly onDelete?: () => Promise<void>
  readonly onCancel: () => void
}) {
  const [label, setLabel] = useState(marker?.label ?? '')
  const [desc, setDesc] = useState(marker?.description ?? '')
  return (
    <EditPanel title={title} onClose={onCancel}>
      <input className="nv-wg-input" value={label} placeholder={t('wg.field.title')} autoFocus
        onChange={e => setLabel(e.target.value)} />
      <textarea className="nv-wg-input nv-wg-area" value={desc} placeholder={t('wg.field.desc')}
        onChange={e => setDesc(e.target.value)} />
      <div className="nv-wg-actions">
        {onDelete !== undefined && <button type="button" className="nv-wg-del" onClick={() => void onDelete()}>{t('wg.del')}</button>}
        <span className="nv-wg-spacer" />
        <button type="button" className="nv-wg-ok" disabled={label.trim() === ''}
          onClick={() => void onSubmit({ label: label.trim(), description: desc })}>{t('wg.save')}</button>
      </div>
    </EditPanel>
  )
}

// ---------- 集合（设计稿 06 + collection-v2 B/C） ----------

/** 集合条目字段值 → 展示文本；图片值返回 ''（卡片走 resourceId 单独渲染）。 */
const collText = (v: CollValue | undefined): string => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') return 'name' in v && typeof v.name === 'string' ? v.name : ''
  if (typeof v === 'boolean') return v ? '✓' : ''
  return String(v)
}

/** 引用单元格的完整值（无引用返回 undefined）。 */
const refValueOf = (v: CollValue | undefined): { cardId: string, name: string, itemId?: string } | undefined =>
  typeof v === 'object' && v !== null && 'cardId' in v && typeof v.cardId === 'string' && 'name' in v && typeof v.name === 'string'
    ? { cardId: v.cardId, name: v.name, ...('itemId' in v && typeof v.itemId === 'string' ? { itemId: v.itemId } : {}) }
    : undefined

/** 引用单元格里的卡 id（无引用返回 undefined）。 */
const refCardId = (v: CollValue | undefined): string | undefined =>
  typeof v === 'object' && v !== null && 'cardId' in v && typeof v.cardId === 'string' && v.cardId.length > 0 ? v.cardId : undefined

/** 分组字段：优先惯用名（类别/分类…），否则取第一个取值在 2..8 种的 text 字段。 */
const GROUP_NAMES = new Set(['类别', '分类', '分组', '类型', 'category', 'type', 'group'])
const collGroupField = (data: CollData): CollField | undefined => {
  const named = data.fields.find(f => f.type === 'text' && GROUP_NAMES.has(f.name.toLowerCase()))
  if (named !== undefined) return named
  return data.fields.find(f => {
    if (f.type !== 'text') return false
    const distinct = new Set(data.items.map(item => collText(data.values[item.id]?.[f.id])).filter(v => v !== ''))
    return distinct.size >= 2 && distinct.size <= 8 && distinct.size < data.items.length
  })
}

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
export function CollectionWidget({ module, t, send, imageUrl, refTargets }: WidgetProps & { readonly imageUrl: (resourceId: string) => string, readonly refTargets?: readonly RefTarget[] }) {
  const data = coll(module.widget?.data)
  const view = data.view === 'cards' || data.view === 'form' || data.view === 'timeline' ? data.view : 'list'
  const [openId, setOpenId] = useState<string | null>(null)
  const openItem = data.items.find(item => item.id === openId)
  const setView = (next: string): void => { void send({ kind: 'collection_set_view', moduleId: module.id, view: next }) }
  const VIEWS: readonly { readonly id: string, readonly label: string }[] = [
    { id: 'list', label: t('coll.view.list') },
    { id: 'cards', label: t('coll.view.cards') },
    { id: 'form', label: t('coll.view.form') },
    { id: 'timeline', label: t('coll.view.timeline') },
  ]
  return (
    <div className="nv-coll">
      <div className="nv-coll-bar">
        <span className="nv-coll-count">{fmt(t, 'coll.count', { count: data.items.length })}</span>
        <span className="nv-coll-views">
          {VIEWS.map(v => (
            <button key={v.id} type="button"
              className={`nv-coll-view${view === v.id ? ' nv-coll-view-on' : ''}`}
              onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </span>
      </div>
      {data.items.length === 0 && <div className="nv-coll-empty">{t('coll.empty')}</div>}
      {view === 'list' && <CollList data={data} t={t} moduleId={module.id} send={send} {...(refTargets === undefined ? {} : { refTargets })} />}
      {view === 'cards' && <CollCards data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId} />}
      {view === 'form' && <CollForm data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId} />}
      {view === 'timeline' && <CollScroll data={data} t={t} imageUrl={imageUrl} openId={openId} onOpen={setOpenId} />}
      {openItem !== undefined && (
        <CollDetail data={data} item={openItem} t={t} moduleId={module.id} imageUrl={imageUrl}
          send={send} refTargets={refTargets} onClose={() => setOpenId(null)} />
      )}
    </div>
  )
}

/** 图鉴卡：分区标题 + 卡网格。卡 = 主图（visualKey→资源图，无图给淡色占位）+ 名 + 关键数字 + 摘要。 */
function CollCards({ data, t, imageUrl, openId, onOpen }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly openId: string | null
  readonly onOpen: (id: string | null) => void
}) {
  const { sections } = collSections(data, t('coll.ungrouped'))
  const statField = data.fields.find(f => f.type === 'number')
  const imageField = data.fields.find(f => f.type === 'image')
  return (
    <div className="nv-coll-deck">
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
              const subtitle = subtitleField === undefined ? item.summary : collText(data.values[item.id]?.[subtitleField.id])
              return (
                <button key={item.id} type="button"
                  className={`nv-coll-card${openId === item.id ? ' nv-coll-card-on' : ''}`}
                  onClick={() => onOpen(openId === item.id ? null : item.id)}>
                  {imageField !== undefined && index === 0 && <span className="nv-coll-primary">{t('coll.primary')}</span>}
                  {item.visualKey !== null ? (
                    <img className="nv-coll-cardimg" src={imageUrl(item.visualKey)} alt="" />
                  ) : (
                    <span className="nv-coll-cardimg nv-coll-cardimg-empty" title={t('coll.image.pending')}>
                      {glyph.sparkle(20)}
                    </span>
                  )}
                  <span className="nv-coll-cardname">{item.name}</span>
                  {subtitle !== '' && <span className="nv-coll-cardsum">{subtitle}</span>}
                  {statText !== '' && <span className="nv-coll-cardstat">{statText}</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 表单视图：一条一张表单卡，字段按「标签—值」逐行排；点卡头打开完整编辑。 */
function CollForm({ data, t, imageUrl, openId, onOpen }: {
  readonly data: CollData
  readonly t: ShellT
  readonly imageUrl: (resourceId: string) => string
  readonly openId: string | null
  readonly onOpen: (id: string | null) => void
}) {
  return (
    <div className="nv-coll-forms">
      {data.items.map(item => (
        <section key={item.id} className={`nv-coll-formcard${openId === item.id ? ' nv-coll-formcard-on' : ''}`}>
          <button type="button" className="nv-coll-formhead" onClick={() => onOpen(openId === item.id ? null : item.id)}>
            <span className="nv-coll-formname">{item.name}</span>
            <span className="nv-coll-formedit">{t('coll.form.edit')}</span>
          </button>
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
              if (field.type === 'image') {
                const resourceId = typeof raw === 'object' && raw !== null && 'resourceId' in raw ? raw.resourceId : undefined
                return (
                  <div key={field.id} className="nv-coll-formrow">
                    <span className="nv-coll-formlabel">{field.name}</span>
                    {resourceId === undefined
                      ? <span className="nv-coll-formvalue nv-coll-formempty">—</span>
                      : <img className="nv-coll-formimg" src={imageUrl(resourceId)} alt="" />}
                  </div>
                )
              }
              const text = collText(raw)
              return (
                <div key={field.id} className="nv-coll-formrow">
                  <span className="nv-coll-formlabel">{field.name}</span>
                  <span className={`nv-coll-formvalue${text === '' ? ' nv-coll-formempty' : ''}`}>{text === '' ? '—' : text}</span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 立场/阵营这类短标签的色阶：正道绿、魔道红、中立灰，其余中性。 */
const chipTone = (text: string): string => {
  if (/正道|正统|光明|秩序/.test(text)) return 'green'
  if (/魔道|邪|混乱|暗/.test(text)) return 'red'
  if (/中立|灰色/.test(text)) return 'gray'
  return 'neutral'
}

/** 列表视图：字段列 + 条目行；引用列是行内选择器，立场列是彩色芯片。 */
function CollList({ data, t, moduleId, send, refTargets }: {
  readonly data: CollData
  readonly t: ShellT
  readonly moduleId: string
  readonly send: WidgetSend
  readonly refTargets?: readonly RefTarget[]
}) {
  const setValue = (itemId: string, field: CollField, value: CollValue): void => {
    void send({ kind: 'collection_set_value', moduleId, itemId, fieldId: field.id, value })
  }
  // 条目自带名称列；集合里若也有「名称」字段就不再重复一列。
  const columns = data.fields.filter(field => field.name !== '名称' && field.name !== 'Name')
  const showSummary = data.items.some(item => item.summary !== '')
  return (
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
            <td className="nv-coll-tdname">{item.name}</td>
            {columns.map(f => {
              const raw = data.values[item.id]?.[f.id]
              if (f.type === 'person' || f.type === 'place') {
                const current = refValueOf(raw)
                const currentKey = current === undefined ? '' : `ref:${current.itemId ?? current.cardId}`
                return (
                  <td key={f.id}>
                    <select className="nv-coll-ref nv-coll-reftd" value={currentKey}
                      onChange={event => {
                        if (event.target.value.startsWith('ref:')) return
                        const target = (refTargets ?? []).find(candidate => candidate.cardId === event.target.value)
                        setValue(item.id, f, target === undefined ? '' : { cardId: target.cardId, name: target.name })
                      }}>
                      {current !== undefined && <option value={currentKey}>{current.name}</option>}
                      <option value="">—</option>
                      {(refTargets ?? [])
                        .filter(target => f.type === 'person' ? target.kind === 'CHARACTER' : target.kind === 'WORLD')
                        .map(target => <option key={target.cardId} value={target.cardId}>{target.name}</option>)}
                    </select>
                  </td>
                )
              }
              const text = collText(raw)
              if (f.name === '立场') {
                return <td key={f.id}>{text === '' ? '' : <span className={`nv-coll-chip nv-coll-chip-${chipTone(text)}`}>{text}</span>}</td>
              }
              return <td key={f.id}>{text}</td>
            })}
            {showSummary && <td className="nv-coll-tdsum">{item.summary}</td>}
          </tr>
        ))}
      </tbody>
    </table>
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
function CollDetail({ data, item, t, moduleId, imageUrl, send, refTargets, onClose }: {
  readonly data: CollData
  readonly item: CollItem
  readonly t: ShellT
  readonly moduleId: string
  readonly imageUrl: (resourceId: string) => string
  readonly send: WidgetSend
  readonly refTargets?: readonly RefTarget[]
  readonly onClose: () => void
}) {
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
  return (
    <div className="nv-coll-detail">
      <div className="nv-coll-detailhead">
        <CollItemName item={item} t={t} onRename={name => patchItem({ name })} />
        <button type="button" className="nv-canvas-tabx" aria-label={t('create.cancel')} onClick={onClose}>×</button>
      </div>
      {item.visualKey !== null && <img className="nv-coll-detailimg" src={imageUrl(item.visualKey)} alt="" />}
      <div className="nv-coll-detailgrid">
        {data.fields.map(field => {
          const v = collText(data.values[item.id]?.[field.id])
          return (
            <label key={field.id} className="nv-coll-field">
              <span className="nv-coll-fieldname">{field.name}</span>
              {field.type === 'person' || field.type === 'place' ? (
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
              ) : field.type === 'longtext' ? (
                <CollFieldArea value={v} onCommit={text => setValue(field, text)} />
              ) : (
                <CollFieldInput value={v} numeric={field.type === 'number' || field.type === 'time'} onCommit={text => setValue(field, text)} />
              )}
            </label>
          )
        })}
      </div>
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
