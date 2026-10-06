/**
 * 每卡「信任 AI」开关（契约 C5）：存应用侧账本 `library.json` 的
 * `cardMeta[cardId].aiTrust`，`propose`（默认）= AI 写入进提案等人确认；
 * `auto` = AI 写入直接提交。不进卡本体——分享出去的卡不带「自动生效」。
 * @module noven-cards/trust
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ledgerDir } from 'noven-ledger'

export type AiTrust = 'propose' | 'auto'

interface LibraryFile { cardMeta?: Record<string, Record<string, unknown>>, [key: string]: unknown }

async function libraryPath(root: string): Promise<string> {
  return join(await ledgerDir(root), 'library.json')
}

async function readLibrary(root: string): Promise<LibraryFile> {
  try {
    return JSON.parse(await readFile(await libraryPath(root), 'utf8')) as LibraryFile
  } catch {
    return {}
  }
}

/** 读卡的信任档；无记录 = 'propose'（默认提案）。 */
export async function aiTrustOf(root: string, cardId: string): Promise<AiTrust> {
  const meta = (await readLibrary(root)).cardMeta?.[cardId]
  return meta?.aiTrust === 'auto' ? 'auto' : 'propose'
}

/** 写卡的信任档；library.json 不存在时建一份。 */
export async function setAiTrust(root: string, cardId: string, mode: AiTrust): Promise<void> {
  const path = await libraryPath(root)
  const library = await readLibrary(root)
  const meta = { ...(library.cardMeta ?? {}) }
  meta[cardId] = { ...meta[cardId], aiTrust: mode }
  const next: LibraryFile = { ...library, cardMeta: meta, revision: (typeof library.revision === 'number' ? library.revision : 0) + 1 }
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.noven-tmp`
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`)
  await rename(tmp, path)
}
