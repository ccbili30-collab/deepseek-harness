/**
 * 地图编辑器（设计稿 P2 地图模块的正身）：底图上叠草稿、标注、修改三种
 * 工作模式。矢量对象存模块首个文字块的 JSON（noven.objects），写回走
 * `set_widget_data` 整份覆盖；旧版只有 markers 的卡读进来落成地标对象。
 *
 * 坐标：存储是归一化 [0,1]（x=图宽比例，y=图高比例）；编辑器内部在
 * 「图高单位」空间工作（x∈[0,aspect]，y∈[0,1]），距离与宽度各向同性。
 * @module noven-shell/client/map-editor
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CardCommand, CardModuleDoc } from './card-api.ts'
import type { ShellT } from './pages/Home.tsx'
import { glyph } from './icons.tsx'

/* ---------- 数据形状（与 noven-cards/formats.ts decodeMap 一致） ---------- */

type XY = [number, number]
interface MapAttach { readonly kind: 'line' | 'mark', readonly id: string, readonly t: number }
interface FaceObj { id: string, type: 'face', layer: string, name: string, color: string, pts: XY[] }
interface LineObj {
  id: string, type: 'line', layer: string, name: string, color: string
  pts: XY[], widths: number[], attachStart?: MapAttach, attachEnd?: MapAttach
}
interface MarkObj { id: string, type: 'mark', layer: string, name: string, color: string, pos: XY, description: string }
type MapObject = FaceObj | LineObj | MarkObj
interface DraftStroke { readonly color: string, readonly r: number, readonly pts: XY[] }
interface PaletteEntry { readonly name: string, readonly desc: string, readonly color: string }
interface EditorDoc {
  readonly description: string
  readonly objects: MapObject[]
  readonly draft: DraftStroke[]
  readonly palette: PaletteEntry[]
}

const LAYERS = [
  { id: 'region', kind: 'face' }, { id: 'kingdom', kind: 'face' }, { id: 'faction', kind: 'face' },
  { id: 'road', kind: 'line' }, { id: 'river', kind: 'line' }, { id: 'landmark', kind: 'mark' },
] as const
type LayerId = typeof LAYERS[number]['id']
const layerKind = (id: string): 'face' | 'line' | 'mark' => LAYERS.find(l => l.id === id)?.kind ?? 'face'

const DEFAULT_PALETTE: PaletteEntry[] = [
  { name: '海', desc: 'ocean water', color: '#6D9DC5' },
  { name: '陆', desc: 'land', color: '#B8A888' },
  { name: '山', desc: 'mountains', color: '#8D8D8D' },
  { name: '森林', desc: 'forest', color: '#5F8F5F' },
  { name: '沙漠', desc: 'desert', color: '#D8BE78' },
]

