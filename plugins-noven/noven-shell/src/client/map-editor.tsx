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
import { getStroke } from 'perfect-freehand'
import { expandShape } from 'noven-fmg/mapgeom'
import {
  createPackQuadtree, findPackCell, generateSeed, generateWorld, getGridDims, getPolygon,
  getRiverPath, guessDraftLevel, rasterizeDraft, regionOfPoints, applyWorldEdits,
} from 'noven-fmg/world'
import type { HeightmapInput, PackGraph, World, WorldEntityEdit } from 'noven-fmg/world'
import type { CardCommand, CardModuleDoc } from './card-api.ts'
import type { ShellT } from './pages/Home.tsx'
import { fmt } from './pages/Home.tsx'
import { glyph } from './icons.tsx'
import { InlineRename, notifyUndo, useArmedPress } from './ui/interact.tsx'

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
interface DraftStroke { readonly kind?: 'stroke', readonly color: string, readonly r: number, readonly pts: XY[], readonly erase?: boolean }
/** 草稿面：AI 写粗控制点 + roughness/seed，expandShape 展开成包边轮廓；subtract 挖洞露底。 */
interface DraftShape { readonly kind: 'shape', readonly color: string, readonly ctrl: XY[], readonly roughness: number, readonly seed: number, readonly op?: 'add' | 'subtract' }
/** 草稿静多边形：展开后/裁剪后的成品轮廓。 */
interface DraftPoly { readonly kind: 'poly', readonly color: string, readonly pts: XY[], readonly op?: 'add' | 'subtract' }
type DraftEntry = DraftStroke | DraftShape | DraftPoly
interface PaletteEntry { readonly name: string, readonly desc: string, readonly color: string, readonly level?: number }
/** 草稿底层：铺满整张图的语义色；undefined = 无底层。 */
interface MapBase { readonly name: string, readonly desc: string, readonly color: string }
/** 世界生成源：与 formats.ts MapWorldSource 同构；几何是它的派生物，不落盘。 */
interface WorldSource {
  readonly seed: string
  readonly config?: Record<string, unknown>
  readonly heightmap:
    | { readonly kind: 'template', readonly template: string }
    | { readonly kind: 'script', readonly script: string }
    | { readonly kind: 'heights', readonly heights: readonly number[] }
    | { readonly kind: 'gray', readonly gray: readonly number[] }
    | { readonly kind: 'draft' }
  readonly postSteps?: readonly string[]
  /** 实体覆写：改名/删除在重算后按名或就近位置回贴。 */
  readonly edits?: readonly WorldEntityEdit[]
}
interface EditorDoc {
  readonly description: string
  readonly objects: MapObject[]
  readonly draft: DraftEntry[]
  readonly palette: PaletteEntry[]
  readonly base?: MapBase
  readonly world?: WorldSource
  readonly parent?: { readonly moduleId: string, readonly objectId?: string, readonly bbox: readonly [number, number, number, number] }
  /** 底图归一化取景框：子视图裁画面用。 */
  readonly window?: readonly [number, number, number, number]
  /** 固定宽高比：缺省由底图实测。 */
  readonly aspect?: number
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

/** 底层预设：虚空 = 未创造的留白（羊皮纸色），生图时不会被骗成地形。 */
const BASE_PRESETS: MapBase[] = [
  { name: '海', desc: 'ocean water', color: '#6D9DC5' },
  { name: '陆', desc: 'land', color: '#B8A888' },
  { name: '虚空', desc: 'uncreated void, blank parchment', color: '#E7DCC3' },
]

const ACCENT = '#0E9F6E'
const INK = '#16181A'

/* ---------- 生成世界渲染：noven 浅色调（羊皮纸陆 / 淡青水 / 灰绿生物带） ---------- */
const WATER = '#C3DCEC'
const LAKE = '#B2D0E8'
const RIVER = '#5E8FB8'
const COAST = '#A5906E'
/** FMG 生物带 id → noven 浅色；0 是 marine（陆地上不会出现）。 */
const BIOME_LIGHT = [
  '#C3DCEC', '#E9DFB6', '#DAD7C2', '#DCDAA4', '#CFDCAF', '#BEDAA0', '#ADD39E',
  '#9FD092', '#96C794', '#A6BB96', '#CFC8B0', '#EAF1F2', '#A9D0B5',
] as const
/** 草稿离屏层的像素高度（画布宽度 = DRAFT_RES × aspect）；笔迹轮廓在这个分辨率上生成。 */
const DRAFT_RES = 1024
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
let seq = 0
const nid = (): string => `mo-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** 解码 widget.data；旧卡 objects 缺省时 markers 已被服务端升成地标。 */
function editorData(raw: unknown): EditorDoc {
  const d = (raw ?? {}) as {
    description?: string
    objects?: unknown[]; draft?: unknown[]; palette?: unknown[]; markers?: unknown[]
    base?: MapBase; parent?: EditorDoc['parent']; window?: readonly [number, number, number, number]; aspect?: number
    world?: WorldSource
  }
  const objects = Array.isArray(d.objects) ? (d.objects as MapObject[]).filter(o => o !== null && typeof o === 'object') : []
  return {
    description: typeof d.description === 'string' ? d.description : '',
    objects: objects.map(o => ({ ...o, ...(o.type === 'mark' ? { pos: [...o.pos] as XY } : {}) })),
    draft: (Array.isArray(d.draft) ? d.draft : []) as DraftEntry[],
    palette: (Array.isArray(d.palette) && d.palette.length > 0 ? d.palette : DEFAULT_PALETTE) as PaletteEntry[],
    ...(d.base !== null && typeof d.base === 'object' ? { base: d.base } : {}),
    ...(d.parent !== null && typeof d.parent === 'object' ? { parent: d.parent } : {}),
    ...(Array.isArray(d.window) ? { window: d.window } : {}),
    ...(typeof d.aspect === 'number' && d.aspect > 0 ? { aspect: d.aspect } : {}),
    ...(d.world !== null && typeof d.world === 'object' ? { world: d.world } : {}),
  }
}

/** 世界源的固有宽高比（config.width/height）；AI 写的 world 不带 doc.aspect，兜底拉伸会撕裂几何对齐。 */
const worldAspectOf = (src: WorldSource | undefined): number | undefined => {
  const w = Number(src?.config?.width), h = Number(src?.config?.height)
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? w / h : undefined
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

/* ---------- 草稿笔迹：工作坐标输入，perfect-freehand 轮廓，画进离屏层 ---------- */

function draftOutline(pts: readonly XY[], r: number, done: boolean): number[][] {
  return getStroke(pts.map(p => [p[0] * DRAFT_RES, p[1] * DRAFT_RES, .5]), {
    size: r * 2 * DRAFT_RES, thinning: .45, smoothing: .6, streamline: .42, simulatePressure: true, last: done,
  })
}

/** 把一笔草稿画进离屏层；erase 笔用 destination-out 按序擦掉下面的笔触。 */
function paintDraftStroke(ctx: CanvasRenderingContext2D, pts: readonly XY[], r: number, color: string, erase: boolean, done: boolean): void {
  const outline = draftOutline(pts, r, done)
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
  ctx.fillStyle = color
  ctx.beginPath()
  if (outline.length < 3) {
    const p = pts[pts.length - 1]
    if (p !== undefined) ctx.arc(p[0] * DRAFT_RES, p[1] * DRAFT_RES, r * DRAFT_RES, 0, 7)
  } else {
    outline.forEach((p, i) => { i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]) })
    ctx.closePath()
  }
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

/** #rrggbb 按比例调暗，给草稿面描略深的包边。 */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`
}

