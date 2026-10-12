/**
 * /api/noven-import — 导入契约（local/design/页面与实体模型.md §5）：
 * **包不是实体，文件夹才是**。analyze 只拆报不消化——报告「认出 N 张卡
 * + M 个文件」；commit 按用户选的落点如实落位：认出卡形的落成卡目录
 * （在 卡/ 下就是活卡），认不出的就是裸文件原样进文档架。
 *
 * 识别优先级：诺文交换包（structure.json）→ 盘上卡目录（card.json）→
 * 外来单卡（酒馆 PNG / chara JSON）→ 其余一律裸文件。识别失败的包不会
 * 消失——zip 展成文件树落位就是。
 * @module noven-cards/import
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { sanitizeDirName, uniqueDirName } from 'noven-ledger'
import type { Context } from '@deepseek-ai/cordis'
import { importExchange, importForeignFile, extractPngCardText } from './exchange.ts'
import { CardStore } from './store.ts'
import { rootFor } from './routes.ts'
import { readZip, writeZip } from './zip.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** 与 /api/noven-cards 同口径的请求体上限——一个导入包是大头。 */
const MAX_BODY_BYTES = 64 * 1024 * 1024

const EXPERIMENT = 'novex-content-exchange'

/** 落点/包内路径的分段校验：非点开头（挡 .. 与账本/隐藏文件）、无分隔符、限长。 */
const SEGMENT = /^(?!\.)(?!.*\.\.)[^/\\:*?"<>|]{1,96}$/u

/** 分析报告里的一件卡：from 是它在包里的位置（dir 前缀或文件名）。 */
interface ReportCard { readonly name: string, readonly cardKind: string, readonly from: string }
interface ReportFile { readonly path: string, readonly size: number }

/** `analyze` 的响应载荷；kind='file' 时 cards 空、files 只含原文件自身。 */
interface ImportReport {
  readonly kind: 'single' | 'pack' | 'file'
  readonly cards: readonly ReportCard[]
  readonly files: readonly ReportFile[]
  /** 落点建议名（包名净化）；客户端默认拼成 `卡/<suggestion>`。 */
  readonly suggestion: string
}

/** zip 条目分类结果：前缀声明归属，claim 过的条目不再算散件。 */
interface Classified {
  readonly exchange: readonly { prefix: string, name: string, cardKind: string }[]
  readonly cardDirs: readonly { prefix: string, name: string, cardKind: string }[]
  readonly foreign: readonly { path: string, name: string }[]
  readonly files: readonly string[]
}

const isZip = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
const isPng = (bytes: Uint8Array): boolean => bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47

/** 条目路径是否安全落盘：每段都过 SEGMENT（拒绝 ..、点开头、分隔符）。 */
function safeEntryPath(name: string): boolean {
  return name !== '' && !name.endsWith('/') && name.split('/').every(seg => SEGMENT.test(seg))
}

/** chara JSON 探测：ccv2 spec 或酒馆常见的 name+description 组合。 */
function looksLikeCharaJson(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false
  const obj = raw as Record<string, unknown>
  if (obj.spec === 'chara_card_v2') return true
  return typeof obj.name === 'string' && (typeof obj.description === 'string' || typeof obj.first_mes === 'string' || typeof obj.personality === 'string')
}

/** 目录前缀：'a/b/c.json' → 'a/b'；根的 'c.json' → ''。 */
const prefixOf = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

/**
 * 拆 zip 条目：交换包前缀（structure.json）→ 卡目录前缀（card.json）→
 * 外来单卡文件（PNG/chara JSON）→ 其余散件。被前缀认领的条目不再出现
 * 在散件清单里。
 */
function classifyZip(entries: Map<string, Uint8Array>): Classified {
  const exchange: { prefix: string, name: string, cardKind: string }[] = []
  const cardDirs: { prefix: string, name: string, cardKind: string }[] = []
  const foreign: { path: string, name: string }[] = []
  const claimed = new Set<string>()
  const under = (path: string, prefix: string): boolean => prefix === '' || path.startsWith(`${prefix}/`)

  for (const name of entries.keys()) {
    const leaf = name.split('/').pop() ?? ''
    if (leaf !== 'structure.json') continue
    try {
      const structure = JSON.parse(new TextDecoder().decode(entries.get(name))) as { experiment?: string, card?: { name?: string, kind?: string } }
      if (structure.experiment !== EXPERIMENT) continue
      const prefix = prefixOf(name)
      for (const key of entries.keys()) if (under(key, prefix)) claimed.add(key)
      exchange.push({ prefix, name: structure.card?.name ?? '导入卡', cardKind: structure.card?.kind ?? 'WORLD' })
    } catch { /* 不是合法交换包——留给散件通道 */ }
  }
  for (const name of entries.keys()) {
    if (claimed.has(name)) continue
    const leaf = name.split('/').pop() ?? ''
    if (leaf !== 'card.json') continue
    const prefix = prefixOf(name)
    let cardName = '未命名卡'
    let cardKind = 'WORLD'
    try {
      const head = JSON.parse(new TextDecoder().decode(entries.get(name))) as { document?: { name?: string, kind?: string } }
      cardName = head.document?.name ?? cardName
      cardKind = head.document?.kind ?? cardKind
    } catch { /* card.json 损坏——目录仍按卡目录处理（内容会如实落盘） */ }
    for (const key of entries.keys()) if (under(key, prefix)) claimed.add(key)
    cardDirs.push({ prefix, name: cardName, cardKind })
  }
  const files: string[] = []
  for (const [name, data] of entries) {
    if (claimed.has(name)) continue
    if (name.endsWith('/')) continue
    if (isPng(data) && extractPngCardText(data) !== undefined) {
      foreign.push({ path: name, name: name.split('/').pop()?.replace(/\.[^.]+$/u, '') ?? '导入卡' })
      continue
    }
    if (name.endsWith('.json')) {
      try {
        if (looksLikeCharaJson(JSON.parse(new TextDecoder().decode(data)))) {
          foreign.push({ path: name, name: name.split('/').pop()?.replace(/\.[^.]+$/u, '') ?? '导入卡' })
          continue
        }
      } catch { /* 非 JSON 或不似卡——按散件 */ }
    }
    files.push(name)
  }
  return { exchange, cardDirs, foreign, files }
}

/** 报告里的包名：文件名去扩展名 + 净化成可用目录名。 */
function suggestionOf(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/u, '').trim() || '导入'
  return sanitizeDirName(stem) || '导入'
}

