/**
 * /api/noven-tree — 内容树聚合路由（契约 C6）。左列内容树只读这一份：
 * 卡（含模块树与类型、挂起提案标记、封面、世界内角色）、文稿、作品、
 * 素材文件计数 + 一个修订号 token 供轮询（`?since=` 未变回 304）。
 * @module noven-cards/tree
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { cardsDir, ledgerDir } from 'noven-ledger'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentModule } from './model.ts'
import { CardStore } from './store.ts'
import { rootFor } from './routes.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** 模块树的行：type 是 widget 渲染器名，普通文档模块为 'document'。 */
function moduleRows(modules: readonly ContentModule[]): Record<string, unknown>[] {
  return modules.map(module => ({
    id: module.id,
    name: module.name,
    type: module.widget?.type ?? 'document',
    children: moduleRows(module.children),
    ...(module.routing !== undefined ? { routing: module.routing } : {}),
  }))
}

interface ManifestWork { readonly id: string, readonly title?: string, readonly kind?: string, readonly archived?: boolean, readonly primary?: { readonly path?: string }, readonly updatedAt?: string }

/** 松散读 library.json：只取树要用的字段，账本本体归 noven-library 管。 */
async function readManifest(root: string): Promise<{ revision: number, works: ManifestWork[] }> {
  try {
    const raw = JSON.parse(await readFile(join(await ledgerDir(root), 'library.json'), 'utf8')) as { revision?: number, works?: ManifestWork[] }
    return { revision: typeof raw.revision === 'number' ? raw.revision : 0, works: Array.isArray(raw.works) ? raw.works.filter(w => typeof w?.id === 'string' && typeof w?.primary?.path === 'string') : [] }
  } catch {
    return { revision: 0, works: [] }
  }
}

/** 文稿/ 目录兜底：已登记的作品不算，其余 .md/.txt/.markdown 逐个给 mtime。 */
async function scanDocs(root: string, registered: ReadonlySet<string>): Promise<{ path: string, mtime: number }[]> {
  const dir = join(root, '文稿')
  let entries: string[] = []
  try {
    entries = (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).map(e => join(e.parentPath ?? dir, e.name))
  } catch { /* 没有文稿目录 */ }
  const docs: { path: string, mtime: number }[] = []
  for (const file of entries) {
    if (!/\.(md|markdown|txt)$/i.test(file)) continue
    const rel = file.slice(root.length + 1)
    if (registered.has(rel)) continue
    docs.push({ path: rel, mtime: (await stat(file)).mtimeMs })
  }
  return docs
}

const EXCLUDED_DIRS = new Set(['.noven', '.git', 'node_modules', '卡', '文稿'])

/** 顶层目录扫描要跳过的名字：账本、版本库与依赖。 */
const RESERVED_DIRS = new Set(['.noven', '.git', 'node_modules'])

/** 一个用户分组的文件行上限，防巨型目录拖慢轮询。 */
const SECTION_FILE_CAP = 500

interface SectionRow { readonly path: string; readonly title: string; readonly mtime: number }
interface TreeSection { readonly name: string; readonly rows: readonly SectionRow[] }

/** 递归收一个分组目录里的文件（跳过点文件）；rel 带上分组名前缀。 */
async function scanSectionFiles(dir: string, prefix: string, rows: SectionRow[]): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    /* 目录中途被删或权限不够：这份子树扫不到就当空 */
    return
  }
  for (const entry of entries) {
    if (rows.length >= SECTION_FILE_CAP) return
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await scanSectionFiles(full, `${prefix}/${entry.name}`, rows)
      continue
    }
    rows.push({ path: `${prefix}/${entry.name}`, title: entry.name, mtime: (await stat(full)).mtimeMs })
  }
}

/**
 * 顶层目录即分组：卡/、文稿/ 各有专属行格式（cards/docs 字段覆盖），
 * 其余目录逐目录出一个用户分组。卡/、文稿/ 也进 sections（rows 留空），
 * 前端靠存在性把空分组头渲染出来——用户新建的组必须立刻可见。
 */
async function scanSections(root: string): Promise<TreeSection[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const sections: TreeSection[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || RESERVED_DIRS.has(entry.name)) continue
    if (entry.name === '卡' || entry.name === '文稿') {
      sections.push({ name: entry.name, rows: [] })
      continue
    }
    const rows: SectionRow[] = []
    await scanSectionFiles(join(root, entry.name), entry.name, rows)
    sections.push({ name: entry.name, rows })
  }
  return sections.sort((a, b) => a.name.localeCompare(b.name))
}

