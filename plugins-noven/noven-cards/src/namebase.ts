// namebase 路径解析：AI 可写 {"namebase":"预设id"|序号|内联{mode,names,suffix}|JSON 路径}，
// 路径在写入前读文件替换成内联语料——存盘格式自包含，管线无需 fs。
import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { BUILTIN_NAMEBASES } from 'noven-fmg/world'

/** world.config.namebase 的字符串路径 → 内联语料；预设 id / 序号 / 内联原样透传。 */
export const resolveNamebase = async (raw: string): Promise<string> => {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return raw }
  if (parsed === null || typeof parsed !== 'object') return raw
  const doc = parsed as Record<string, unknown>
  const world = doc.world as Record<string, unknown> | undefined
  const config = world?.config as Record<string, unknown> | undefined
  const nb = config?.namebase
  if (typeof nb !== 'string' || nb in BUILTIN_NAMEBASES) return raw
  if (!nb.endsWith('.json') && !nb.includes('/') && !nb.includes('\\')) {
    throw new Error(`未知 namebase '${nb}'（预设：${Object.keys(BUILTIN_NAMEBASES).join('/')}；或 .json 语料文件路径）`)
  }
  const file = isAbsolute(nb) ? nb : nb
  const def = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  if (!Array.isArray(def.names) || def.names.length === 0) {
    throw new Error(`namebase 语料文件 ${nb} 缺少 names 数组`)
  }
  config!.namebase = def
  return JSON.stringify(parsed)
}
