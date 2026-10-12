/**
 * /api/noven-tree — 内容树聚合路由（契约 C6）。左列内容树只读这一份：
 * 卡（含模块树与类型、挂起提案标记、封面、世界内角色）、文稿、作品、
 * 素材文件计数 + 一个修订号 token 供轮询（`?since=` 未变回 304）。
 * @module noven-cards/tree
 */
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { cardsDir, ledgerDir } from 'noven-ledger'
import type { Context } from '@deepseek-ai/cordis'
import type { ContentModule } from './model.ts'
import { CardStore } from './store.ts'
import { proposalChanges } from './proposals.ts'
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

/**
 * 呈现轴元数据：每个目录可带一份 `.noven.json`，`view` 把子节点名映射成
 * 呈现方式（'hidden' = 隐藏；其余/缺省 = 按文件展示）。元数据是项目数据、
 * 跟着目录走；点文件名天然不会作为文件行进树。
 */
async function viewMap(dir: string): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await readFile(join(dir, '.noven.json'), 'utf8')) as { view?: unknown }
    const view = raw?.view
    return view === null || typeof view !== 'object' || Array.isArray(view) ? {} : view as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * 判定项目相对路径是否隐藏：节点自己或任一祖先层被父目录的 view 表标成
 * 'hidden' 都算（隐藏架层会连内容一起隐）。`cache` 按目录记忆 view 表，
 * 一次树请求内不重复读盘。
 */
async function hiddenFor(root: string, rel: string, cache: Map<string, Record<string, string>>): Promise<boolean> {
  const viewOf = async (dir: string): Promise<Record<string, string>> => {
    const hit = cache.get(dir)
    if (hit !== undefined) return hit
    const view = await viewMap(dir)
    cache.set(dir, view)
    return view
  }
  const segments = rel.split('/')
  let dir = root
  for (const segment of segments) {
    if ((await viewOf(dir))[segment] === 'hidden') return true
    dir = join(dir, segment)
  }
  return false
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

interface SectionRow { readonly path: string; readonly title: string; readonly mtime: number; readonly dir?: boolean; readonly hidden?: boolean }
interface TreeSection { readonly name: string; readonly rows: readonly SectionRow[]; readonly hidden?: boolean }

/**
 * 递归收一个目录里的文件行（跳过点文件）：file → 普通行；非卡目录 →
 * 下钻；卡目录（含 card.json/draft.json）由 CardStore 认领、不产行；
 * view 表标 'hidden' 的节点产一行 hidden/dir 占位（给「显示隐藏」留
 * 恢复口），隐藏目录的内容不再下钻。`probeCards` 只在 卡/ 段内为真——
 * 卡/ 外面的 card.json 目录就是普通文件夹。
 */
async function scanShelfFiles(dir: string, prefix: string, rows: SectionRow[], probeCards: boolean): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    /* 目录中途被删或权限不够：这份子树扫不到就当空 */
    return
  }
  const view = await viewMap(dir)
  for (const entry of entries) {
    if (rows.length >= SECTION_FILE_CAP) return
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    const rel = `${prefix}/${entry.name}`
    if (view[entry.name] === 'hidden') {
      // 隐藏卡目录由卡行自身传达隐藏态——不再产 dir 占位行（避免一实两行）。
      if (probeCards && entry.isDirectory() && await isCardDir(full)) continue
      rows.push({ path: rel, title: entry.name, mtime: (await stat(full)).mtimeMs, dir: entry.isDirectory() || undefined, hidden: true })
      continue
    }
    if (entry.isDirectory()) {
      if (probeCards && await isCardDir(full)) continue
      await scanShelfFiles(full, rel, rows, probeCards)
      continue
    }
    rows.push({ path: rel, title: entry.name, mtime: (await stat(full)).mtimeMs })
  }
}

/** 卡目录判定：card.json 或 draft.json 任一在场即认（与 CardStore 扫描同规则）。 */
async function isCardDir(dir: string): Promise<boolean> {
  for (const marker of ['card.json', 'draft.json']) {
    try { if ((await stat(join(dir, marker))).isFile()) return true } catch { /* 不在场 */ }
  }
  return false
}