/** 素材与文件的计数：项目里刨掉卡目录、文稿、账本与依赖后剩下的文件数（上限封顶防巨型目录）。 */
async function countLooseFiles(root: string, registered: ReadonlySet<string>): Promise<number> {
  let count = 0
  let entries
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (count > 20000) break
    const rel = (entry.parentPath ?? root).slice(root.length + 1)
    if (rel.length > 0 && EXCLUDED_DIRS.has(rel.split('/')[0])) continue
    if (!entry.isFile()) continue
    const full = rel.length > 0 ? `${rel}/${entry.name}` : entry.name
    if (registered.has(full)) continue
    count += 1
  }
  return count
}

/** 分组名校验：非点开头（挡住 .. 与账本目录）、无路径分隔符、限长。 */
const GROUP_NAME = /^(?!\.)(?!.*\.\.)[^/\\:*?"<>|]{1,64}$/u

async function serve(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  const root = resolved.root
  if (request.method === 'POST') {
    let body: Record<string, unknown>
    try {
      body = JSON.parse(await request.text()) as Record<string, unknown>
    } catch {
      return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
    }
    if (body.op !== 'mkdir') return new Response('unknown op', { status: 400, headers: JSON_HEADERS })
    const name = String(body.name ?? '').trim()
    if (!GROUP_NAME.test(name) || RESERVED_DIRS.has(name)) {
      return new Response('invalid group name', { status: 400, headers: JSON_HEADERS })
    }
    try {
      await mkdir(join(root, name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return new Response('group already exists', { status: 409, headers: JSON_HEADERS })
      }
      throw error
    }
    return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
  }
  const store = new CardStore(root)
  const manifest = await readManifest(root)
  const registered = new Set<string>()
  for (const work of manifest.works) {
    if (typeof work.primary?.path === 'string') registered.add(work.primary.path)
  }

  const cards = (await Promise.all((await store.list()).map(async cardId => {
    const head = await store.open(cardId).catch(() => undefined)
    if (head === undefined) return undefined
    const doc = head.document
    const coverId = doc.appearance.coverResourceId
    return {
      cardId,
      name: doc.name,
      kind: doc.kind,
      revision: head.revision,
      pending: (await store.proposal(cardId)) !== undefined,
      cover: coverId === undefined ? null : doc.resources.find(r => r.id === coverId)?.content ?? null,
      modules: moduleRows(doc.modules),
      characters: doc.internalCharacters.map(character => ({ id: character.id, name: character.name })),
    }
  }))).filter((row): row is NonNullable<typeof row> => row !== undefined)

  const docs = await scanDocs(root, registered)
  const docRows = [
    ...manifest.works.filter(w => w.kind === 'text' && w.archived !== true)
      .map(w => ({ id: w.id, path: w.primary?.path ?? '', title: w.title ?? basename(w.primary?.path ?? ''), mtime: Date.parse(w.updatedAt ?? '') || 0 })),
    ...docs.map(d => ({ id: null, path: d.path, title: basename(d.path).replace(/\.(md|markdown|txt)$/i, ''), mtime: d.mtime })),
  ]
  const workRows = manifest.works.filter(w => w.kind !== 'text' && w.archived !== true)
    .map(w => ({ id: w.id, path: w.primary?.path ?? '', title: w.title ?? basename(w.primary?.path ?? ''), kind: w.kind ?? 'other', mtime: Date.parse(w.updatedAt ?? '') || 0 }))
  const sections = await scanSections(root)
  const files = await countLooseFiles(root, registered)

  const token = createHash('sha256').update(JSON.stringify({
    c: cards.map(c => [c.cardId, c.name, c.revision, c.pending]),
    l: manifest.revision,
    d: docRows.map(d => [d.path, d.mtime]),
    w: workRows.map(w => [w.id, w.mtime]),
    s: sections.map(s => [s.name, s.rows.map(r => [r.path, r.mtime])]),
    f: files,
  })).digest('hex').slice(0, 16)

  const url = new URL(request.url)
  if (url.searchParams.get('since') === token) {
    return new Response(null, { status: 304, headers: JSON_HEADERS })
  }
  const body = { revision: token, cards, docs: docRows, works: workRows, sections, files: { count: files } }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { headers: JSON_HEADERS })
}

/** Register the content-tree aggregation route. */
export function registerTreeRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-tree',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serve(request, ctx),
  }), 'noven-cards: /api/noven-tree')
}