/** 分析一份字节：识别到什么报什么，不落盘不改库。 */
function analyzeBytes(bytes: Uint8Array, fileName: string): ImportReport {
  const suggestion = suggestionOf(fileName)
  if (isZip(bytes)) {
    let entries: Map<string, Uint8Array>
    try {
      entries = readZip(bytes)
    } catch {
      // 解不开的 zip 就是一块未知文件——如实按 file 报
      return { kind: 'file', cards: [], files: [{ path: fileName, size: bytes.length }], suggestion }
    }
    const classified = classifyZip(entries)
    const cards: ReportCard[] = [
      ...classified.exchange.map(item => ({ name: item.name, cardKind: item.cardKind, from: item.prefix })),
      ...classified.cardDirs.map(item => ({ name: item.name, cardKind: item.cardKind, from: item.prefix })),
      ...classified.foreign.map(item => ({ name: item.name, cardKind: 'CHARACTER', from: item.path })),
    ]
    const files = classified.files.map(path => ({ path, size: entries.get(path)?.length ?? 0 }))
    const kind = cards.length === 1 && files.length === 0 ? 'single' : 'pack'
    return { kind, cards, files, suggestion }
  }
  if (isPng(bytes)) {
    const text = extractPngCardText(bytes)
    if (text !== undefined) {
      let cardName = suggestion
      try {
        const parsed = JSON.parse(text) as { name?: string, data?: { name?: string } }
        cardName = parsed.data?.name ?? parsed.name ?? cardName
      } catch { /* 原文不是 JSON——用文件名 */ }
      return { kind: 'single', cards: [{ name: cardName, cardKind: 'CHARACTER', from: fileName }], files: [], suggestion }
    }
    return { kind: 'file', cards: [], files: [{ path: fileName, size: bytes.length }], suggestion }
  }
  try {
    if (fileName.endsWith('.json') && looksLikeCharaJson(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))) {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { name?: string, data?: { name?: string } }
      return { kind: 'single', cards: [{ name: parsed.data?.name ?? parsed.name ?? suggestion, cardKind: 'CHARACTER', from: fileName }], files: [], suggestion }
    }
  } catch { /* 非 UTF-8/非 JSON——按文件 */ }
  return { kind: 'file', cards: [], files: [{ path: fileName, size: bytes.length }], suggestion }
}

interface Landed { readonly type: 'card' | 'file', readonly name: string, readonly path: string, readonly live?: boolean, readonly cardId?: string }

/** 把刚入库的卡目录挪到落点下（落点在 卡/ 外就变成裸卡目录——如实报告 live:false）。 */
async function moveCardInto(store: CardStore, root: string, cardId: string, targetAbs: string, targetRel: string): Promise<Landed | undefined> {
  const dir = await store.dirName(cardId)
  if (dir === undefined) return undefined
  const src = join(root, '卡', dir)
  const base = dir.split('/').pop() ?? dir
  const destName = await uniqueDirName(targetAbs, base)
  const dest = join(targetAbs, destName)
  await rename(src, dest)
  const rel = targetRel === '' ? destName : `${targetRel}/${destName}`
  return { type: 'card', name: base, path: rel, live: rel === '卡' || rel.startsWith('卡/'), cardId }
}

/** 校验落点：项目相对路径、每段过 SEGMENT；'' 表示项目根。 */
function targetSegments(target: string): string[] | undefined {
  if (target === '') return []
  const segments = target.split('/')
  return segments.every(seg => SEGMENT.test(seg)) ? segments : undefined
}