/**
 * 顶层目录即分组：卡/、文稿/ 各有专属行格式（cards/docs 字段覆盖），
 * 其余目录逐目录出一个用户分组。卡/ 的 rows 收架层散件（卡目录内部
 * 不算散件）；文稿/ rows 留空。分组自身也可被根目录 view 表隐藏。
 */
async function scanSections(root: string): Promise<TreeSection[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const rootView = await viewMap(root)
  const sections: TreeSection[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || RESERVED_DIRS.has(entry.name)) continue
    const hidden = rootView[entry.name] === 'hidden' || undefined
    if (entry.name === '卡') {
      const rows: SectionRow[] = []
      await scanShelfFiles(join(root, entry.name), entry.name, rows, true)
      sections.push({ name: entry.name, rows, ...(hidden !== undefined ? { hidden } : {}) })
      continue
    }
    if (entry.name === '文稿') {
      sections.push({ name: entry.name, rows: [], ...(hidden !== undefined ? { hidden } : {}) })
      continue
    }
    const rows: SectionRow[] = []
    await scanShelfFiles(join(root, entry.name), entry.name, rows, false)
    sections.push({ name: entry.name, rows, ...(hidden !== undefined ? { hidden } : {}) })
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
    // 呈现轴：把一个节点标成隐藏 / 恢复按文件展示。元数据写进父目录的
    // `.noven.json`（view 表）；'file' 是缺省态，等于删掉该键。
    if (body.op === 'present') {
      const rel = String(body.path ?? '')
      const segments = rel.split('/')
      const view = String(body.view ?? '')
      if (rel === '' || !segments.every(seg => GROUP_NAME.test(seg)) || !['hidden', 'file'].includes(view)) {
        return new Response('invalid path or view', { status: 400, headers: JSON_HEADERS })
      }
      const absolute = join(root, ...segments)
      const parent = join(root, ...segments.slice(0, -1))
      if (segments[0] === '卡') {
        // 卡目录内部归 CardStore 管——呈现元数据不往卡里写。
        let inside = join(root, '卡')
        for (const seg of segments.slice(1, -1)) {
          inside = join(inside, seg)
          if (await isCardDir(inside)) return new Response('path is inside a card', { status: 400, headers: JSON_HEADERS })
        }
      }
      try {
        await stat(absolute) // 节点必须在场——呈现是已有实体的属性，不凭空登记
      } catch {
        return new Response('node not found', { status: 404, headers: JSON_HEADERS })
      }
      const metaPath = join(parent, '.noven.json')
      let meta: { view?: Record<string, string> } = {}
      try {
        const raw = JSON.parse(await readFile(metaPath, 'utf8')) as { view?: Record<string, string> }
        if (raw !== null && typeof raw === 'object') meta = raw
      } catch { /* 没有或损坏——从空表起 */ }
      const nextView = { ...(meta.view ?? {}) }
      const base = segments[segments.length - 1]
      if (view === 'hidden') nextView[base] = 'hidden'
      else delete nextView[base]
      const temp = `${metaPath}.noven-tmp`
      await writeFile(temp, `${JSON.stringify({ ...meta, view: nextView }, null, 2)}\n`)
      await rename(temp, metaPath)
      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
    }
    // 文件级操作与分组操作共用本路由：都落在项目相对路径的树上。
    if (body.op === 'rm' || body.op === 'rename') {
      const rel = String(body.path ?? '')
      const segments = rel.split('/')
      if (rel === '' || !segments.every(seg => GROUP_NAME.test(seg))) {
        return new Response('invalid path', { status: 400, headers: JSON_HEADERS })
      }
      // 卡目录内部结构归 CardStore 管——散文件操作不许伸进去；卡/ 下
      // 架层的散件（卡目录之外）可以正常改名/删除。
      if (segments[0] === '卡') {
        let inside = join(root, '卡')
        let inCard = false
        for (const seg of segments.slice(1, -1)) {
          inside = join(inside, seg)
          if (await isCardDir(inside)) inCard = true
        }
        if (inCard) return new Response('path is inside a card', { status: 400, headers: JSON_HEADERS })
      }
      const absolute = join(root, ...segments)
      try {
        if (body.op === 'rm') await unlink(absolute)
        else {
          const name = String(body.name ?? '').trim()
          if (!GROUP_NAME.test(name)) return new Response('invalid name', { status: 400, headers: JSON_HEADERS })
          await rename(absolute, join(dirname(absolute), name))
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return new Response('file not found', { status: 404, headers: JSON_HEADERS })
        if (code === 'EEXIST' || code === 'EPERM') return new Response('target exists or is a directory', { status: 409, headers: JSON_HEADERS })
        throw error
      }
      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
    }
    if (body.op !== 'mkdir' && body.op !== 'rmdir') return new Response('unknown op', { status: 400, headers: JSON_HEADERS })
    const name = String(body.name ?? '').trim()
    if (!GROUP_NAME.test(name) || RESERVED_DIRS.has(name) || name === '卡' || name === '文稿') {
      return new Response('invalid group name', { status: 400, headers: JSON_HEADERS })
    }
    try {
      if (body.op === 'mkdir') await mkdir(join(root, name))
      else await rm(join(root, name), { recursive: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return new Response('group already exists', { status: 409, headers: JSON_HEADERS })
      if (code === 'ENOENT') return new Response('group not found', { status: 404, headers: JSON_HEADERS })
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

  const viewCache = new Map<string, Record<string, string>>()
  const cards = (await Promise.all((await store.list()).map(async cardId => {
    const head = await store.open(cardId).catch(() => undefined)
    if (head === undefined) return undefined
    const doc = head.document
    const coverId = doc.appearance.coverResourceId
    const dir = await store.dirName(cardId) ?? doc.name
    const slash = dir.lastIndexOf('/')
    const proposal = await store.proposal(cardId)
    // 页级归属：灯要亮在提案碰过的页上，明细 scope 与卡页 banner 的
    // pageHasProposal 同一条规则；pending 布尔保留作卡行聚合态。
    const pendingScopes = proposal === undefined ? []
      : proposalChanges(doc, proposal).map(c => ({ targetId: c.targetId, moduleId: c.moduleId }))
    return {
      cardId,
      name: doc.name,
      kind: doc.kind,
      revision: head.revision,
      pending: proposal !== undefined,
      pendingScopes,
      cover: coverId === undefined ? null : doc.resources.find(r => r.id === coverId)?.content ?? null,
      dir,
      shelf: slash < 0 ? '' : dir.slice(0, slash),
      ...(await hiddenFor(root, `卡/${dir}`, viewCache) ? { hidden: true } : {}),
      modules: moduleRows(doc.modules),
      characters: doc.internalCharacters.map(character => ({ id: character.id, name: character.name })),
    }
  }))).filter((row): row is NonNullable<typeof row> => row !== undefined)

  const docs = await scanDocs(root, registered)
  const docRows = await Promise.all([
    ...manifest.works.filter(w => w.kind === 'text' && w.archived !== true)
      .map(async w => ({ id: w.id, path: w.primary?.path ?? '', title: w.title ?? basename(w.primary?.path ?? ''), mtime: Date.parse(w.updatedAt ?? '') || 0, ...(await hiddenFor(root, w.primary?.path ?? '', viewCache) ? { hidden: true } : {}) })),
    ...docs.map(async d => ({ id: null, path: d.path, title: basename(d.path).replace(/\.(md|markdown|txt)$/i, ''), mtime: d.mtime, ...(await hiddenFor(root, d.path, viewCache) ? { hidden: true } : {}) })),
  ])
  const workRows = await Promise.all(manifest.works.filter(w => w.kind !== 'text' && w.archived !== true)
    .map(async w => ({ id: w.id, path: w.primary?.path ?? '', title: w.title ?? basename(w.primary?.path ?? ''), kind: w.kind ?? 'other', mtime: Date.parse(w.updatedAt ?? '') || 0, ...(await hiddenFor(root, w.primary?.path ?? '', viewCache) ? { hidden: true } : {}) })))
  const sections = await scanSections(root)
  const files = await countLooseFiles(root, registered)

  const token = createHash('sha256').update(JSON.stringify({
    c: cards.map(c => [c.cardId, c.name, c.revision, c.pending, c.dir, c.hidden === true, c.pendingScopes]),
    l: manifest.revision,
    d: docRows.map(d => [d.path, d.mtime, d.hidden === true]),
    w: workRows.map(w => [w.id, w.mtime, w.hidden === true]),
    s: sections.map(s => [s.name, s.hidden === true, s.rows.map(r => [r.path, r.mtime, r.hidden === true])]),
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