/** 把一条草稿图元画进离屏层：笔触走 perfect-freehand，面/多边形填色+深描边，subtract/erase 都挖到透明露底层。 */
function paintDraftEntry(ctx: CanvasRenderingContext2D, e: DraftEntry, aspect: number): void {
  if (e.kind === 'shape' || e.kind === 'poly') {
    const pts = e.kind === 'shape' ? expandShape(e.ctrl, aspect, e.roughness, e.seed) : e.pts.map(p => [p[0] * aspect, p[1]] as XY)
    if (pts.length < 3) return
    ctx.globalCompositeOperation = e.op === 'subtract' ? 'destination-out' : 'source-over'
    ctx.beginPath()
    pts.forEach((p, i) => { i === 0 ? ctx.moveTo(p[0] * DRAFT_RES, p[1] * DRAFT_RES) : ctx.lineTo(p[0] * DRAFT_RES, p[1] * DRAFT_RES) })
    ctx.closePath()
    ctx.fillStyle = e.color
    ctx.fill()
    if (e.op !== 'subtract') {
      ctx.strokeStyle = darken(e.color, .8)
      ctx.lineWidth = Math.max(1.5, DRAFT_RES * .002)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    return
  }
  paintDraftStroke(ctx, e.pts, e.r, e.color, e.erase === true, true)
}

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

/* ---------- 生成世界：源 → World → 一次性离屏位图 ---------- */

interface BuiltWorld {
  readonly world: World
  readonly tree: ReturnType<typeof createPackQuadtree>
  readonly layers: ReadonlySet<WorldLayer>
  readonly canvas: HTMLCanvasElement
}

/** 语义色解析成高度：palette 显式 level 优先，否则按名字猜，最后兜底陆地。 */
const levelOfPalette = (doc: EditorDoc, color: string): number | undefined => {
  const p = doc.palette.find(e => e.color === color)
  if (p !== undefined) return p.level ?? guessDraftLevel(p.name, p.desc) ?? 40
  return guessDraftLevel(color, '')
}

/** world.heightmap 解析成管线输入；kind:'draft' 时把当前草稿栅格化（意图层直通）。 */
const worldHeightmap = (doc: EditorDoc, src: WorldSource): HeightmapInput => {
  const hm = src.heightmap
  if (hm.kind !== 'draft') return hm
  const cfg = { width: 1280, height: 800, points: 10000, ...(src.config ?? {}) }
  const dims = getGridDims(Number(cfg.width), Number(cfg.height), Number(cfg.points))
  const baseLevel = doc.base !== undefined ? (levelOfPalette(doc, doc.base.color) ?? 5) : 5
  const heights = rasterizeDraft(doc.draft, {
    cellsX: dims.cellsX, cellsY: dims.cellsY,
    aspect: doc.aspect ?? Number(cfg.width) / Number(cfg.height),
    baseLevel,
    levelOf: color => levelOfPalette(doc, color),
  })
  return { kind: 'heights', heights }
}

/** feature.vertices 顶点链 → 闭合 Path2D（世界像素坐标）。 */
const featurePath = (pack: PackGraph, featureId: number): Path2D | null => {
  const chain = pack.features[featureId]?.vertices
  if (chain === undefined || chain.length < 3) return null
  const p = new Path2D()
  let started = false
  for (const vi of chain) {
    const v = pack.vertices.p[vi]
    if (v === undefined) continue
    started ? p.lineTo(v[0], v[1]) : p.moveTo(v[0], v[1])
    started = true
  }
  if (!started) return null
  p.closePath()
  return p
}

/** 维度区域高亮路径：成员格逐个进 fill（联合填充），与异维度邻格的公共边进 border。 */
const dimRegionPath = (pack: PackGraph, dimOf: (i: number) => number, id: number): { readonly fill: Path2D, readonly border: Path2D } => {
  const cells = pack.cells, n = cells.i.length
  const fill = new Path2D(), border = new Path2D()
  for (let i = 0; i < n; i++) {
    if (dimOf(i) !== id) continue
    const poly = getPolygon(i, pack)
    if (poly.length >= 3) {
      poly.forEach((p, j) => { j === 0 ? fill.moveTo(p[0], p[1]) : fill.lineTo(p[0], p[1]) })
      fill.closePath()
    }
    for (const j of cells.c[i]) {
      if (j <= i || dimOf(j) === id) continue
      const shared = cells.v[i].filter(v => cells.v[j].includes(v))
      if (shared.length < 2) continue
      const a = pack.vertices.p[shared[0]], b = pack.vertices.p[shared[1]]
      border.moveTo(a[0], a[1]); border.lineTo(b[0], b[1])
    }
  }
  return { fill, border }
}

/** 世界图层开关：国界/路线/城镇/标签可单独显隐。 */
export type WorldLayer = 'states' | 'routes' | 'burgs' | 'names'
/** 主视图：同一批格子的不同维度——政治=国家、文化=文化区、生物=生物带、地形=高程。 */
export type WorldView = 'political' | 'cultural' | 'biomes' | 'relief'

/** 陆地按高程分档的浅色地形色带（地形视图用）。 */
const RELIEF_LIGHT = ['#DDE3C6', '#D2D7B4', '#C6C59E', '#B6AF88', '#A69A76', '#96886A', '#877661', '#786556'] as const
const reliefColor = (h: number): string =>
  h < 24 ? RELIEF_LIGHT[0] : h < 32 ? RELIEF_LIGHT[1] : h < 40 ? RELIEF_LIGHT[2] : h < 50 ? RELIEF_LIGHT[3]
    : h < 62 ? RELIEF_LIGHT[4] : h < 75 ? RELIEF_LIGHT[5] : h < 88 ? RELIEF_LIGHT[6] : RELIEF_LIGHT[7]

/** 逐格铺底色 + 按维度（国家/文化）叠色罩和分界边。dimOf 返回格的维度 id，colorOf 返回该实体色。 */
const paintDimOverlay = (c: CanvasRenderingContext2D, pack: PackGraph, n: number,
  dimOf: (i: number) => number, colorOf: (id: number) => string | undefined): void => {
  const cells = pack.cells
  for (let i = 0; i < n; i++) {
    const s = dimOf(i)
    if (s === 0 || !pack.features[cells.f[i]]?.land) continue
    const color = colorOf(s)
    if (color === undefined) continue
    const poly = getPolygon(i, pack)
    if (poly.length < 3) continue
    c.globalAlpha = .16
    c.fillStyle = color
    c.beginPath()
    poly.forEach((p, j) => { j === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
    c.closePath(); c.fill()
  }
  c.globalAlpha = 1
  // 分界：相邻格分属不同维度时描公共边
  c.strokeStyle = 'rgba(70,80,90,.45)'; c.lineWidth = 1.1
  for (let i = 0; i < n; i++) {
    const si = dimOf(i)
    if (si === 0 || cells.h[i] < 20) continue
    for (const j of cells.c[i]) {
      if (j <= i || cells.h[j] < 20 || dimOf(j) === si || dimOf(j) === 0) continue
      const shared = cells.v[i].filter(v => cells.v[j].includes(v))
      if (shared.length < 2) continue
      const a = pack.vertices.p[shared[0]], b = pack.vertices.p[shared[1]]
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke()
    }
  }
}

/** 世界 → 位图：水体垫底，陆地按视图维度填色，岸线描边，湖泊补水色，河网，城邦点+标签。 */
const paintWorld = (world: World, layers: ReadonlySet<WorldLayer>, view: WorldView): HTMLCanvasElement => {
  const { config, pack } = world
  const cv = document.createElement('canvas')
  cv.width = config.width; cv.height = config.height
  const c = cv.getContext('2d')
  if (c === null) return cv
  const cells = pack.cells
  const n = cells.i.length
  c.fillStyle = WATER; c.fillRect(0, 0, cv.width, cv.height)
  // 陆地底色：生物带视图和政治/文化视图用生物带浅色，地形视图用高程色带
  for (let i = 0; i < n; i++) {
    if (!pack.features[cells.f[i]]?.land) continue
    const poly = getPolygon(i, pack)
    if (poly.length < 3) continue
    c.fillStyle = view === 'relief'
      ? reliefColor(cells.h[i] ?? 20)
      : BIOME_LIGHT[cells.biome[i] ?? 4] ?? '#CFDCAF'
    c.beginPath()
    poly.forEach((p, j) => { j === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
    c.closePath(); c.fill()
  }
  // 维度色罩+分界：政治=国界、文化=文化界；生物/地形视图不叠
  if (view === 'political' && layers.has('states') && pack.states.length > 1) {
    paintDimOverlay(c, pack, n, i => cells.state[i] ?? 0, s => pack.states[s]?.color)
  } else if (view === 'cultural' && pack.cultures.length > 1) {
    paintDimOverlay(c, pack, n, i => cells.culture[i] ?? 0, s => pack.cultures[s]?.color)
  }
  // 湖泊补回水色 + 陆地/岛屿描岸线
  for (const f of pack.features) {
    if (f.i === 0 || f.removed) continue
    const path = featurePath(pack, f.i)
    if (path === null) continue
    if (f.type === 'lake') { c.fillStyle = LAKE; c.fill(path) }
    if (f.land) { c.strokeStyle = COAST; c.lineWidth = 1.2; c.stroke(path) }
  }
  // 河网
  c.fillStyle = RIVER
  for (const r of pack.rivers) {
    if (r.removed || r.points === undefined || r.points.length < 2) continue
    c.fill(new Path2D(getRiverPath(r.points, r.widthFactor, r.sourceWidth)))
  }
  // 路网：航线=蓝虚线，小径=细虚线，主干道=实线；压在城邦点之下
  if (layers.has('routes')) {
    for (const r of pack.routes) {
      if (r.removed || r.points.length < 2) continue
      c.beginPath()
      r.points.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
      if (r.group === 'searoutes') { c.strokeStyle = 'rgba(62,124,171,.45)'; c.lineWidth = 0.8; c.setLineDash([3, 2.4]) }
      else if (r.group === 'roads') { c.strokeStyle = 'rgba(112,86,56,.55)'; c.lineWidth = 0.9; c.setLineDash([]) }
      else { c.strokeStyle = 'rgba(112,86,56,.3)'; c.lineWidth = 0.55; c.setLineDash([1.6, 1.8]) }
      c.stroke()
    }
    c.setLineDash([])
  }
  // 城邦：都邑=双环，城镇=小点；港口描蓝
  if (layers.has('burgs')) {
    for (const b of pack.burgs) {
      if (!b?.i || b.removed) continue
      c.beginPath()
      c.arc(b.x, b.y, b.capital ? 2.4 : 1.6, 0, Math.PI * 2)
      c.fillStyle = '#FFFFFF'
      c.fill()
      c.strokeStyle = b.port ? '#3E7CAB' : '#4A4A55'
      c.lineWidth = b.capital ? 1.4 : 0.9
      c.stroke()
      if (b.capital) {
        c.beginPath()
        c.arc(b.x, b.y, 0.9, 0, Math.PI * 2)
        c.fillStyle = '#4A4A55'
        c.fill()
      }
    }
  }
  // 标签不在此烘焙——draw() 里按当前缩放做屏幕空间动态标名
  return cv
}

/** 点到折线段的最小距离²。 */
const distToSeg2 = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax, dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
}

/** 世界命中：城邦 > 路线 > 河 > 视图维度实体（国/文化/生物带）> 特征；
 *  state/culture/biome 取自被点格；隐藏的图层不参与命中。 */
type WorldHit = {
  readonly kind: 'burg' | 'route' | 'river' | 'state' | 'culture' | 'biome' | 'feature'
  readonly id: number
  readonly biome: number
  readonly state: number
  readonly culture: number
  /** 点击位置（归一化）：实体覆写 `at` 兜底匹配用。 */
  readonly pos?: XY
}
const hitWorld = (world: World, tree: BuiltWorld['tree'], wx: number, wy: number, view: WorldView, layers: ReadonlySet<WorldLayer>): WorldHit | null => {
  const cell = findPackCell(wx, wy, Infinity, tree)
  if (cell === undefined || cell >= world.pack.cells.i.length) return null
  const cells = world.pack.cells
  const biome = cells.biome[cell] ?? 0
  const state = cells.state[cell] ?? 0
  const culture = cells.culture[cell] ?? 0
  const b = cells.burg?.[cell] ?? 0
  if (layers.has('burgs') && b > 0 && world.pack.burgs[b]?.removed !== true) return { kind: 'burg', id: b, biome, state, culture }
  // 路线：距任一路线折线足够近即命中
  if (layers.has('routes')) {
    const threshold = (world.config.height / 80) ** 2
    let bestRoute = 0, bestDist = Infinity
    for (const r of world.pack.routes) {
      if (r.removed || r.points.length < 2) continue
      for (let i = 0; i + 1 < r.points.length; i++) {
        const d = distToSeg2(wx, wy, r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1])
        if (d < bestDist) { bestDist = d; bestRoute = r.i }
      }
    }
    if (bestRoute > 0 && bestDist <= threshold) return { kind: 'route', id: bestRoute, biome, state, culture }
  }
  const r = cells.r[cell] ?? 0
  if (r > 0 && world.pack.rivers[r - 1]?.removed !== true) return { kind: 'river', id: r, biome, state, culture }
  // 视图维度：点在哪个国/文化/生物带就选哪个；中立地回落到特征
  if (view === 'political' && state > 0 && world.pack.states[state]?.removed !== true) return { kind: 'state', id: state, biome, state, culture }
  if (view === 'cultural' && culture > 0 && world.pack.cultures[culture]?.removed !== true) return { kind: 'culture', id: culture, biome, state, culture }
  if (view === 'biomes' && (cells.h[cell] ?? 0) >= 20) return { kind: 'biome', id: biome, biome, state, culture }
  const f = cells.f[cell] ?? 0
  return f > 0 && world.pack.features[f]?.removed !== true ? { kind: 'feature', id: f, biome, state, culture } : null
}

/** 选中对象 → 局部视图取景框（归一化父图坐标，喂 map_spawn_view 的 bbox）。 */
const worldRegion = (built: BuiltWorld, hit: WorldHit): readonly [number, number, number, number] | null => {
  const pack = built.world.pack
  const ph = built.world.config.height
  const pw = built.world.config.width
  if (hit.kind === 'feature') {
    const chain = pack.features[hit.id]?.vertices
    if (chain === undefined || chain.length < 3) return null
    const pts = chain.map(vi => pack.vertices.p[vi]).filter((p): p is [number, number] => p !== undefined)
    return regionOfPoints(pts, pw, ph, .06)
  }
  if (hit.kind === 'river') {
    const r = pack.rivers.find(rv => rv.i === hit.id)
    if (r?.points === undefined || r.points.length < 2) return null
    return regionOfPoints(r.points.map(([x, y]) => [x, y] as [number, number]), pw, ph, .08)
  }
  if (hit.kind === 'route') {
    const r = pack.routes.find(rt => rt.i === hit.id)
    if (r === undefined || r.points.length < 2) return null
    return regionOfPoints(r.points.map(([x, y]) => [x, y] as [number, number]), pw, ph, .1)
  }
  if (hit.kind === 'state' || hit.kind === 'culture') {
    const dim = hit.kind === 'state' ? pack.cells.state : pack.cells.culture
    const pts: [number, number][] = []
    for (let i = 0; i < pack.cells.i.length; i++) if (dim[i] === hit.id) pts.push(pack.cells.p[i])
    return pts.length > 0 ? regionOfPoints(pts, pw, ph, .08) : null
  }
  if (hit.kind === 'biome') {
    return hit.pos !== undefined ? regionOfPoints([[hit.pos[0] * pw, hit.pos[1] * ph]], pw, ph, .12) : null
  }
  const b = pack.burgs.find(bg => bg?.i === hit.id)
  return b !== undefined ? regionOfPoints([[b.x, b.y]], pw, ph, .12) : null
}

/* ---------- 组件 ---------- */

type Mode = 'draft' | 'annotate' | 'edit'

// noven-fmg 接管期间暂时下线编辑交互：模块只读展示（平移/缩放/图层显隐保留）。
const MAP_EDITING = false
// noven-fmg 世界视图：生成/换种子/草稿重算与点选世界对象。
const MAP_WORLD = true
/** 标注的「画什么」就是图层本身——面的图层选择即图层 id，不再有"当前面图层"这层状态。 */
type DrawLayer = LayerId

interface Gesture {
  readonly kind: 'stroke' | 'stretch' | 'move' | 'pan' | 'paint' | 'facepaint' | 'shape' | 'none'
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
  /** 草稿子工具：抹 = 自由笔触，圈 = 套索出草稿面（落成 shape 图元，边缘由 expandShape 包）。 */
  const [draftHow, setDraftHow] = useState<'brush' | 'lasso'>('brush')
  const [grid, setGrid] = useState(false)
  const [editPaint, setEditPaint] = useState(false)
  const [picking, setPicking] = useState(false)
  /** 无底图时是否已经进了编辑器（选过「手绘草稿」）。已有草稿/对象则视为已开始。 */
  const [started, setStarted] = useState(false)
  const [genAsked, setGenAsked] = useState(false)
  const [objForm, setObjForm] = useState<{ name: string, color: string, width: number } | null>(null)
  const [palForm, setPalForm] = useState<{ name: string, desc: string, color: string } | null>(null)
  const [baseForm, setBaseForm] = useState<{ name: string, desc: string, color: string } | null>(null)

  const viewRef = useRef({ s: 200, x: 0, y: 0 })   // s = px per work unit
  const gestureRef = useRef<Gesture>({ kind: 'none' })
  const cursorRef = useRef<XY | null>(null)
  const draftLayerRef = useRef<HTMLCanvasElement | null>(null)
  const draftSrcRef = useRef<readonly DraftEntry[] | null>(null)
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  /** 世界缓存：源（draft 输入时含草稿内容）变了才重算；生成 ~0.5s 只付一次。 */
  const builtRef = useRef<{ key: string, built: BuiltWorld } | null>(null)
  const [selWorld, setSelWorld] = useState<WorldHit | null>(null)
  /** 世界实体卡：行内改名态 + 「移除」两段确认。换选中即复位。 */
  const [worldRenaming, setWorldRenaming] = useState(false)
  const worldArm = useArmedPress()
  useEffect(() => { setWorldRenaming(false); worldArm.reset() }, [selWorld, worldArm.reset])
  const [worldLayers, setWorldLayers] = useState<ReadonlySet<WorldLayer>>(() => new Set<WorldLayer>(['states', 'routes', 'burgs', 'names']))
  /** 主视图：切维度改着色/命中/实体卡，图层开关（路线/城邦/地名）与正交。 */
  const [worldView, setWorldView] = useState<WorldView>('political')
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
  /** 笔刷态：草稿笔、标注涂抹、编辑抹面，都隐藏原生光标改画笔刷圈。 */
  const brushCursor = MAP_EDITING && (mode === 'draft' || mode === 'annotate' || (mode === 'edit' && editPaint))

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
      ...(doc.world !== undefined ? { world: doc.world } : {}),
      ...(doc.base !== undefined ? { base: doc.base } : {}),
      ...(doc.parent !== undefined ? { parent: doc.parent } : {}),
      ...(doc.window !== undefined ? { window: doc.window } : {}),
      ...(doc.aspect !== undefined ? { aspect: doc.aspect } : {}),
    }
    void send({ kind: 'set_widget_data', moduleId: module.id, widget: 'map', data: payload })
  }, [module.id, send])

  /* ---------- 世界 ---------- */

  /** 世界解析：源（draft 输入含草稿/底层/调色板）或图层开关不变则直接用缓存。 */
  const resolveBuilt = useCallback((): BuiltWorld | null => {
    const doc = docRef.current
    const src = doc.world
    if (src === undefined || !MAP_WORLD) return null
    const layersKey = [...worldLayers].sort().join(',') + `|${worldView}`
    const key = src.heightmap.kind === 'draft'
      ? `${JSON.stringify(src)}|${JSON.stringify(doc.draft)}|${doc.base?.color ?? ''}|${JSON.stringify(doc.palette)}|${layersKey}`
      : `${JSON.stringify(src)}|${layersKey}`
    if (builtRef.current?.key === key) return builtRef.current.built
    try {
      const world = generateWorld({ seed: src.seed, config: src.config, heightmap: worldHeightmap(doc, src), postSteps: [...(src.postSteps ?? [])] })
      if (src.edits !== undefined && src.edits.length > 0) applyWorldEdits(world, src.edits)
      const built: BuiltWorld = { world, tree: createPackQuadtree(world.pack), layers: worldLayers, canvas: paintWorld(world, worldLayers, worldView) }
      builtRef.current = { key, built }
      return built
    } catch {
      return null // 坏源不炸画布
    }
  }, [worldLayers, worldView])

  /** 选中维度区域（国/文化/生物带）的高亮路径；随选中与缓存世界重建。 */
  const selRegion = useMemo(() => {
    if (selWorld === null) return null
    const built = resolveBuilt()
    if (built === null) return null
    const cells = built.world.pack.cells
    if (selWorld.kind === 'state') return dimRegionPath(built.world.pack, i => cells.state[i] ?? 0, selWorld.id)
    if (selWorld.kind === 'culture') return dimRegionPath(built.world.pack, i => cells.culture[i] ?? 0, selWorld.id)
    if (selWorld.kind === 'biome') return dimRegionPath(built.world.pack, i => cells.biome[i] ?? 0, selWorld.id)
    return null
  }, [selWorld, resolveBuilt])

  // localhost 调试钩子：浏览器自动化拿当前世界几何做确定性命中（不随包发到远端）。
  useEffect(() => {
    if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') return
    ;(window as { __nvMap?: unknown }).__nvMap = { resolveBuilt, view: viewRef, aspect: aspectRef }
  }, [resolveBuilt])

  // 世界出现/换源时：宽高比跟世界尺寸，重新取景。
  useEffect(() => {
    if (!MAP_WORLD) return
    const src = data.world
    if (src === undefined) { builtRef.current = null; setSelWorld(null); return }
    aspectRef.current = worldAspectOf(src) ?? aspectRef.current
    fitRef.current = null
    fitIfNeeded()
    setSelWorld(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.world])

  /** 写一份新的世界源（换种子 / 切输入源共用）。 */
  const setWorld = useCallback((src: WorldSource): void => {
    docRef.current = { ...docRef.current, world: src, aspect: worldAspectOf(src) ?? 1.6 }
    commit()
  }, [commit])

  /** 实体覆写：改名/删除记进 world.edits，重算后回贴、不被刷掉。 */
  const pushWorldEdit = useCallback((edit: WorldEntityEdit): void => {
    const src = docRef.current.world
    if (src === undefined) return
    docRef.current = { ...docRef.current, world: { ...src, edits: [...(src.edits ?? []), edit] } }
    builtRef.current = null
    commit(); bump()
  }, [commit, bump])

  /** 点选世界对象：点击未拖动时命中河 > 特征。 */
  const selectWorldAt = useCallback((p: XY): void => {
    const built = resolveBuilt()
    if (built === null) { setSelWorld(null); return }
    const h = built.world.config.height
    const hit = hitWorld(built.world, built.tree, p[0] * h, p[1] * h, worldView, built.layers)
    // pos 存 [0,1] 空间（x/宽度、y/高度），与 objects/draft/edits.at/bbox 同一约定
    setSelWorld(hit === null ? null : { ...hit, pos: [p[0] / aspectRef.current, p[1]] })
  }, [resolveBuilt, worldView])

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

  /** 草稿离屏层：草稿数组变了才整层重画（撤销、AI 写入、清空都走这里）。 */
  const ensureDraftLayer = useCallback((): HTMLCanvasElement | null => {
    const src = docRef.current.draft
    let cv = draftLayerRef.current
    if (cv === null) { cv = document.createElement('canvas'); draftLayerRef.current = cv }
    const w = Math.max(8, Math.round(DRAFT_RES * aspectRef.current))
    if (cv.width !== w || cv.height !== DRAFT_RES) { cv.width = w; cv.height = DRAFT_RES; draftSrcRef.current = null }
    if (draftSrcRef.current === src) return cv
    const ctx = cv.getContext('2d')
    if (ctx === null) return null
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    for (const s of src) {
      if (s.kind === 'shape' || s.kind === 'poly') paintDraftEntry(ctx, s, aspectRef.current)
      else paintDraftStroke(ctx, s.pts.map(toWork), s.r, s.color, s.erase === true, true)
    }
    draftSrcRef.current = src
    return cv
  }, [toWork])

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
    const win = docRef.current.window
    const built = resolveBuilt()
    c.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y)
    if (built !== null) {
      c.drawImage(built.canvas, 0, 0, built.canvas.width, built.canvas.height, 0, 0, aspect, 1)
      // 选中高亮：特征描绿边，河网描绿芯，城邦画绿圈
      if (selWorld !== null) {
        const u = 1 / built.world.config.height
        if (selWorld.kind === 'feature') {
          const path = featurePath(built.world.pack, selWorld.id)
          if (path !== null) {
            c.save(); c.scale(u, u)
            c.fillStyle = 'rgba(14,159,110,.18)'; c.fill(path)
            c.strokeStyle = ACCENT; c.lineWidth = 2.5 / v.s * built.world.config.height; c.stroke(path)
            c.restore()
          }
        } else if (selRegion !== null) {
          c.save(); c.scale(u, u)
          c.fillStyle = 'rgba(14,159,110,.16)'; c.fill(selRegion.fill)
          c.strokeStyle = ACCENT; c.lineWidth = 2.2 / v.s * built.world.config.height; c.lineJoin = 'round'
          c.stroke(selRegion.border)
          c.restore()
        } else if (selWorld.kind === 'burg') {
          const b = built.world.pack.burgs.find(bg => bg?.i === selWorld.id)
          if (b !== undefined) {
            c.save(); c.scale(u, u)
            c.strokeStyle = ACCENT; c.lineWidth = 2 / v.s * built.world.config.height
            c.beginPath(); c.arc(b.x, b.y, 4.5, 0, Math.PI * 2); c.stroke()
            c.restore()
          }
        } else if (selWorld.kind === 'route') {
          const r = built.world.pack.routes.find(rt => rt.i === selWorld.id)
          if (r !== undefined && r.points.length > 1) {
            c.save(); c.scale(u, u)
            c.strokeStyle = ACCENT; c.lineWidth = 2.5 / v.s * built.world.config.height; c.lineJoin = 'round'
            c.beginPath()
            r.points.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
            c.stroke()
            c.restore()
          }
        } else {
          const r = built.world.pack.rivers.find(rv => rv.i === selWorld.id)
          if (r?.points !== undefined && r.points.length > 1) {
            c.save(); c.scale(u, u)
            c.strokeStyle = ACCENT; c.lineWidth = 3 / v.s * built.world.config.height; c.lineJoin = 'round'
            c.stroke(new Path2D(getRiverPath(r.points, r.widthFactor, r.sourceWidth)))
            c.restore()
          }
        }
      }
      // 地名：屏幕空间动态标——字号恒定可读，按缩放决定密度，贪心避让防重叠
      if (built.layers.has('names')) {
        const pack = built.world.pack
        const k = v.s / built.world.config.height // 屏幕 px / 世界 px
        const placed: { x: number; y: number; w: number; h: number }[] = []
        c.save()
        c.setTransform(dpr, 0, 0, dpr, 0, 0)
        c.textAlign = 'center'; c.textBaseline = 'alphabetic'
        const place = (wx: number, wy: number, text: string, size: number, color: string, weight: string, force = false): void => {
          const x = wx * k + v.x, y = wy * k + v.y
          const w = text.length * size * .58, h = size
          const bx = x - w / 2, by = y - h
          if (bx < 0 || by < 0 || bx + w > W || by + h > H) return
          if (!force && placed.some(r => bx < r.x + r.w && bx + w > r.x && by < r.y + r.h && by + h > r.y)) return
          c.font = `${weight} ${size.toFixed(1)}px "LXGW WenKai", "Kaiti SC", serif`
          c.fillStyle = color
          c.fillText(text, x, y)
          placed.push({ x: bx, y: by, w, h })
        }
        // 国名：任何缩放都画，按国土面积放大
        if (built.layers.has('states')) {
          for (const s of pack.states) {
            if (!s.i || s.removed || s.pole === undefined || !s.name) continue
            const cellsN = pack.cells.i.reduce((acc, i) => acc + (pack.cells.state[i] === s.i ? 1 : 0), 0)
            const size = Math.min(10 + Math.sqrt(cellsN) * 1.1, 26)
            place(s.pole[0], s.pole[1], s.name, size, 'rgba(60,66,74,.3)', '700')
          }
        }
        // 城名分级：都城→港口/大镇→小镇，缩放越大可标越多
        if (built.layers.has('burgs')) {
          for (const b of pack.burgs) {
            if (!b?.i || b.removed || !b.name) continue
            const major = Boolean(b.capital) || Boolean(b.port) || (b.population ?? 0) >= 4
            const tier = b.capital ? 0.15 : major ? 0.5 : 1.2
            if (k < tier) continue
            const size = b.capital ? 8.5 : major ? 7.5 : 7
            const force = selWorld?.kind === 'burg' && selWorld.id === b.i
            place(b.x, b.y - (b.capital ? 3.4 : 2.6), b.name, size, force ? ACCENT : 'rgba(50,54,60,.85)', '600', force)
          }
        }
        c.restore()
      }
    } else if (img !== null && img.complete && img.naturalWidth > 0) {
      if (win !== undefined) c.drawImage(img, win[0] * img.naturalWidth, win[1] * img.naturalHeight, (win[2] - win[0]) * img.naturalWidth, (win[3] - win[1]) * img.naturalHeight, 0, 0, aspect, 1)
      else c.drawImage(img, 0, 0, aspect, 1)
    } else {
      c.strokeStyle = 'rgba(22,24,26,.16)'; c.lineWidth = 1 / v.s
      c.strokeRect(0, 0, aspect, 1)
    }

    // 草稿：base 底层先铺满（没涂到的地方显示底色），离屏层攒落定图元，
    // 正在画的笔走 scratch 合成——落笔即显色，不是松手才出。
    const draftVisible = mode === 'draft'
    const draftAlpha = draftVisible ? .9 : .35
    if (docRef.current.base !== undefined) {
      c.globalAlpha = draftAlpha
      c.fillStyle = docRef.current.base.color
      c.fillRect(0, 0, aspect, 1)
      c.globalAlpha = 1
    }
    const dl = ensureDraftLayer()
    if (dl !== null) {
      const g0 = gestureRef.current
      let source: HTMLCanvasElement = dl
      if (g0.kind === 'paint' && g0.path !== undefined && g0.path.length > 0) {
        let scratch = scratchRef.current
        if (scratch === null) { scratch = document.createElement('canvas'); scratchRef.current = scratch }
        if (scratch.width !== dl.width || scratch.height !== dl.height) { scratch.width = dl.width; scratch.height = dl.height }
        const sctx = scratch.getContext('2d')
        if (sctx !== null) {
          sctx.setTransform(1, 0, 0, 1, 0, 0)
          sctx.clearRect(0, 0, scratch.width, scratch.height)
          sctx.drawImage(dl, 0, 0)
          paintDraftStroke(sctx, g0.path, brushPx / v.s, pal?.color ?? '#8A8F94', erasing, false)
          source = scratch
        }
      }
      c.globalAlpha = draftAlpha
      c.drawImage(source, 0, 0, source.width, source.height, 0, 0, aspect, 1)
      c.globalAlpha = 1
    }

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

    // 手势预览：涂抹/加减面画自由轮廓预览；套索和线仍是虚线轨迹；草稿画笔已实时上色不重复画。
    const g = gestureRef.current
    if (g.path !== undefined && g.path.length > 0) {
      const smear = g.kind === 'facepaint' || (g.kind === 'stroke' && layerKind(drawLayer) === 'face' && how !== 'lasso')
      if (smear && g.path.length > 1) {
        const outline = draftOutline(g.path, brushPx / v.s, false)
        if (outline.length >= 3) {
          c.save()
          c.scale(1 / DRAFT_RES, 1 / DRAFT_RES)
          c.beginPath()
          outline.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
          c.closePath()
          c.fillStyle = g.kind === 'facepaint' ? (g.sign === -1 ? 'rgba(214,69,65,.28)' : 'rgba(14,159,110,.25)') : 'rgba(127,191,142,.38)'
          c.fill()
          c.restore()
        }
      } else if (g.kind !== 'paint') {
        c.strokeStyle = ACCENT; c.lineWidth = 1.5 / v.s
        c.setLineDash([5 / v.s, 4 / v.s])
        c.beginPath()
        g.path.forEach((p, i) => { i === 0 ? c.moveTo(p[0], p[1]) : c.lineTo(p[0], p[1]) })
        c.stroke(); c.setLineDash([])
      }
      if (g.snapped != null) {
        c.fillStyle = ACCENT
        c.beginPath(); c.arc(g.snapped.point[0], g.snapped.point[1], 5 / v.s, 0, 7); c.fill()
      }
    }
    // 笔刷光标：隐藏原生指针，画当前语义色/墨色的空心圈 + 中心点——一眼看到画在哪、画多大。
    const cp = cursorRef.current
    if (cp !== null && brushCursor) {
      const small = mode === 'annotate' && (drawLayer === 'landmark' || (layerKind(drawLayer) === 'face' && how === 'lasso'))
      const r = small ? 4 / v.s : brushPx / v.s
      const col = mode === 'draft' ? (erasing ? '#D64541' : pal?.color ?? INK) : INK
      c.beginPath(); c.arc(cp[0], cp[1], r, 0, 7)
      c.fillStyle = `${col}26`; c.fill()
      c.strokeStyle = col; c.lineWidth = 1.5 / v.s; c.stroke()
      c.beginPath(); c.arc(cp[0], cp[1], 1.5 / v.s, 0, 7)
      c.fillStyle = col; c.fill()
    }
  }, [brushCursor, brushPx, drawLayer, ensureDraftLayer, erasing, grid, hidden, how, markWork, mode, objWorkPts, pal?.color, resolveBuilt, resolvedPts, selId, selRegion, selWorld, toWork])

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
  // 子视图（带 window/固定 aspect）的宽高比不从底图实测——几何是按取景框归一化的。
  const aspectOf = useCallback((imgW: number, imgH: number): number => {
    const doc = docRef.current
    const wa = worldAspectOf(doc.world)
    if (wa !== undefined) return wa
    if (doc.aspect !== undefined) return doc.aspect
    const win = doc.window
    if (win !== undefined) return (win[2] - win[0]) * (imgW / imgH) / (win[3] - win[1])
    return imgW / imgH
  }, [])
  const fitIfNeeded = useCallback((): void => {
    const key = image?.resourceId ?? 'blank'
    if (fitRef.current === key) return
    if (image?.resourceId === undefined) { imgRef.current = null; aspectRef.current = worldAspectOf(docRef.current.world) ?? docRef.current.aspect ?? 1.6 }
    if (fitView()) fitRef.current = key
  }, [image?.resourceId, fitView])
  useEffect(() => {
    if (image?.resourceId === undefined) { fitIfNeeded(); draw(); return }
    const key = image.resourceId
    const el = new Image()
    el.onload = () => {
      imgRef.current = el
      aspectRef.current = aspectOf(el.naturalWidth, el.naturalHeight)
      fitIfNeeded()
      draw()
    }
    el.src = imageUrl(key)
    return () => { el.onload = null }
  }, [image?.resourceId, imageUrl, draw, fitIfNeeded, aspectOf])

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
    if (!MAP_EDITING || e.button === 2) { gestureRef.current = { kind: 'pan', last: [e.clientX, e.clientY], path: [p], moved: false }; return }
    if (mode === 'draft') {
      busyRef.current = true
      gestureRef.current = { kind: draftHow === 'lasso' ? 'shape' : 'paint', path: [p], moved: false }
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
  }, [commit, draftHow, drawLayer, hitTest, markWork, mode, objWorkPts, resolvedPts, snapTarget, toStore, workOfEvent])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = workOfEvent(e)
    cursorRef.current = p
    const g = gestureRef.current
    if (g.kind === 'pan') {
      const last = g.last ?? [e.clientX, e.clientY]
      if (Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 2) g.moved = true
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
    if ((g.kind === 'stroke' || g.kind === 'shape') && g.path !== undefined) {
      const last = g.path[g.path.length - 1]
      if (last === undefined || d2(p, last) > (3 / viewRef.current.s) ** 2) g.path.push(p)
      g.moved = true
      if (g.kind === 'stroke' && layerKind(drawLayer) === 'line') g.snapped = snapTarget(p)
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
    if (g.kind === 'pan') {
      if (g.moved !== true && g.path?.[0] !== undefined) { setSelId(null); selectWorldAt(g.path[0]) }
      draw(); return
    }
    if (g.kind === 'paint' && g.path !== undefined && g.path.length > 1) {
      // 橡皮也是一笔：渲染时 destination-out 擦掉下方草稿，撤销粒度仍是一笔。
      const stroke: DraftStroke = {
        color: erasing ? '#000000' : pal?.color ?? '#8A8F94',
        r: brushPx / viewRef.current.s,
        pts: g.path.map(toStore),
        ...(erasing ? { erase: true } : {}),
      }
      docRef.current = { ...docRef.current, draft: [...docRef.current.draft, stroke] }
      commit(); releaseBusy(); bump(); return
    }
    if (g.kind === 'shape' && g.path !== undefined && g.path.length > 2) {
      // 圈地：套索轨迹抽稀成控制点 → shape 图元，边缘由 expandShape 确定性展开。
      const ctrl = simplify(g.path, .015).slice(0, 20).map(toStore)
      if (ctrl.length >= 3) {
        const shape: DraftShape = {
          kind: 'shape', color: pal?.color ?? '#8A8F94', ctrl,
          roughness: .28, seed: (Math.random() * 0xFFFFFFFF) >>> 0,
        }
        docRef.current = { ...docRef.current, draft: [...docRef.current.draft, shape] }
        commit(); releaseBusy(); bump(); return
      }
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
  }, [brushPx, commit, drawLayer, erasing, how, markWork, objWorkPts, pal?.color, selectWorldAt, snapTarget, toStore, workOfEvent])

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

  /* ---------- 世界选中卡 ---------- */

  const builtNow = MAP_WORLD ? resolveBuilt() : null
  const selRiver = selWorld?.kind === 'river' ? builtNow?.world.pack.rivers.find(r => r.i === selWorld.id) : undefined
  const selRoute = selWorld?.kind === 'route' ? builtNow?.world.pack.routes.find(r => r.i === selWorld.id) : undefined
  const selFeature = selWorld?.kind === 'feature' ? builtNow?.world.pack.features[selWorld.id] : undefined
  const selBurg = selWorld?.kind === 'burg' ? builtNow?.world.pack.burgs.find(b => b?.i === selWorld.id) : undefined
  const selStateEnt = selWorld?.kind === 'state' ? builtNow?.world.pack.states[selWorld.id] : undefined
  const selCultureEnt = selWorld?.kind === 'culture' ? builtNow?.world.pack.cultures[selWorld.id] : undefined
  const selBiomeEnt = selWorld?.kind === 'biome' ? builtNow?.world.pack.biomes[selWorld.id] : undefined
  const selState = selWorld !== null && selWorld !== undefined ? builtNow?.world.pack.states[selWorld.state] : undefined
  const selCulture = selWorld !== null && selWorld !== undefined ? builtNow?.world.pack.cultures[selWorld.culture] : undefined
  /** 占位实体名本地化成显示名；覆写 `key` 仍用原名。 */
  const dimName = (name: string | undefined): string | undefined =>
    name === 'Neutrals' ? t('wg.map.world.neutrals') : name === 'Wildlands' ? t('wg.map.world.wildlands') : name
  const selNameRaw = (selBurg?.name ?? selRiver?.name ?? selRoute?.name ?? selStateEnt?.name ?? selCultureEnt?.name ?? selFeature?.name) ?? ''
  const selName = selBiomeEnt !== undefined
    ? t(`wg.map.world.biome.${selBiomeEnt.i}` as Parameters<ShellT>[0])
    : dimName(selNameRaw) ?? ''
  const selKindKey = selBurg !== undefined ? 'burg' : selRiver !== undefined ? 'river' : selRoute !== undefined ? `route.${selRoute.group}`
    : selStateEnt !== undefined ? 'state' : selCultureEnt !== undefined ? 'culture' : selBiomeEnt !== undefined ? 'biome' : selFeature?.type

  /* ---------- 无底图：两个入口——手绘草稿 / 直接生成（也可挑一张已有图） ---------- */

  const bare = image === undefined || image.resourceId === undefined
  if (bare && !started && data.objects.length === 0 && data.draft.length === 0 && data.base === undefined && data.world === undefined) {
    return (
      <div className="nv-wg nv-map">
        <div className="nv-map-empty">
          <span className="nv-map-emptyicon">{glyph.map(26)}</span>
          <span>{t('wg.map.noImage')}</span>
          {MAP_WORLD && (
          <div className="nv-map-entries">
            <button type="button" className="nv-map-entry"
              onClick={() => setWorld({ seed: generateSeed(), heightmap: { kind: 'template', template: 'continents' } })}>
              <span className="nv-map-entryicon">{glyph.globe(20)}</span>
              <span className="nv-map-entryname">{t('wg.map.world.new')}</span>
              <span className="nv-map-entrydesc">{t('wg.map.world.newDesc')}</span>
            </button>
          </div>
          )}
          {MAP_EDITING && (
          <div className="nv-map-entries">
            <button type="button" className="nv-map-entry"
              onClick={() => {
                setStarted(true); setMode('draft')
                // 默认底层铺海：画布不再是"未知"，手绘往海上加陆地。
                if (docRef.current.base === undefined) {
                  docRef.current = { ...docRef.current, base: BASE_PRESETS[0] }
                  commit()
                }
              }}>
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
          )}
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
        {MAP_EDITING && (
        <div className="nv-maped-seg">
          {(['draft', 'annotate', 'edit'] as const).map(m => (
            <button key={m} type="button" className={mode === m ? 'on' : ''}
              onClick={() => setMode(m)}>{t(`wg.map.tool.${m}` as Parameters<ShellT>[0])}</button>
          ))}
        </div>
        )}
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
        {MAP_WORLD && (
        <div className="nv-maped-world">
          {data.world === undefined ? (
            data.draft.length > 0 && (
              <button type="button" className="nv-maped-chip"
                onClick={() => setWorld({ seed: generateSeed(), heightmap: { kind: 'draft' }, postSteps: ['Smooth 2 0 0 0'] })}>
                {t('wg.map.world.draftBtn')}
              </button>
            )
          ) : (
            <>
              <div className="nv-maped-seg" role="group" aria-label={t('wg.map.world.view')}>
                {(['political', 'cultural', 'biomes', 'relief'] as const).map(v => (
                  <button key={v} type="button" className={worldView === v ? 'on' : ''}
                    onClick={() => { setWorldView(v); setSelWorld(null) }}>
                    {t(`wg.map.world.view.${v}` as Parameters<ShellT>[0])}
                  </button>
                ))}
              </div>
              {(['states', 'routes', 'burgs', 'names'] as const)
                .filter(l => l !== 'states' || worldView === 'political')
                .map(l => (
                <button key={l} type="button"
                  className={`nv-maped-chip${worldLayers.has(l) ? '' : ' off'}`}
                  onClick={() => setWorldLayers(prev => {
                    const next = new Set(prev)
                    next.has(l) ? next.delete(l) : next.add(l)
                    return next
                  })}>
                  {t(`wg.map.world.layer.${l}` as Parameters<ShellT>[0])}
                </button>
              ))}
              <button type="button" className="nv-maped-chip"
                onClick={() => data.world !== undefined && setWorld({ ...data.world, seed: generateSeed() })}>
                {t('wg.map.world.reseed')}
              </button>
              {data.draft.length > 0 && data.world.heightmap.kind !== 'draft' && (
                <button type="button" className="nv-maped-chip"
                  onClick={() => data.world !== undefined && setWorld({ ...data.world, heightmap: { kind: 'draft' } })}>
                  {t('wg.map.world.regen')}
                </button>
              )}
            </>
          )}
        </div>
        )}
      </div>
      <div className="nv-maped-stage" ref={stageRef}>
        <canvas ref={cvRef} className="nv-maped-canvas"
          style={brushCursor ? { cursor: 'none' } : undefined}
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
            {sel.type === 'face' && (
              <button type="button" className="nv-maped-ok" title={t('wg.map.spawnDesc')}
                onClick={() => { void send({ kind: 'map_spawn_view', moduleId: module.id, objectId: sel.id, aspect: aspectRef.current }) }}>
                {t('wg.map.spawnView')}
              </button>
            )}
            <button type="button" className="nv-maped-del" onClick={deleteSel}>{t('wg.del')}</button>
          </div>
        )}
        {selWorld !== null && selKindKey !== undefined && (() => {
          const kindText = selKindKey !== undefined ? t(`wg.map.world.kind.${selKindKey}` as Parameters<ShellT>[0]) : ''
          const displayName = selName !== '' ? selName : kindText
          const parts = [kindText]
          if (selBurg !== undefined) {
            if (selBurg.capital) parts.push(t('wg.map.world.burg.capital'))
            if (selBurg.port) parts.push(t('wg.map.world.burg.port'))
          }
          if (selRiver !== undefined && selRiver.type !== '') parts.push(t(`wg.map.world.riv.${selRiver.type}` as Parameters<ShellT>[0]))
          if (selFeature !== undefined && selFeature.subtype !== '') parts.push(t(`wg.map.world.sub.${selFeature.subtype}` as Parameters<ShellT>[0]))
          if (selFeature?.land === true) parts.push(t(`wg.map.world.biome.${selWorld.biome}` as Parameters<ShellT>[0]))
          if (selStateEnt !== undefined) {
            const cap = builtNow?.world.pack.burgs.find(b => b?.i === selStateEnt.capital)
            if (cap?.name !== undefined && cap.name !== '') parts.push(`${t('wg.map.world.stateCapital')}${cap.name}`)
          }
          if (selCultureEnt !== undefined && selCultureEnt.type !== undefined) parts.push(t(`wg.map.world.cult.${selCultureEnt.type}` as Parameters<ShellT>[0]))
          if (selState?.name !== undefined) parts.push(dimName(selState.name) ?? '')
          if (selCulture?.name !== undefined) parts.push(dimName(selCulture.name) ?? '')
          return (
          <div className="nv-maped-wcard">
            {worldRenaming ? (
              <InlineRename className="nv-maped-wname nv-maped-wnamein" value={selName}
                onDone={next => {
                  setWorldRenaming(false)
                  if (next !== undefined && selWorld !== null && selWorld.kind !== 'biome') {
                    pushWorldEdit({ kind: selWorld.kind, id: selWorld.id, ...(selNameRaw !== '' ? { key: selNameRaw } : {}), ...(selWorld.pos !== undefined ? { at: selWorld.pos } : {}), name: next, lock: true })
                  }
                }} />
            ) : (
              <span className="nv-maped-wname">{displayName}</span>
            )}
            <span className="nv-maped-mini">{parts.filter((p, i) => p !== '' && parts.indexOf(p) === i).join(' · ')}</span>
            <button type="button" className="nv-maped-ok"
              onClick={() => { void ask(fmt(t, 'wg.map.world.askText', { name: displayName })) }}>
              {t('wg.map.world.ask')}
            </button>
            {selWorld.kind !== 'biome' && (
            <>
            <button type="button" className="nv-maped-ok" title={t('wg.map.world.renameDesc')}
              onClick={() => setWorldRenaming(true)}>
              {t('wg.map.world.rename')}
            </button>
            <button type="button" className="nv-maped-del nv-armbtn" title={t('wg.map.world.removeDesc')}
              data-armed={worldArm.armed === 'remove' || undefined}
              onClick={() => {
                if (selWorld === null || !worldArm.press('remove') || selWorld.kind === 'biome') return
                pushWorldEdit({ kind: selWorld.kind, id: selWorld.id, ...(selNameRaw !== '' ? { key: selNameRaw } : {}), ...(selWorld.pos !== undefined ? { at: selWorld.pos } : {}), remove: true })
                setSelWorld(null)
                notifyUndo({ text: fmt(t, 'ui.receipt.worldRemoved', { name: displayName }) })
              }}>
              {worldArm.armed === 'remove' ? t('ui.armed.remove') : t('wg.map.world.remove')}
            </button>
            </>
            )}
            <button type="button" className="nv-maped-ok" title={t('wg.map.world.spawnDesc')}
              onClick={() => {
                const bbox = builtNow !== null && selWorld !== null ? worldRegion(builtNow, selWorld) : null
                if (bbox !== null) void send({ kind: 'map_spawn_view', moduleId: module.id, bbox, aspect: aspectRef.current })
              }}>
              {t('wg.map.world.spawn')}
            </button>
            <button type="button" className="nv-maped-del" onClick={() => setSelWorld(null)}>×</button>
          </div>
          )
        })()}
        {MAP_WORLD && (
        <div className="nv-maped-note">{t('wg.map.world.note')}</div>
        )}
        {MAP_EDITING && (
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
                <span className="nv-maped-lab">{t('wg.map.base')}</span>
                {BASE_PRESETS.map(b => (
                  <button key={b.name} type="button"
                    className={`nv-maped-swatch${docRef.current.base?.name === b.name && docRef.current.base?.color === b.color ? ' on' : ''}`}
                    title={b.desc}
                    onClick={() => { docRef.current = { ...docRef.current, base: b }; commit(); bump() }}>
                    <span className="nv-maped-dot" style={{ background: b.color }} />
                    {b.name}
                  </button>
                ))}
                <button type="button"
                  className={`nv-maped-swatch${docRef.current.base === undefined ? ' on' : ''}`}
                  title={t('wg.map.baseNoneDesc')}
                  onClick={() => { const { base: _drop, ...rest } = docRef.current; docRef.current = rest; commit(); bump() }}>
                  {t('wg.map.baseNone')}
                </button>
                <button type="button" onClick={() => setBaseForm(v => v === null ? { name: '', desc: '', color: '#8A8F94' } : null)}>＋</button>
              </div>
              {baseForm !== null && (
                <div className="nv-maped-row">
                  <input value={baseForm.name} placeholder={t('wg.map.palName')} style={{ width: 70 }}
                    onChange={e => setBaseForm({ ...baseForm, name: e.target.value })} />
                  <input value={baseForm.desc} placeholder={t('wg.map.palDesc')} style={{ flex: 1 }}
                    onChange={e => setBaseForm({ ...baseForm, desc: e.target.value })} />
                  <input type="color" value={baseForm.color} onChange={e => setBaseForm({ ...baseForm, color: e.target.value })} />
                  <button type="button" className="nv-maped-ok" onClick={() => {
                    if (baseForm.name.trim() !== '') {
                      docRef.current = { ...docRef.current, base: { name: baseForm.name.trim(), desc: baseForm.desc.trim(), color: baseForm.color } }
                      setBaseForm(null); commit(); bump()
                    }
                  }}>{t('wg.map.palAdd')}</button>
                </div>
              )}
              <div className="nv-maped-row">
                <span className="nv-maped-lab">{t('wg.map.colors')}</span>
                <button type="button" className={draftHow === 'brush' ? 'on' : ''} onClick={() => setDraftHow('brush')}>{t('wg.map.draftBrush')}</button>
                <button type="button" className={draftHow === 'lasso' ? 'on' : ''} onClick={() => setDraftHow('lasso')}>{t('wg.map.draftLasso')}</button>
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
        )}
        {MAP_EDITING && (
        <div className="nv-maped-hint">{t((mode === 'edit' && editPaint ? 'wg.map.hint.editPaint' : `wg.map.hint.${mode}`) as Parameters<ShellT>[0])}</div>
        )}
      </div>
    </div>
  )
}
