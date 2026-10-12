/**
 * 地图草稿的共享几何——纯数学，无平台依赖。
 * noven-cards（裁剪/生成子视图）、noven-shell 客户端（渲染草稿面）与离线
 * 控制图脚本三方共用同一份实现，保证同一个 `seed`/`roughness` 在任何一侧
 * 展开出的轮廓逐点一致。
 * @module noven-draw-map/mapgeom
 */

/** 平面点；草稿面在「图高单位」空间展开（x∈[0,aspect]，y∈[0,1]）。 */
export type GXY = readonly [number, number]

/** 子视图取景框：父图归一化坐标里的 [x0, y0, x1, y1]。 */
export type GBBox = readonly [number, number, number, number]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** 确定性伪随机（mulberry32）：同一 seed 逐点同序，跨端可复现。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 闭合折线的 Chaikin 切角（每边生出 3/4、1/4 两点），让控制点先变成顺滑粗轮廓。 */
export function chaikinClosed(pts: readonly GXY[], iterations: number): GXY[] {
  let cur = pts.map(p => [p[0], p[1]] as GXY)
  for (let it = 0; it < iterations; it++) {
    const out: GXY[] = []
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i] ?? [0, 0], b = cur[(i + 1) % cur.length] ?? [0, 0]
      out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75])
    }
    cur = out
  }
  return cur
}

/**
 * 草稿面展开：粗控制点 → Chaikin 平滑 → 中点位移分形，得到包边的闭合
 * 多边形。`roughness`（0..1）是每级位移幅度占边长的比例，`seed` 决定
 * 位移序列——同参数同结果，AI 写少量控制点即可得到自然海岸线。
 * @param ctrl - 控制点环（归一化 [0,1] 坐标，≥3 点）。
 * @param aspect - 展开空间的宽高比（图高单位），位移在此空间各向同性。
 * @param roughness - 边缘粗糙度；0 = 纯平滑轮廓。
 * @param seed - 位移序列种子。
 * @returns 图高单位空间的闭合多边形点列。
 */
export function expandShape(ctrl: readonly GXY[], aspect: number, roughness: number, seed: number): GXY[] {
  if (ctrl.length < 3) return ctrl.map(p => [clamp(p[0], 0, 1) * aspect, clamp(p[1], 0, 1)] as GXY)
  const rough = clamp(roughness, 0, 1)
  // 控制点→工作空间，先切两轮角再分形。
  let pts = chaikinClosed(ctrl.map(p => [clamp(p[0], 0, 1) * aspect, clamp(p[1], 0, 1)] as GXY), 2)
  const rng = mulberry32(seed)
  // 中点位移 3 级：每级幅度减半，细节逐层叠加但不失控。
  let amp = rough * .5
  for (let level = 0; level < 3 && amp > .0005; level++) {
    const out: GXY[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] ?? [0, 0], b = pts[(i + 1) % pts.length] ?? [0, 0]
      out.push(a)
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) {
        const off = (rng() * 2 - 1) * len * amp
        out.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off])
      }
    }
    pts = out
    amp *= .5
  }
  return pts.map(p => [clamp(p[0], 0, aspect), clamp(p[1], 0, 1)] as GXY)
}

/** 点列的外接框（图高单位或归一化空间通用——调用方保持同一空间）。 */
export function bboxOf(pts: readonly GXY[]): GBBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1])
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1])
  }
  return pts.length === 0 ? [0, 0, 0, 0] : [x0, y0, x1, y1]
}

/** 外接框向外扩 `pad`（按框自身短边比例），再钳回 [0,1]。 */
export function padBBox(bbox: GBBox, pad: number, minSpan: number): GBBox {
  const span = Math.max(Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]), minSpan)
  const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2
  const w = (bbox[2] - bbox[0]) * (1 + pad * 2), h = (bbox[3] - bbox[1]) * (1 + pad * 2)
  const hw = Math.max(w, span * .5) / 2, hh = Math.max(h, span * .5) / 2
  return [clamp(cx - hw, 0, 1), clamp(cy - hh, 0, 1), clamp(cx + hw, 0, 1), clamp(cy + hh, 0, 1)]
}