async function serve(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  const root = resolved.root
  if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: JSON_HEADERS })
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return new Response('import payload too large', { status: 413, headers: JSON_HEADERS })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
  }
  const fileName = String(body.name ?? '导入')
  const encoded = String(body.file ?? '')
  if (encoded.length === 0) return new Response('missing file', { status: 400, headers: JSON_HEADERS })
  const bytes = new Uint8Array(Buffer.from(encoded, 'base64'))
  const store = new CardStore(root)

  if (body.op === 'analyze') {
    return new Response(JSON.stringify(analyzeBytes(bytes, fileName)), { headers: JSON_HEADERS })
  }
  if (body.op !== 'commit') return new Response('unknown op', { status: 400, headers: JSON_HEADERS })

  const segments = targetSegments(String(body.target ?? ''))
  if (segments === undefined) return new Response('invalid target', { status: 400, headers: JSON_HEADERS })
  const targetRel = segments.join('/')
  const targetAbs = join(root, ...segments)
  const report = analyzeBytes(bytes, fileName)

  try {
    // 认不出的就是裸文件——先走文件通道，别误进 importForeignFile 变卡。
    if (report.kind === 'file') {
      const dest = join(targetAbs, fileName.split('/').pop() ?? fileName)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, bytes)
      const rel = targetRel === '' ? fileName : `${targetRel}/${fileName.split('/').pop() ?? fileName}`
      return new Response(JSON.stringify({ ok: true, landed: [{ type: 'file', name: fileName, path: rel }] }), { headers: JSON_HEADERS })
    }
    // 单卡直通道：与 /api/noven-cards import 同语义（导入→提交→活卡进 卡/）。
    if (!isZip(bytes)) {
      const imported = await importForeignFile(store, bytes, fileName)
      const saved = await store.commit(imported.cardId, imported.version)
      const dir = await store.dirName(imported.cardId) ?? imported.name
      return new Response(JSON.stringify({ ok: true, landed: [{ type: 'card', name: imported.name, path: `卡/${dir}`, live: true, cardId: imported.cardId }], revision: saved.revision }), { headers: JSON_HEADERS })
    }

    // 文档架落位：散件原位写下；认出卡形的转成卡再挪进落点。
    const entries = readZip(bytes)
    const classified = classifyZip(entries)
    await mkdir(targetAbs, { recursive: true })
    const landed: Landed[] = []
    const skipped: string[] = []
    for (const path of classified.files) {
      if (!safeEntryPath(path)) { skipped.push(path); continue }
      const dest = join(targetAbs, ...path.split('/'))
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, entries.get(path) ?? new Uint8Array())
      landed.push({ type: 'file', name: path.split('/').pop() ?? path, path: targetRel === '' ? path : `${targetRel}/${path}` })
    }
    for (const dir of classified.cardDirs) {
      // 根级卡目录（card.json 在 zip 根）以卡名补一层目录，否则写不进 卡/<名>/ 形态。
      const base = dir.prefix === '' ? (sanitizeDirName(dir.name) || '导入卡') : dir.prefix
      if (!base.split('/').every(seg => SEGMENT.test(seg))) { skipped.push(dir.prefix || dir.name); continue }
      for (const [name, data] of entries) {
        if (dir.prefix !== '' && !name.startsWith(`${dir.prefix}/`)) continue
        const rel = dir.prefix === '' ? name : name.slice(dir.prefix.length + 1)
        if (rel === '' || !safeEntryPath(rel)) continue
        const dest = join(targetAbs, base, ...rel.split('/'))
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, data)
      }
      const rel = targetRel === '' ? base : `${targetRel}/${base}`
      landed.push({ type: 'card', name: dir.name, path: rel, live: rel === '卡' || rel.startsWith('卡/') })
    }
    for (const pack of classified.exchange) {
      const subset = [...entries.entries()]
        .filter(([name]) => pack.prefix === '' || name.startsWith(`${pack.prefix}/`))
        .map(([name, data]) => ({ name: pack.prefix === '' ? name : name.slice(pack.prefix.length + 1), data }))
      const imported = await importExchange(store, writeZip(subset))
      await store.commit(imported.cardId, imported.version)
      const moved = await moveCardInto(store, root, imported.cardId, targetAbs, targetRel)
      landed.push(moved ?? { type: 'card', name: pack.name, path: `卡/`, live: true })
    }
    for (const item of classified.foreign) {
      const imported = await importForeignFile(store, entries.get(item.path) ?? new Uint8Array(), item.name)
      await store.commit(imported.cardId, imported.version)
      const moved = await moveCardInto(store, root, imported.cardId, targetAbs, targetRel)
      landed.push(moved ?? { type: 'card', name: item.name, path: `卡/`, live: true })
    }
    return new Response(JSON.stringify({ ok: true, landed, ...(skipped.length > 0 ? { skipped } : {}) }), { headers: JSON_HEADERS })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'import failed', { status: 500, headers: JSON_HEADERS })
  }
}

/** Register the import route against the connection's fetch registry. */
export function registerImportRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-import',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => serve(request, ctx),
  }), 'noven-cards: /api/noven-import')
}
