// PNG 高程图导入：AI 写 {"kind":"png","path":"east-asia"|绝对路径}，
// 写入前解码重采样成标准 {"kind":"gray"} 落盘——存盘格式不变，客户端无需 PNG 依赖。
// 内置库来自 noven-fmg/assets/heightmaps（FMG MIT，真实 DEM 转灰度）。
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { PNG } from 'pngjs'
import { getGridDims } from 'noven-fmg/world'

const builtinDir = (): string =>
  join(dirname(createRequire(import.meta.url).resolve('noven-fmg/package.json')), 'assets', 'heightmaps')

/** path 解析：内置名（不带分隔符）→ 内置库；绝对路径 → 原样；其余相对路径按 cwd。 */
const resolvePngPath = (path: string): string => {
  if (isAbsolute(path)) return path
  const base = path.replace(/\.png$/i, '')
  if (!base.includes('/') && !base.includes('\\')) return join(builtinDir(), `${base}.png`)
  return path
}

/** PNG 解码 + 双线性重采样到格网（cellsX*cellsY 个 0-255 灰度值）。 */
const pngToGray = async (path: string, cellsX: number, cellsY: number): Promise<number[]> => {
  const png = PNG.sync.read(await readFile(resolvePngPath(path)))
  const { width: pw, height: ph, data } = png
  const luma = (x: number, y: number): number => {
    const i = (Math.min(ph - 1, Math.max(0, y)) * pw + Math.min(pw - 1, Math.max(0, x))) * 4
    return Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
  }
  const gray = new Array<number>(cellsX * cellsY)
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const fx = ((cx + 0.5) / cellsX) * pw - 0.5
      const fy = ((cy + 0.5) / cellsY) * ph - 0.5
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const tx = fx - x0, ty = fy - y0
      gray[cy * cellsX + cx] = Math.round(
        luma(x0, y0) * (1 - tx) * (1 - ty) + luma(x0 + 1, y0) * tx * (1 - ty) +
        luma(x0, y0 + 1) * (1 - tx) * ty + luma(x0 + 1, y0 + 1) * tx * ty
      )
    }
  }
  return gray
}

/**
 * set_widget_data 写入前把 {"kind":"png"} 高度图换成 {"kind":"gray"} 逐格数组；
 * 非 png 输入原样透传。
 */
export const resolvePngHeightmap = async (raw: string): Promise<string> => {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return raw }
  if (parsed === null || typeof parsed !== 'object') return raw
  const doc = parsed as Record<string, unknown>
  const world = doc.world as Record<string, unknown> | undefined
  if (world === undefined) return raw
  const hm = world.heightmap as Record<string, unknown> | undefined
  if (hm?.kind !== 'png') return raw
  const path = String(hm.path ?? '')
  if (path === '') throw new Error('heightmap.kind=png 需要 path（内置库名如 east-asia，或 PNG 绝对路径）')
  const config = world.config as Record<string, unknown> | undefined
  const width = Number(config?.width) || 1280
  const height = Number(config?.height) || 800
  const points = Number(config?.points) || 10000
  const { cellsX, cellsY } = getGridDims(width, height, points)
  world.heightmap = { kind: 'gray', gray: await pngToGray(path, cellsX, cellsY) }
  return JSON.stringify(parsed)
}