const ACCENT = '#0E9F6E'
const INK = '#16181A'
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
let seq = 0
const nid = (): string => `mo-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** 解码 widget.data；旧卡 objects 缺省时 markers 已被服务端升成地标。 */
function editorData(raw: unknown): EditorDoc {
  const d = (raw ?? {}) as {
    description?: string
    objects?: unknown[]; draft?: unknown[]; palette?: unknown[]; markers?: unknown[]
  }
  const objects = Array.isArray(d.objects) ? (d.objects as MapObject[]).filter(o => o !== null && typeof o === 'object') : []
  return {
    description: typeof d.description === 'string' ? d.description : '',
    objects: objects.map(o => ({ ...o, ...(o.type === 'mark' ? { pos: [...o.pos] as XY } : {}) })),
    draft: (Array.isArray(d.draft) ? d.draft : []) as DraftStroke[],
    palette: (Array.isArray(d.palette) && d.palette.length > 0 ? d.palette : DEFAULT_PALETTE) as PaletteEntry[],
  }
}

/* ---------- 几何：全部在图高单位空间（x∈[0,aspect]，y∈[0,1]） ---------- */

const d2 = (a: XY, b: XY): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
function segDist(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
function polyDist(p: XY, pts: readonly XY[], closed: boolean): number {
  let d = Infinity
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) d = Math.min(d, segDist(p, pts[i] ?? [0, 0], pts[(i + 1) % pts.length] ?? [0, 0]))
  return d
}
function inPoly(p: XY, pts: readonly XY[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i] ?? [0, 0], pj = pts[j] ?? [0, 0]
    if ((pi[1] > p[1]) !== (pj[1] > p[1]) && p[0] < (pj[0] - pi[0]) * (p[1] - pi[1]) / (pj[1] - pi[1]) + pi[0]) inside = !inside
  }
  return inside
}
function polyArea(pts: readonly XY[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i] ?? [0, 0], pj = pts[j] ?? [0, 0]
    a += pj[0] * pi[1] - pi[0] * pj[1]
  }
  return a / 2
}
function simplify(pts: readonly XY[], eps: number): XY[] {
  if (pts.length < 3) return pts.map(p => [...p] as XY)
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop() ?? [0, 0]
    let dmax = 0, idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i] ?? [0, 0], pts[a] ?? [0, 0], pts[b] ?? [0, 0])
      if (d > dmax) { dmax = d; idx = i }
    }
    if (dmax > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i] === 1).map(p => [...p] as XY)
}
function smoothClosed(pts: readonly XY[]): XY[] {
  const out: XY[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i] ?? [0, 0], b = pts[(i + 1) % pts.length] ?? [0, 0]
    out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75])
  }
  return out
}
/** 软拉伸：抓取点吃满位移，邻点按弧长高斯衰减——桌上拉一根绳。 */
function pullRing(pts: readonly XY[], grab: number, delta: XY, sigma: number, closed: boolean): XY[] {
  const n = pts.length
  const arc = [0]
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1] ?? [0, 0], b = pts[i % n] ?? [0, 0]
    arc[i] = (arc[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const total = closed ? (arc[n] ?? 0) : (arc[n - 1] ?? 0)
  const grabArc = arc[grab] ?? 0
  return pts.map((p, i) => {
    if (i === grab) return [p[0] + delta[0], p[1] + delta[1]] as XY
    let d = Math.abs((arc[i] ?? 0) - grabArc)
    if (closed) d = Math.min(d, total - d)
    const w = Math.exp(-(d * d) / (sigma * sigma))
    return [p[0] + delta[0] * w, p[1] + delta[1] * w] as XY
  })
}
/** 拉完补点删点：长边二分、近直边剪枝，保住绳子的顺滑。 */
function maintain(pts: readonly XY[], closed: boolean, maxSeg: number, eps: number): XY[] {
  const dense: XY[] = []
  const n = pts.length
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i] ?? [0, 0], b = pts[(i + 1) % n] ?? [0, 0]
    dense.push(a)
    const k = Math.min(8, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSeg))
    for (let s = 1; s <= k; s++) dense.push([a[0] + (b[0] - a[0]) * s / (k + 1), a[1] + (b[1] - a[1]) * s / (k + 1)])
  }
  if (!closed) dense.push(pts[n - 1] ?? [0, 0])
  let out = closed ? simplify([...dense, dense[0] ?? [0, 0]], eps) : simplify(dense, eps)
  if (closed && out.length > 1) out = out.slice(0, -1)
  return out.slice(0, 600)
}

/* ---------- 光栅：涂抹 → 最外围轮廓（marching squares） ---------- */

const raster = document.createElement('canvas')
const rctx = raster.getContext('2d', { willReadFrequently: true })

function extractOuterContour(alpha: Uint8Array, w: number, h: number): XY[] | null {
  const segs: { a: XY, b: XY, ea: string, eb: string, used: boolean }[] = []
  const byEdge = new Map<string, number[]>()
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : (alpha[y * w + x] ?? 0)
  const lerp = (a1: number, a2: number): number => a1 === a2 ? .5 : Math.max(0, Math.min(1, (127 - a1) / (a2 - a1)))
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const tl = at(i, j), tr = at(i + 1, j), br = at(i + 1, j + 1), bl = at(i, j + 1)
      const idx = (tl > 127 ? 1 : 0) | (tr > 127 ? 2 : 0) | (br > 127 ? 4 : 0) | (bl > 127 ? 8 : 0)
      if (idx === 0 || idx === 15) continue
      const E = { T: `h:${i},${j}`, B: `h:${i},${j + 1}`, L: `v:${i},${j}`, R: `v:${i + 1},${j}` }
      const P = {
        T: [i + lerp(tl, tr), j] as XY, B: [i + lerp(bl, br), j + 1] as XY,
        L: [i, j + lerp(tl, bl)] as XY, R: [i + 1, j + lerp(tr, br)] as XY,
      }
      const TABLE: Record<number, string[]> = {
        1: ['LT'], 2: ['TR'], 3: ['LR'], 4: ['RB'], 6: ['TB'], 7: ['LB'],
        8: ['LB'], 9: ['TB'], 11: ['RB'], 12: ['LR'], 13: ['TR'], 14: ['TL'],
      }
      let pairs = TABLE[idx]
      if (idx === 5) pairs = (tl + tr + br + bl) / 4 > 127 ? ['TR', 'LB'] : ['TL', 'RB']
      if (idx === 10) pairs = (tl + tr + br + bl) / 4 > 127 ? ['TL', 'RB'] : ['TR', 'LB']
      for (const pair of pairs ?? []) {
        const ea = pair[0] ?? 'T', eb = pair[1] ?? 'T'
        const s = { a: P[ea as keyof typeof P], b: P[eb as keyof typeof P], ea: E[ea as keyof typeof E], eb: E[eb as keyof typeof E], used: false }
        const si = segs.push(s) - 1
        for (const e of [s.ea, s.eb]) {
          const list = byEdge.get(e) ?? []
          list.push(si); byEdge.set(e, list)
        }
      }
    }
  }
  let best: XY[] | null = null, bestArea = 0
  for (let i = 0; i < segs.length; i++) {
    const first = segs[i]
    if (first === undefined || first.used) continue
    first.used = true
    const loop: XY[] = [first.a, first.b]
    let end = first.eb
    let guard = segs.length + 8
    while (guard-- > 0) {
      const next = (byEdge.get(end) ?? []).find(si => segs[si]?.used !== true)
      if (next === undefined) break
      const cur = segs[next]
      if (cur === undefined) break
      cur.used = true
      loop.push(cur.ea === end ? cur.b : cur.a)
      end = cur.ea === end ? cur.eb : cur.ea
      if (next === i) break
    }
    const area = Math.abs(polyArea(loop))
    if (area > bestArea) { bestArea = area; best = loop }
  }
  return best
}

/** 涂抹轨迹 + 半径 → 闭合轮廓（工作空间）。面积太小时返回 null。 */
function smearToContour(path: readonly XY[], r: number, aspect: number): XY[] | null {
  const H = 256, W = Math.max(8, Math.round(256 * aspect))
  raster.width = W; raster.height = H
  if (rctx === null) return null
  rctx.setTransform(1, 0, 0, 1, 0, 0)
  rctx.clearRect(0, 0, W, H)
  rctx.fillStyle = '#fff'
  const rr = Math.max(1, r * H)
  for (let i = 0; i < path.length; i++) {
    const p = path[i] ?? [0, 0]
    rctx.beginPath(); rctx.arc(p[0] * H, p[1] * H, rr, 0, 7); rctx.fill()
    const q = path[i - 1]
    if (q !== undefined) {
      rctx.strokeStyle = '#fff'; rctx.lineWidth = rr * 2; rctx.lineCap = 'round'
      rctx.beginPath(); rctx.moveTo(q[0] * H, q[1] * H); rctx.lineTo(p[0] * H, p[1] * H); rctx.stroke()
    }
  }
  const img = rctx.getImageData(0, 0, W, H)
  const alpha = new Uint8Array(W * H)
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3] ?? 0
  const loop = extractOuterContour(alpha, W, H)
  if (loop === null) return null
  return smoothClosed(simplify(loop.map(p => [p[0] / H, p[1] / H] as XY), 1.6 / H * 2))
}

/** 对选中面加/减一块涂抹区，重新取外轮廓。 */
function facePaintEdit(pts: readonly XY[], path: readonly XY[], r: number, sign: 1 | -1, aspect: number): XY[] | null {
  const H = 256, W = Math.max(8, Math.round(256 * aspect))
  raster.width = W; raster.height = H
  if (rctx === null || pts.length < 3) return null
  rctx.setTransform(1, 0, 0, 1, 0, 0)
  rctx.clearRect(0, 0, W, H)
  rctx.fillStyle = '#fff'
  rctx.beginPath()
  pts.forEach((p, i) => { i === 0 ? rctx.moveTo(p[0] * H, p[1] * H) : rctx.lineTo(p[0] * H, p[1] * H) })
  rctx.closePath(); rctx.fill()
  rctx.globalCompositeOperation = sign === 1 ? 'source-over' : 'destination-out'
  const rr = Math.max(1, r * H)
  for (let i = 0; i < path.length; i++) {
    const p = path[i] ?? [0, 0]
    rctx.beginPath(); rctx.arc(p[0] * H, p[1] * H, rr, 0, 7); rctx.fill()
    const q = path[i - 1]
    if (q !== undefined) {
      rctx.strokeStyle = '#fff'; rctx.lineWidth = rr * 2; rctx.lineCap = 'round'
      rctx.beginPath(); rctx.moveTo(q[0] * H, q[1] * H); rctx.lineTo(p[0] * H, p[1] * H); rctx.stroke()
    }
  }
  rctx.globalCompositeOperation = 'source-over'
  const img = rctx.getImageData(0, 0, W, H)
  const alpha = new Uint8Array(W * H)
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3] ?? 0
  const loop = extractOuterContour(alpha, W, H)
  return loop === null ? null : smoothClosed(simplify(loop.map(p => [p[0] / H, p[1] / H] as XY), 2.2 / H))
}

/* ---------- 组件 ---------- */

type Mode = 'draft' | 'annotate' | 'edit'
/** 标注的「画什么」就是图层本身——面的图层选择即图层 id，不再有"当前面图层"这层状态。 */
type DrawLayer = LayerId

interface Gesture {
  readonly kind: 'stroke' | 'stretch' | 'move' | 'pan' | 'paint' | 'facepaint' | 'none'
  readonly obj?: MapObject
  readonly grab?: number
  sigma?: number
  readonly sign?: 1 | -1
  path?: XY[]
  last?: XY
  moved?: boolean
  snapped?: { id: string, t: number, kind: 'line' | 'mark', point: XY } | null
  snapStart?: { id: string, t: number, kind: 'line' | 'mark', point: XY } | null
  alt?: boolean
}

export function MapEditor({ module, t, send, ask, imageUrl, imageResources }: {
  readonly module: CardModuleDoc
  readonly t: ShellT
  readonly send: (command: CardCommand) => Promise<void>
  /** 向本会话排一句话——无底图时「直接生成」和草稿生成都走这里。 */
  readonly ask: (text: string) => Promise<void>
  readonly imageUrl: (resourceId: string) => string
  readonly imageResources: readonly { readonly id: string }[]
}) {
  const data = useMemo(() => editorData(module.widget?.data), [module.widget?.data])
  const image = module.blocks.find(b => b.kind === 'image')
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cvRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // 工作空间：x∈[0,aspect]，y∈[0,1]；存储转回宽/高比例。
  const aspectRef = useRef(1.6)
  const docRef = useRef<EditorDoc>(data)
  const busyRef = useRef(false)
  const [, setTick] = useState(0)
  const bump = (): void => setTick(v => v + 1)

  const [mode, setMode] = useState<Mode>('annotate')
  const [drawLayer, setDrawLayer] = useState<DrawLayer>('kingdom')
  const [how, setHow] = useState<'lasso' | 'smear'>('lasso')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [selId, setSelId] = useState<string | null>(null)
  const [brushPx, setBrushPx] = useState(24)
  const [pal, setPal] = useState<PaletteEntry | null>(null)
  const [erasing, setErasing] = useState(false)
  const [grid, setGrid] = useState(false)
  const [editPaint, setEditPaint] = useState(false)
  const [picking, setPicking] = useState(false)
  /** 无底图时是否已经进了编辑器（选过「手绘草稿」）。已有草稿/对象则视为已开始。 */
  const [started, setStarted] = useState(false)
  const [genAsked, setGenAsked] = useState(false)
  const [objForm, setObjForm] = useState<{ name: string, color: string, width: number } | null>(null)
  const [palForm, setPalForm] = useState<{ name: string, desc: string, color: string } | null>(null)

  const viewRef = useRef({ s: 200, x: 0, y: 0 })   // s = px per work unit
  const gestureRef = useRef<Gesture>({ kind: 'none' })
  const cursorRef = useRef<XY | null>(null)
  const toWork = useCallback((p: XY): XY => [p[0] * aspectRef.current, p[1]], [])
  const toStore = useCallback((p: XY): XY => [clamp01(p[0] / aspectRef.current), clamp01(p[1])], [])
  const objWorkPts = useCallback((o: FaceObj | LineObj): XY[] => o.pts.map(toWork), [toWork])
  const markWork = useCallback((m: MarkObj): XY => toWork(m.pos), [toWork])

  // 外部数据回流（自己提交的回声或 AI 写入）；手势中不覆盖。
  useEffect(() => {
    if (!busyRef.current) docRef.current = data
    bump()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const sel = docRef.current.objects.find(o => o.id === selId) ?? null

  // 草稿默认取第一个语义色。
  useEffect(() => {
    if (pal === null && docRef.current.palette.length > 0) setPal(docRef.current.palette[0] ?? null)
  }, [pal, data])

  const commit = useCallback((): void => {
    const doc = docRef.current
    const payload = {
      description: doc.description,
      objects: doc.objects.map(o => o.type === 'mark'
        ? { id: o.id, type: 'mark', layer: o.layer, name: o.name, color: o.color, pos: o.pos, description: o.description }
        : o.type === 'face'
          ? { id: o.id, type: 'face', layer: o.layer, name: o.name, color: o.color, pts: o.pts }
          : {
            id: o.id, type: 'line', layer: o.layer, name: o.name, color: o.color, pts: o.pts, widths: o.widths,
            ...(o.attachStart !== undefined ? { attachStart: o.attachStart } : {}),
            ...(o.attachEnd !== undefined ? { attachEnd: o.attachEnd } : {}),
          }),
      draft: doc.draft,
      palette: doc.palette,
    }
    void send({ kind: 'set_widget_data', moduleId: module.id, widget: 'map', data: payload })
  }, [module.id, send])

  /* ---------- 视图与命中 ---------- */

  const workOfEvent = useCallback((e: { clientX: number, clientY: number }): XY => {
    const rect = cvRef.current?.getBoundingClientRect()
    const v = viewRef.current
    if (rect === undefined) return [0, 0]
    return [(e.clientX - rect.left - v.x) / v.s, (e.clientY - rect.top - v.y) / v.s]
  }, [])

  /** 吸附：线端点画到已有骨架/地标附近时贴上，存 attach 跟随目标。 */
  const snapTarget = useCallback((p: XY, excludeId?: string): Gesture['snapped'] => {
    const lim = 12 / viewRef.current.s
    let best: Gesture['snapped'] = null, bestD = lim
    for (const o of docRef.current.objects) {
      if (o.id === excludeId || hidden.has(o.layer)) continue
      if (o.type === 'mark') {
        const d = Math.hypot(p[0] - markWork(o)[0], p[1] - markWork(o)[1])
        if (d < bestD) { bestD = d; best = { id: o.id, t: 0, kind: 'mark', point: markWork(o) } }
      } else if (o.type === 'line') {
        const pts = objWorkPts(o)
        let acc = 0, total = 0
        const segs: number[] = []
        for (let i = 0; i < pts.length - 1; i++) {
          const dd = Math.hypot((pts[i + 1]?.[0] ?? 0) - (pts[i]?.[0] ?? 0), (pts[i + 1]?.[1] ?? 0) - (pts[i]?.[1] ?? 0))
          segs.push(dd); total += dd
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i] ?? [0, 0], b = pts[i + 1] ?? [0, 0]
          const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
          const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
          const d = Math.hypot(p[0] - (a[0] + tt * dx), p[1] - (a[1] + tt * dy))
          if (d < bestD) {
            bestD = d
            best = { id: o.id, t: total === 0 ? 0 : (acc + (segs[i] ?? 0) * tt) / total, kind: 'line', point: [a[0] + tt * dx, a[1] + tt * dy] }
          }
          acc += segs[i] ?? 0
        }
      }
    }
    return best
  }, [hidden, markWork, objWorkPts])

  const hitTest = useCallback((p: XY): MapObject | null => {
    const lim = 8 / viewRef.current.s
    let best: MapObject | null = null, bestScore = Infinity
    for (let i = docRef.current.objects.length - 1; i >= 0; i--) {
      const o = docRef.current.objects[i]
      if (o === undefined || hidden.has(o.layer)) continue
      if (o.type === 'mark') {
        const m = markWork(o)
        if (Math.hypot(p[0] - m[0], p[1] - m[1]) < Math.max(10 / viewRef.current.s, .008)) return o
      } else if (o.type === 'line') {
        const pts = objWorkPts(o)
        const d = polyDist(p, pts, false)
        const w = Math.max(...o.widths) / 2
        if (d < Math.max(w, lim) && d < bestScore) { bestScore = d; best = o }
      } else {
        const pts = objWorkPts(o)
        const d = polyDist(p, pts, true)
        if ((inPoly(p, pts) || d < lim) && d < bestScore) { bestScore = d; best = o }
      }
    }
    return best
  }, [hidden, markWork, objWorkPts])

  /** attach 解析：挂着的端点永远跟着目标骨架走。 */
  const linePointAt = useCallback((o: LineObj, tt: number): XY => {
    const pts = objWorkPts(o)
    const segs: number[] = []
    let total = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot((pts[i + 1]?.[0] ?? 0) - (pts[i]?.[0] ?? 0), (pts[i + 1]?.[1] ?? 0) - (pts[i]?.[1] ?? 0))
      segs.push(d); total += d
    }
    let target = tt * total
    for (let i = 0; i < segs.length; i++) {
      const sd = segs[i] ?? 0
      if (target <= sd || i === segs.length - 1) {
        const a = pts[i] ?? [0, 0], b = pts[i + 1] ?? [0, 0]
        const k = sd === 0 ? 0 : target / sd
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
      }
      target -= sd
    }
    return pts[pts.length - 1] ?? [0, 0]
  }, [objWorkPts])
  const resolveAttach = useCallback((att: MapAttach | undefined): XY | null => {
    if (att === undefined) return null
    const target = docRef.current.objects.find(o => o.id === att.id)
    if (target === undefined) return null
    return target.type === 'line' ? linePointAt(target, att.t) : target.type === 'mark' ? markWork(target) : null
  }, [linePointAt, markWork])
  const resolvedPts = useCallback((o: LineObj): XY[] => {
    const pts = objWorkPts(o)
    const a = resolveAttach(o.attachStart); if (a !== null && pts.length > 0) pts[0] = a
    const b = resolveAttach(o.attachEnd); if (b !== null && pts.length > 0) pts[pts.length - 1] = b
    return pts
  }, [objWorkPts, resolveAttach])

  /* ---------- 渲染 ---------- */

  const draw = useCallback((): void => {
    const cv = cvRef.current, stage = stageRef.current
    if (cv === null || stage === null) return
    const dpr = window.devicePixelRatio || 1
    const W = stage.clientWidth, H = stage.clientHeight
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    const c = cv.getContext('2d')
    if (c === null) return
    const v = viewRef.current
    const aspect = aspectRef.current
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, W, H)

    // 整个舞台先铺羊皮纸，地图区再叠图或画细边——不留两色拼接的边。
    const g0 = c.createLinearGradient(0, 0, W, H)
    g0.addColorStop(0, '#EFE6D0'); g0.addColorStop(1, '#E2D6B8')
    c.fillStyle = g0; c.fillRect(0, 0, W, H)
    const img = imgRef.current
    c.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y)
    if (img !== null && img.complete && img.naturalWidth > 0) {
      c.drawImage(img, 0, 0, aspect, 1)
    } else {
      c.strokeStyle = 'rgba(22,24,26,.16)'; c.lineWidth = 1 / v.s
      c.strokeRect(0, 0, aspect, 1)
    }

    // 草稿笔触（存储就是语义色矢量；图生图由外部流程消费）。
    const draftVisible = mode === 'draft'
    for (const s of docRef.current.draft) {
      c.strokeStyle = s.color; c.lineCap = 'round'; c.lineJoin = 'round'
      c.globalAlpha = draftVisible ? .85 : .35
      c.lineWidth = s.r * 2
      c.beginPath()
      s.pts.forEach((p, i) => { const w = toWork(p); i === 0 ? c.moveTo(w[0], w[1]) : c.lineTo(w[0], w[1]) })
      c.stroke()
    }
    c.globalAlpha = 1

    // 坐标网格（默认关，给人参考；模型不靠它对齐）。
    if (grid) {
      c.strokeStyle = 'rgba(14,159,110,.18)'; c.lineWidth = 1 / v.s
      c.fillStyle = 'rgba(14,159,110,.55)'; c.font = `${10 / v.s}px ui-monospace, monospace`
      const step = v.s > 700 ? .02 : .05
      for (let x = 0; x <= aspect + 1e-9; x += step) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 1); c.stroke()
        if (Math.abs(x / .2 - Math.round(x / .2)) < 1e-6) c.fillText(`${Math.round(x / aspect * 100)}`, x + 1.5 / v.s, 10 / v.s)
      }
      for (let y = 0; y <= 1 + 1e-9; y += step) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(aspect, y); c.stroke()
        if (Math.abs(y / .2 - Math.round(y / .2)) < 1e-6) c.fillText(`${Math.round(y * 100)}`, 2 / v.s, y - 2 / v.s)
      }
    }

    // 对象：面填色描边、线逐段宽、地标小旗点。
    const lw = 1.5 / v.s
    for (const o of docRef.current.objects) {
      if (hidden.has(o.layer)) continue
      const on = o.id === selId
      if (o.type === 'face') {
        const pts = objWorkPts(o)
        c.beginPath()
        pts.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
        c.closePath()
        c.fillStyle = `${o.color}${on ? '4d' : '30'}`; c.fill()
        c.strokeStyle = on ? ACCENT : o.color
        c.lineWidth = on ? lw * 1.8 : lw; c.stroke()
        if (on) {
          c.fillStyle = '#fff'; c.strokeStyle = ACCENT; c.lineWidth = lw
          for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], 3 / v.s, 0, 7); c.fill(); c.stroke() }
        }
      } else if (o.type === 'line') {
        const pts = resolvedPts(o)
        c.strokeStyle = o.color; c.lineCap = 'round'; c.lineJoin = 'round'
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i] ?? [0, 0], b = pts[i + 1] ?? [0, 0]
          c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1])
          c.lineWidth = Math.max(1 / v.s, ((o.widths[i] ?? 0) + (o.widths[i + 1] ?? 0)) / 2)
          c.stroke()
        }
        if (on) {
          c.fillStyle = '#fff'; c.strokeStyle = ACCENT; c.lineWidth = lw
          for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], 3 / v.s, 0, 7); c.fill(); c.stroke() }
        }
      } else {
        const m = markWork(o)
        c.fillStyle = o.color
        c.beginPath(); c.arc(m[0], m[1], 7 / v.s, 0, 7); c.fill()
        c.strokeStyle = '#fff'; c.lineWidth = 1.5 / v.s; c.stroke()
        c.fillStyle = INK; c.font = `${11 / v.s}px sans-serif`
        if (o.name !== '') c.fillText(o.name, m[0] + 9 / v.s, m[1] - 7 / v.s)
      }
    }

    // 争议：同层面重叠（光栅求交，派生不落盘）。
    {
      const RH = 256, RW = Math.max(8, Math.round(256 * aspect))
      const counts = new Uint8Array(RW * RH)
      for (const layer of LAYERS.filter(l => l.kind === 'face')) {
        if (hidden.has(layer.id)) continue
        const faces = docRef.current.objects.filter((o): o is FaceObj => o.type === 'face' && o.layer === layer.id)
        if (faces.length < 2) continue
        const layerCounts = new Uint8Array(RW * RH)
        raster.width = RW; raster.height = RH
        if (rctx === null) continue
        for (const f of faces) {
          rctx.setTransform(1, 0, 0, 1, 0, 0)
          rctx.clearRect(0, 0, RW, RH)
          rctx.fillStyle = '#fff'
          rctx.beginPath()
          objWorkPts(f).forEach((p, i) => { i === 0 ? rctx.moveTo(p[0] * RH, p[1] * RH) : rctx.lineTo(p[0] * RH, p[1] * RH) })
          rctx.closePath(); rctx.fill()
          const px = rctx.getImageData(0, 0, RW, RH).data
          for (let i = 0; i < layerCounts.length; i++) if ((px[i * 4 + 3] ?? 0) > 0) layerCounts[i] = (layerCounts[i] ?? 0) + 1
        }
        for (let i = 0; i < counts.length; i++) if ((layerCounts[i] ?? 0) > 1) counts[i] = 1
      }
      if (counts.some(v => v === 1)) {
        const img2 = c.createImageData(RW, RH)
        for (let i = 0; i < counts.length; i++) if (counts[i] === 1) {
          img2.data[i * 4] = 214; img2.data[i * 4 + 1] = 69; img2.data[i * 4 + 2] = 65; img2.data[i * 4 + 3] = 130
        }
        raster.width = RW; raster.height = RH
        rctx?.putImageData(img2, 0, 0)
        c.imageSmoothingEnabled = false
        c.drawImage(raster, 0, 0, aspect, 1)
        c.imageSmoothingEnabled = true
      }
    }

    // 手势预览：进行中的轨迹 + 笔刷圈 + 吸附点。
    const g = gestureRef.current
    if (g.path !== undefined && g.path.length > 0) {
      c.strokeStyle = ACCENT; c.lineWidth = 1.5 / v.s
      c.setLineDash([5 / v.s, 4 / v.s])
      c.beginPath()
      g.path.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
      c.stroke(); c.setLineDash([])
      if (g.snapped != null) {
        c.fillStyle = ACCENT
        c.beginPath(); c.arc(g.snapped.point[0], g.snapped.point[1], 5 / v.s, 0, 7); c.fill()
      }
    }
    const cp = cursorRef.current
    if (cp !== null && mode !== 'edit') {
      const r = mode === 'annotate' && (drawLayer === 'landmark' || (layerKind(drawLayer) === 'face' && how === 'lasso')) ? 3 / v.s : brushPx / v.s
      c.beginPath(); c.arc(cp[0], cp[1], r, 0, 7)
      c.strokeStyle = 'rgba(22,24,26,.4)'; c.lineWidth = 1 / v.s; c.stroke()
    }
  }, [brushPx, drawLayer, grid, hidden, how, markWork, mode, objWorkPts, resolvedPts, selId, toWork])

  useEffect(() => { draw() })

  // 底图元素加载后才知道宽高比；之后一切几何都在这个 aspect 下工作。
  // fitRef 只在取景真正成功后标记——stage 还没挂载时绝不占位，等它出现再补。
  const fitRef = useRef<string | null>(null)
  const fitView = useCallback((): boolean => {
    const stage = stageRef.current
    if (stage === null || stage.clientWidth === 0 || stage.clientHeight === 0) return false
    const v = viewRef.current
    v.s = Math.min(stage.clientWidth / aspectRef.current, stage.clientHeight) * .96
    v.x = (stage.clientWidth - aspectRef.current * v.s) / 2
    v.y = (stage.clientHeight - v.s) / 2
    return true
  }, [])
  const fitIfNeeded = useCallback((): void => {
    const key = image?.resourceId ?? 'blank'
    if (fitRef.current === key) return
    if (image?.resourceId === undefined) { imgRef.current = null; aspectRef.current = 1.6 }
    if (fitView()) fitRef.current = key
  }, [image?.resourceId, fitView])
  useEffect(() => {
    if (image?.resourceId === undefined) { fitIfNeeded(); draw(); return }
    const key = image.resourceId
    const el = new Image()
    el.onload = () => {
      imgRef.current = el
      aspectRef.current = el.naturalWidth / el.naturalHeight
      fitIfNeeded()
      draw()
    }
    el.src = imageUrl(key)
    return () => { el.onload = null }
  }, [image?.resourceId, imageUrl, draw, fitIfNeeded])

  useEffect(() => {
    const stage = stageRef.current
    if (stage === null) return
    const ro = new ResizeObserver(() => { fitIfNeeded(); draw() })
    ro.observe(stage)
    return () => { ro.disconnect() }
  }, [draw, fitIfNeeded])

  /* ---------- 指针手势 ---------- */

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    cvRef.current?.setPointerCapture(e.pointerId)
    const p = workOfEvent(e)
    if (e.button === 2) { gestureRef.current = { kind: 'pan', last: [e.clientX, e.clientY] }; return }
    if (mode === 'draft') {
      busyRef.current = true
      gestureRef.current = { kind: 'paint', path: [p], moved: false }
      return
    }
    if (mode === 'annotate') {
      busyRef.current = true
      if (drawLayer === 'landmark') {
        const m: MarkObj = { id: nid(), type: 'mark', layer: 'landmark', name: '', color: '#D64541', pos: toStore(p), description: '' }
        docRef.current = { ...docRef.current, objects: [...docRef.current.objects, m] }
        setSelId(m.id)
        commit()
        busyRef.current = false
        bump()
        return
      }
      const g: Gesture = { kind: 'stroke', path: [p], moved: false }
      if (layerKind(drawLayer) === 'line') {
        g.snapStart = snapTarget(p)
        if (g.snapStart != null && g.path !== undefined) g.path[0] = g.snapStart.point
      }
      gestureRef.current = g
      return
    }
    // edit 涂抹子模式：选中面后，内部起笔=补一块、外部起笔=擦一块。
    if (mode === 'edit' && editPaint) {
      const target = sel ?? hitTest(p)
      if (target !== null && target.type === 'face') {
        setSelId(target.id)
        busyRef.current = true
        const inside = inPoly(p, objWorkPts(target))
        gestureRef.current = { kind: 'facepaint', obj: target, sign: inside ? 1 : -1, path: [p], moved: false }
        return
      }
    }
    // edit 模式：点哪块改哪块；边界抓点软拉伸，内部拖动整体移。
    const o = hitTest(p)
    setSelId(o?.id ?? null)
    setObjForm(null)
    if (o === null) { gestureRef.current = { kind: 'none' }; return }
    busyRef.current = true
    if (o.type === 'mark') { gestureRef.current = { kind: 'move', obj: o, last: p }; return }
    if (o.type === 'face') {
      const pts = objWorkPts(o)
      if (polyDist(p, pts, true) < 14 / viewRef.current.s) {
        let bi = 0, bd = Infinity, bt = 0
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i] ?? [0, 0], b = pts[(i + 1) % pts.length] ?? [0, 0]
          const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
          const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
          const dd = d2(p, [a[0] + tt * dx, a[1] + tt * dy])
          if (dd < bd) { bd = dd; bi = i; bt = tt }
        }
        if (bt > .05 && bt < .95) { o.pts.splice(bi + 1, 0, toStore(p)); bi++ }
        else if (bt >= .95) bi = (bi + 1) % o.pts.length
        gestureRef.current = { kind: 'stretch', obj: o, grab: bi, last: p, moved: false }
      } else gestureRef.current = { kind: 'move', obj: o, last: p }
      return
    }
    const pts = resolvedPts(o)
    let bi = 0, bd = Infinity, bt = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i] ?? [0, 0], b = pts[i + 1] ?? [0, 0]
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
      const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
      const dd = d2(p, [a[0] + tt * dx, a[1] + tt * dy])
      if (dd < bd) { bd = dd; bi = i; bt = tt }
    }
    const wLocal = Math.max(...o.widths) / 2 + 6 / viewRef.current.s
    if (bd ** .5 < wLocal) {
      if (bt > .05 && bt < .95) { o.pts.splice(bi + 1, 0, toStore(p)); o.widths.splice(bi + 1, 0, o.widths[bi] ?? 0.01); bi++ }
      else if (bt >= .95) bi++
      if (bi === 0) o.attachStart = undefined
      if (bi === o.pts.length - 1) o.attachEnd = undefined
      gestureRef.current = { kind: 'stretch', obj: o, grab: bi, last: p, alt: e.altKey, moved: false }
    } else gestureRef.current = { kind: 'move', obj: o, last: p }
  }, [commit, drawLayer, hitTest, markWork, mode, objWorkPts, resolvedPts, snapTarget, toStore, workOfEvent])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = workOfEvent(e)
    cursorRef.current = p
    const g = gestureRef.current
    if (g.kind === 'pan') {
      const last = g.last ?? [e.clientX, e.clientY]
      viewRef.current.x += e.clientX - last[0]
      viewRef.current.y += e.clientY - last[1]
      g.last = [e.clientX, e.clientY]
      draw(); return
    }
    if ((g.kind === 'paint' || g.kind === 'facepaint') && g.path !== undefined) {
      const last = g.path[g.path.length - 1]
      if (last === undefined || d2(p, last) > (4 / viewRef.current.s) ** 2) g.path.push(p)
      g.moved = true
      draw(); return
    }
    if (g.kind === 'stroke' && g.path !== undefined) {
      const last = g.path[g.path.length - 1]
      if (last === undefined || d2(p, last) > (3 / viewRef.current.s) ** 2) g.path.push(p)
      g.moved = true
      if (layerKind(drawLayer) === 'line') g.snapped = snapTarget(p)
      draw(); return
    }
    if (g.kind === 'move' && g.obj !== undefined) {
      const last = g.last ?? p
      const d: XY = [p[0] - last[0], p[1] - last[1]]
      g.last = p; g.moved = true
      if (g.obj.type === 'mark') g.obj.pos = toStore([markWork(g.obj)[0] + d[0], markWork(g.obj)[1] + d[1]])
      else g.obj.pts = g.obj.pts.map(q => toStore([toWork(q)[0] + d[0], toWork(q)[1] + d[1]]))
      draw(); return
    }
    if (g.kind === 'stretch' && g.obj !== undefined && g.grab !== undefined) {
      const last = g.last ?? p
      const d: XY = [p[0] - last[0], p[1] - last[1]]
      g.last = p; g.moved = true
      const o = g.obj
      if (e.altKey && o.type === 'line' && g.grab < o.widths.length) {
        o.widths[g.grab] = Math.max(.002, Math.min(.2, (o.widths[g.grab] ?? 0.01) + (d[0] + d[1]) / 2))
      } else {
        const closed = o.type === 'face'
        const pts = closed ? objWorkPts(o) : resolvedPts(o as LineObj)
        const per = pts.reduce((a, q, i) => a + Math.hypot(q[0] - (pts[(i - 1 + pts.length) % pts.length]?.[0] ?? 0), q[1] - (pts[(i - 1 + pts.length) % pts.length]?.[1] ?? 0)), 0)
        const sigma = g.sigma ?? Math.max(.05, per * .06)
        g.sigma = sigma
        const np = pullRing(pts, g.grab, d, sigma, closed)
        if (o.type !== 'mark') o.pts = np.map(toStore)
        if (o.type === 'line' && o.widths.length !== np.length) {
          o.widths = np.map((_, i) => o.widths[Math.min(i, o.widths.length - 1)] ?? 0.01)
        }
      }
      draw(); return
    }
    draw()
  }, [draw, drawLayer, markWork, objWorkPts, resolvedPts, snapTarget, toStore, toWork, workOfEvent])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const g = gestureRef.current
    gestureRef.current = { kind: 'none' }
    const releaseBusy = (): void => { busyRef.current = false }
    if (g.kind === 'pan') { draw(); return }
    if (g.kind === 'paint' && g.path !== undefined && g.path.length > 1) {
      if (erasing) {
        // 橡皮：抹过即整笔删除（原型粒度按笔不按像素）。
        const lim = brushPx / viewRef.current.s
        const draft = docRef.current.draft.filter(s =>
          !s.pts.some(q => g.path !== undefined && g.path.some(p => {
            const qw = toWork(q)
            return Math.hypot(p[0] - qw[0], p[1] - qw[1]) < lim + s.r
          })))
        docRef.current = { ...docRef.current, draft }
      } else {
        const stroke: DraftStroke = {
          color: pal?.color ?? '#8A8F94',
          r: brushPx / viewRef.current.s,
          pts: g.path.map(toStore),
        }
        docRef.current = { ...docRef.current, draft: [...docRef.current.draft, stroke] }
      }
      commit(); releaseBusy(); bump(); return
    }
    if (g.kind === 'stroke' && g.path !== undefined && g.moved === true) {
      const layer = drawLayer
      if (layerKind(drawLayer) === 'face' && how === 'lasso') {
        const pts = smoothClosed(simplify(maintain(g.path, false, .01, .002), .003))
        if (Math.abs(polyArea(pts)) > .001) {
          const f: FaceObj = { id: nid(), type: 'face', layer, name: '', color: '#7FBF8E', pts: pts.map(toStore) }
          docRef.current = { ...docRef.current, objects: [...docRef.current.objects, f] }
          setSelId(f.id)
        }
      } else if (layerKind(drawLayer) === 'face') {
        const contour = smearToContour(g.path, brushPx / viewRef.current.s, aspectRef.current)
        if (contour !== null && Math.abs(polyArea(contour)) > .001) {
          const f: FaceObj = { id: nid(), type: 'face', layer, name: '', color: '#7FBF8E', pts: contour.map(toStore) }
          docRef.current = { ...docRef.current, objects: [...docRef.current.objects, f] }
          setSelId(f.id)
        }
      } else {
        const end = workOfEvent(e)
        const snapEnd = snapTarget(end) ?? g.snapped ?? null
        const pts = simplify(g.path, .003)
        if (pts.length > 1) {
          if (snapEnd != null) pts[pts.length - 1] = snapEnd.point
          const w = brushPx / viewRef.current.s
          const line: LineObj = {
            id: nid(), type: 'line', layer, name: '', color: drawLayer === 'river' ? '#6D9DC5' : '#8A6B4F',
            pts: pts.map(toStore), widths: pts.map(() => w),
            ...(g.snapStart != null ? { attachStart: { kind: g.snapStart.kind, id: g.snapStart.id, t: g.snapStart.t } } : {}),
            ...(snapEnd != null ? { attachEnd: { kind: snapEnd.kind, id: snapEnd.id, t: snapEnd.t } } : {}),
          }
          docRef.current = { ...docRef.current, objects: [...docRef.current.objects, line] }
          setSelId(line.id)
        }
      }
      commit(); releaseBusy(); bump(); return
    }
    if (g.kind === 'facepaint' && g.obj !== undefined && g.path !== undefined && g.path.length > 1) {
      const o = g.obj
      if (o.type === 'face') {
        const next = facePaintEdit(objWorkPts(o), g.path, brushPx / viewRef.current.s, g.sign ?? 1, aspectRef.current)
        if (next !== null) o.pts = next.map(toStore)
        else docRef.current = { ...docRef.current, objects: docRef.current.objects.filter(x => x.id !== o.id) }  // 擦没了就删掉
        commit()
      }
      releaseBusy(); bump(); return
    }
    if ((g.kind === 'stretch' || g.kind === 'move') && g.obj !== undefined && g.moved === true) {
      if (g.kind === 'stretch') {
        const o = g.obj
        if (o.type !== 'mark') {
          o.pts = maintain(objWorkPts(o), o.type === 'face', .012, .0018).map(toStore)
          if (o.type === 'line') {
            while (o.widths.length < o.pts.length) o.widths.push(o.widths[o.widths.length - 1] ?? 0.01)
            o.widths = o.widths.slice(0, o.pts.length)
          }
        }
      }
      commit(); releaseBusy(); bump(); return
    }
    releaseBusy()
    draw()
  }, [brushPx, commit, drawLayer, erasing, how, markWork, objWorkPts, pal?.color, snapTarget, toStore, workOfEvent])

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const rect = cvRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const v = viewRef.current
    const s2 = Math.max(60, Math.min(4000, v.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    v.x = mx - (mx - v.x) * (s2 / v.s)
    v.y = my - (my - v.y) * (s2 / v.s)
    v.s = s2
    draw()
  }, [draw])

  /* ---------- 对象卡 ---------- */

  const openObjForm = useCallback((): void => {
    if (sel === null) return
    setObjForm({
      name: sel.name,
      color: sel.color,
      width: sel.type === 'line' ? Math.round(sel.widths.reduce((a, b) => a + b, 0) / sel.widths.length * viewRef.current.s) : brushPx,
    })
  }, [brushPx, sel])

  const deleteSel = useCallback((): void => {
    if (sel === null) return
    docRef.current = { ...docRef.current, objects: docRef.current.objects.filter(o => o.id !== sel.id) }
    setSelId(null); setObjForm(null)
    commit(); bump()
  }, [commit, sel])

  /* ---------- 无底图：两个入口——手绘草稿 / 直接生成（也可挑一张已有图） ---------- */

  const bare = image === undefined || image.resourceId === undefined
  if (bare && !started && data.objects.length === 0 && data.draft.length === 0) {
    return (
      <div className="nv-wg nv-map">
        <div className="nv-map-empty">
          <span className="nv-map-emptyicon">{glyph.map(26)}</span>
          <span>{t('wg.map.noImage')}</span>
          <div className="nv-map-entries">
            <button type="button" className="nv-map-entry"
              onClick={() => { setStarted(true); setMode('draft') }}>
              <span className="nv-map-entryicon">{glyph.layers(20)}</span>
              <span className="nv-map-entryname">{t('wg.map.entry.draw')}</span>
              <span className="nv-map-entrydesc">{t('wg.map.entry.drawDesc')}</span>
            </button>
            <button type="button" className="nv-map-entry"
              onClick={() => { void ask(t('wg.map.genPrompt')); setGenAsked(true) }}>
              <span className="nv-map-entryicon">{glyph.sparkle(20)}</span>
              <span className="nv-map-entryname">{t('wg.map.entry.gen')}</span>
              <span className="nv-map-entrydesc">{t('wg.map.entry.genDesc')}</span>
            </button>
          </div>
          {genAsked && <span className="nv-maped-mini">{t('wg.map.genSent')}</span>}
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
    <div className="nv-maped">
      <div className="nv-maped-bar">
        <div className="nv-maped-seg">
          {(['draft', 'annotate', 'edit'] as const).map(m => (
            <button key={m} type="button" className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}>{t(`wg.map.tool.${m}` as Parameters<ShellT>[0])}</button>
          ))}
        </div>
        <div className="nv-maped-layers">
          {mode !== 'draft' && LAYERS.map(l => (
            <button key={l.id} type="button"
              className={`nv-maped-chip${hidden.has(l.id) ? ' off' : ''}`}
              title={t(`wg.map.layer.${l.id}` as Parameters<ShellT>[0])}
              onClick={() => setHidden(prev => {
                const next = new Set(prev)
                next.has(l.id) ? next.delete(l.id) : next.add(l.id)
                return next
              })}>
              {t(`wg.map.layer.${l.id}` as Parameters<ShellT>[0])}
            </button>
          ))}
          <button type="button" className={`nv-maped-chip${grid ? ' cur' : ''}`} onClick={() => setGrid(v => !v)}>{t('wg.map.grid')}</button>
        </div>
      </div>
      <div className="nv-maped-stage" ref={stageRef}>
        <canvas ref={cvRef} className="nv-maped-canvas"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onPointerLeave={() => { cursorRef.current = null; draw() }}
          onWheel={onWheel} onContextMenu={e => e.preventDefault()} />
        {sel !== null && mode === 'edit' && (
          <div className="nv-maped-objcard">
            <input value={objForm?.name ?? sel.name} placeholder={t('wg.field.title')}
              onFocus={() => { if (objForm === null) openObjForm() }}
              onChange={e => setObjForm({ ...(objForm ?? { name: sel.name, color: sel.color, width: brushPx }), name: e.target.value })} />
            <input type="color" value={objForm?.color ?? sel.color}
              onChange={e => setObjForm({ ...(objForm ?? { name: sel.name, color: sel.color, width: brushPx }), color: e.target.value })} />
            {sel.type === 'line' && (
              <input type="range" min={2} max={60} value={objForm?.width ?? brushPx} title={t('wg.map.width')}
                onChange={e => setObjForm({ ...(objForm ?? { name: sel.name, color: sel.color, width: brushPx }), width: +e.target.value })} />
            )}
            <button type="button" className="nv-maped-ok" onClick={() => {
              if (objForm !== null && sel !== null) {
                sel.name = objForm.name; sel.color = objForm.color
                if (sel.type === 'line') sel.widths = sel.widths.map(() => objForm.width / viewRef.current.s)
                commit(); bump()
              }
            }}>{t('wg.save')}</button>
            <button type="button" className="nv-maped-del" onClick={deleteSel}>{t('wg.del')}</button>
          </div>
        )}
        <div className="nv-maped-panel">
          {mode === 'annotate' && (
            <>
              <div className="nv-maped-row">
                <span className="nv-maped-lab">{t('wg.map.what')}</span>
                {LAYERS.map(l => (
                  <button key={l.id} type="button" className={drawLayer === l.id ? 'on' : ''}
                    onClick={() => setDrawLayer(l.id)}>
                    {t(`wg.map.layer.${l.id}` as Parameters<ShellT>[0])}
                  </button>
                ))}
              </div>
              <div className="nv-maped-row">
                <span className="nv-maped-lab">{t('wg.map.how')}</span>
                {layerKind(drawLayer) === 'face' && (
                  <>
                    <button type="button" className={how === 'lasso' ? 'on' : ''} onClick={() => setHow('lasso')}>{t('wg.map.lasso')}</button>
                    <button type="button" className={how === 'smear' ? 'on' : ''} onClick={() => setHow('smear')}>{t('wg.map.smear')}</button>
                  </>
                )}
                {(layerKind(drawLayer) === 'line' || (layerKind(drawLayer) === 'face' && how === 'smear')) && (
                  <input type="range" min={4} max={80} value={brushPx}
                    onChange={e => setBrushPx(+e.target.value)} style={{ width: 90 }} />
                )}
                {drawLayer === 'landmark' && <span className="nv-maped-mini">{t('wg.map.hint.mark')}</span>}
              </div>
            </>
          )}
          {mode === 'draft' && (
            <>
              <div className="nv-maped-row">
                <span className="nv-maped-lab">{t('wg.map.colors')}</span>
                {docRef.current.palette.map(p => (
                  <button key={p.name} type="button" className={`nv-maped-swatch${pal?.name === p.name ? ' on' : ''}`}
                    title={p.desc}
                    onClick={() => { setPal(p); setErasing(false) }}>
                    <span className="nv-maped-dot" style={{ background: p.color }} />
                    {p.name}
                  </button>
                ))}
                <button type="button" className={erasing ? 'on' : ''} onClick={() => setErasing(v => !v)}>{t('wg.map.eraser')}</button>
                <button type="button" onClick={() => setPalForm(v => v === null ? { name: '', desc: '', color: '#7FBF8E' } : null)}>＋</button>
              </div>
              {palForm !== null && (
                <div className="nv-maped-row">
                  <input value={palForm.name} placeholder={t('wg.map.palName')} style={{ width: 70 }}
                    onChange={e => setPalForm({ ...palForm, name: e.target.value })} />
                  <input value={palForm.desc} placeholder={t('wg.map.palDesc')} style={{ flex: 1 }}
                    onChange={e => setPalForm({ ...palForm, desc: e.target.value })} />
                  <input type="color" value={palForm.color} onChange={e => setPalForm({ ...palForm, color: e.target.value })} />
                  <button type="button" className="nv-maped-ok" onClick={() => {
                    if (palForm.name.trim() !== '' && palForm.desc.trim() !== '') {
                      const entry = { name: palForm.name.trim(), desc: palForm.desc.trim(), color: palForm.color }
                      docRef.current = { ...docRef.current, palette: [...docRef.current.palette, entry] }
                      setPal(entry); setPalForm(null); commit(); bump()
                    }
                  }}>{t('wg.map.palAdd')}</button>
                </div>
              )}
              <div className="nv-maped-row">
                <span className="nv-maped-lab">{t('wg.map.brush')}</span>
                <input type="range" min={4} max={80} value={brushPx} onChange={e => setBrushPx(+e.target.value)} style={{ width: 90 }} />
                {docRef.current.draft.length > 0 && (
                  <button type="button" className="nv-maped-ok"
                    onClick={() => { void ask(t('wg.map.draftPrompt')); setGenAsked(true) }}>
                    {t('wg.map.draftToBase')}
                  </button>
                )}
                {genAsked && <span className="nv-maped-mini">{t('wg.map.genSent')}</span>}
              </div>
            </>
          )}
          {mode === 'edit' && (
            <div className="nv-maped-row">
              <button type="button" className={!editPaint ? 'on' : ''} onClick={() => setEditPaint(false)}>{t('wg.map.editStretch')}</button>
              <button type="button" className={editPaint ? 'on' : ''} onClick={() => setEditPaint(true)}>{t('wg.map.editPaint')}</button>
              {editPaint && sel?.type !== 'face' && <span className="nv-maped-mini">{t('wg.map.hint.needFace')}</span>}
              {editPaint && sel?.type === 'face' && (
                <input type="range" min={4} max={80} value={brushPx}
                  onChange={e => setBrushPx(+e.target.value)} style={{ width: 90 }} />
              )}
            </div>
          )}
        </div>
        <div className="nv-maped-hint">{t((mode === 'edit' && editPaint ? 'wg.map.hint.editPaint' : `wg.map.hint.${mode}`) as Parameters<ShellT>[0])}</div>
      </div>
    </div>
  )
}