/** 点是否落在框内（含边界）。 */
export function inBBox(p: GXY, bbox: GBBox): boolean {
  return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3]
}

/** Sutherland–Hodgman：闭合多边形裁剪到矩形；裁没了返回空数组。 */
export function clipPolygonRect(pts: readonly GXY[], bbox: GBBox): GXY[] {
  let cur = pts.map(p => [p[0], p[1]] as GXY)
  const edges: { keep: (p: GXY) => boolean, cross: (a: GXY, b: GXY) => GXY }[] = [
    { keep: p => p[0] >= bbox[0], cross: (a, b) => [bbox[0], a[1] + (b[1] - a[1]) * tX(a, b, bbox[0])] },
    { keep: p => p[0] <= bbox[2], cross: (a, b) => [bbox[2], a[1] + (b[1] - a[1]) * tX(a, b, bbox[2])] },
    { keep: p => p[1] >= bbox[1], cross: (a, b) => [a[0] + (b[0] - a[0]) * tY(a, b, bbox[1]), bbox[1]] },
    { keep: p => p[1] <= bbox[3], cross: (a, b) => [a[0] + (b[0] - a[0]) * tY(a, b, bbox[3]), bbox[3]] },
  ]
  for (const edge of edges) {
    const out: GXY[] = []
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i] ?? [0, 0], b = cur[(i + 1) % cur.length] ?? [0, 0]
      const ai = edge.keep(a), bi = edge.keep(b)
      if (bi) { if (!ai) out.push(edge.cross(a, b)); out.push(b) }
      else if (ai) out.push(edge.cross(a, b))
    }
    cur = out
  }
  return cur
}
const tX = (a: GXY, b: GXY, x: number): number => (b[0] - a[0]) === 0 ? 0 : (x - a[0]) / (b[0] - a[0])
const tY = (a: GXY, b: GXY, y: number): number => (b[1] - a[1]) === 0 ? 0 : (y - a[1]) / (b[1] - a[1])

/** 开放折线裁剪到矩形：框内保留原段，跨界切出断点，可能拆成多段。 */
export function clipPolylineRect(pts: readonly GXY[], bbox: GBBox): GXY[][] {
  const out: GXY[][] = []
  let run: GXY[] = []
  const flush = (): void => { if (run.length > 1) out.push(run); run = [] }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] ?? [0, 0]
    if (inBBox(p, bbox)) {
      const prev = pts[i - 1]
      if (prev !== undefined && !inBBox(prev, bbox)) run.push(edgeCross(prev, p, bbox))
      run.push(p)
    } else {
      const prev = pts[i - 1]
      if (prev !== undefined && inBBox(prev, bbox)) run.push(edgeCross(prev, p, bbox))
      flush()
    }
  }
  flush()
  return out
}

/** 框外点与框内点连线在矩形边上的交点（逐边逼近，取最近解）。 */
function edgeCross(outside: GXY, inside: GXY, bbox: GBBox): GXY {
  let a = outside, b = inside
  for (const [axis, lo, hi] of [[0, bbox[0], bbox[2]], [1, bbox[1], bbox[3]]] as const) {
    for (const bound of [lo, hi]) {
      const av = a[axis], bv = b[axis]
      const aIn = av >= (axis === 0 ? bbox[0] : bbox[1]) && av <= (axis === 0 ? bbox[2] : bbox[3])
      const bIn = bv >= (axis === 0 ? bbox[0] : bbox[1]) && bv <= (axis === 0 ? bbox[2] : bbox[3])
      if (aIn === bIn) continue
      const t = (bv - av) === 0 ? 0 : (bound - av) / (bv - av)
      const hit: GXY = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      if (aIn) a = hit; else b = hit
    }
  }
  return a
}

/** 父图归一化点 → 子图归一化点（以取景框重归一化，越界点钳回框内）。 */
export function toChild(p: GXY, bbox: GBBox): GXY {
  const w = Math.max(bbox[2] - bbox[0], 1e-6), h = Math.max(bbox[3] - bbox[1], 1e-6)
  return [clamp((p[0] - bbox[0]) / w, 0, 1), clamp((p[1] - bbox[1]) / h, 0, 1)]
}
