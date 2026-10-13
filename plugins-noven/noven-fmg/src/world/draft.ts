/**
 * 语义草稿 → 高度栅格桥：把地图模块的 draft 图元（stroke/shape/poly）按叠放
 * 顺序逐格采样成 0-100 高度数组，喂给 generateWorld({kind:'heights'})。
 * 擦除/subtract 挖回底层；未涂到的格取 baseLevel。坐标与地图存储一致：
 * 归一化 [0,1]，x 是宽比、y 是高比；工作空间 x 乘 aspect 后各向同性。
 * @module noven-fmg/world/draft
 */
import { expandShape, type GXY } from '../mapgeom.ts'

export interface DraftStrokeInput {
  readonly kind?: 'stroke'
  readonly color: string
  readonly r: number
  readonly pts: readonly GXY[]
  readonly erase?: boolean
}
export interface DraftShapeInput {
  readonly kind: 'shape'
  readonly color: string
  readonly ctrl: readonly GXY[]
  readonly roughness: number
  readonly seed: number
  readonly op?: 'add' | 'subtract'
}
export interface DraftPolyInput {
  readonly kind: 'poly'
  readonly color: string
  readonly pts: readonly GXY[]
  readonly op?: 'add' | 'subtract'
}
export type DraftEntryInput = DraftStrokeInput | DraftShapeInput | DraftPolyInput

export interface DraftRasterOptions {
  readonly cellsX: number
  readonly cellsY: number
  /** 画布宽高比（存储 x 归一化后还原工作坐标用）。 */
  readonly aspect: number
  /** 底层高度：没被任何图元盖住的格、以及被擦除后露出的格都取它。 */
  readonly baseLevel: number
  /** 语义色 → 高度（0-100，20 是海平线）；返回 undefined 的色不画。 */
  readonly levelOf: (color: string) => number | undefined
}

interface Painted {
  readonly level: number | null // null = 擦回底层
  readonly kind: 'poly' | 'stroke'
  readonly poly?: readonly GXY[] // 工作坐标
  readonly line?: readonly GXY[] // 工作坐标
  readonly rr?: number           // 工作半径平方
  readonly bbox: readonly [number, number, number, number]
}

const inPoly = (x: number, y: number, pts: readonly GXY[]): boolean => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!, pj = pts[j]!
    if ((pi[1] > y) !== (pj[1] > y) && x < (pj[0] - pi[0]) * (y - pi[1]) / (pj[1] - pi[1]) + pi[0]) inside = !inside
  }
  return inside
}

const distToLine = (x: number, y: number, pts: readonly GXY[]): number => {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const d = (x - (a[0] + t * dx)) ** 2 + (y - (a[1] + t * dy)) ** 2
    if (d < best) best = d
  }
  return best
}

const bboxOfLine = (pts: readonly GXY[], pad: number): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]
    if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

const toWork = (pts: readonly GXY[], aspect: number): GXY[] => pts.map(p => [p[0] * aspect, p[1]])

/**
 * 逐格重放草稿：每格中心在工作空间测一遍图元栈，最后一笔生效。
 * @returns cellsX×cellsY 的 0-100 高度数组，行主序，可直接作 heights 输入。
 */
export function rasterizeDraft(entries: readonly DraftEntryInput[], opts: DraftRasterOptions): Uint8Array {
  const { cellsX, cellsY, aspect, baseLevel, levelOf } = opts
  const layers: Painted[] = []
  for (const e of entries) {
    const wipe = e.kind === 'shape' || e.kind === 'poly' ? e.op === 'subtract' : e.erase === true
    const level = wipe ? null : levelOf(e.color)
    if (level === undefined) continue
    if (e.kind === 'shape' || e.kind === 'poly') {
      const raw = e.kind === 'shape' ? expandShape(e.ctrl, aspect, e.roughness, e.seed) : e.pts
      const poly = toWork(raw, aspect)
      if (poly.length < 3) continue
      layers.push({ level, kind: 'poly', poly, bbox: bboxOfLine(poly, 0) })
    } else {
      const line = toWork(e.pts, aspect)
      if (line.length === 0) continue
      layers.push({ level, kind: 'stroke', line, rr: e.r * e.r, bbox: bboxOfLine(line, e.r) })
    }
  }
  const out = new Uint8Array(cellsX * cellsY)
  const clamp = (v: number): number => Math.min(100, Math.max(0, Math.round(v)))
  for (let row = 0; row < cellsY; row++) {
    const y = (row + .5) / cellsY
    for (let col = 0; col < cellsX; col++) {
      const x = (col + .5) / cellsX * aspect
      let painted = baseLevel
      for (const layer of layers) {
        const [x0, y0, x1, y1] = layer.bbox
        if (x < x0 || x > x1 || y < y0 || y > y1) continue
        const hit = layer.kind === 'poly'
          ? inPoly(x, y, layer.poly!)
          : layer.line!.length === 1
            ? (x - layer.line![0]![0]) ** 2 + (y - layer.line![0]![1]) ** 2 <= layer.rr!
            : distToLine(x, y, layer.line!) <= layer.rr!
        if (hit) painted = layer.level ?? baseLevel
      }
      out[row * cellsX + col] = clamp(painted)
    }
  }
  return out
}

/**
 * 语义名兜底高度：palette 没写 level 时按名字猜（中文/英文关键词），
 * 猜不到返回 undefined。20 是海平线。
 */
export function guessDraftLevel(name: string, desc: string): number | undefined {
  const text = `${name} ${desc}`.toLowerCase()
  if (/(深海|abyss|deep)/.test(text)) return 3
  if (/(海|洋|ocean|sea|water)/.test(text)) return 8
  if (/(湖|lake|pond)/.test(text)) return 16
  if (/(沼|湿地|swamp|marsh|wetland)/.test(text)) return 21
  if (/(峰|雪山|peak)/.test(text)) return 88
  if (/(山|高|mount|hill|高地|岭)/.test(text)) return 75
  if (/(丘|坡)/.test(text)) return 45
  if (/(陆|地|草|林|森|原|田|land|plain|forest|grass|wood|meadow|island|岛)/.test(text)) return 40
  if (/(漠|沙|desert|sand|戈壁)/.test(text)) return 35
  return undefined
}
