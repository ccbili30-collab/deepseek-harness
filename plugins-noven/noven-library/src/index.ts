/**
 * noven-library — the creative library manifest. The host side owns the
 * app-ledger `library.json` (the registration catalog) and the project
 * registry/marker pair (project identity), serves `/api/noven-library` for
 * the client pages, and
 * exposes the registration tools the model uses to organize project files.
 * @module noven-library
 */
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type { Work, WorkKind, WorkStage } from './model.ts'
import { WORK_KINDS, WORK_STAGES, normalizeRel, validRelPath } from './model.ts'
import { inferKind } from './kind.ts'
import { scanInbox } from './inbox.ts'
import {
  LibraryConflictError,
  LibraryNotFoundError,
  loadLibrary,
  loadProject,
  mintWorkId,
  mutateLibrary,
  saveProject,
  workById,
} from './store.ts'
import {
  cardsDir,
  dirExists,
  hasNovenMarkers,
  legacyCardsDir,
  loadExcluded,
  loadRegistry,
  normalizeRoot,
  readMarker,
  registerProject,
  registryRow,
  relinkProject,
  renameProject,
  unregisterProject,
  upgradeRegistry,
  writeMarker,
} from 'noven-ledger'

export const name = 'noven-library'
export const inject = ['tools', 'connection', 'sessions']

/** One response per request, JSON everywhere, never cached. */
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** Hard cap on one library write, matching the workbench route's discipline. */
const MAX_BODY_BYTES = 256 * 1024

/** Session cwd for one tool execution. */
function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

/**
 * Resolve the workspace root a request names: `session` maps to that session's
 * cwd (live header, persisted header for dormant sessions); `root` addresses a
 * project directly so session-less projects answer too.
 */
async function projectRootFor(request: Request, ctx: Context): Promise<{ root: string } | Response> {
  const url = new URL(request.url)
  const session = url.searchParams.get('session') as SessionId | null
  const live = session === null ? undefined : ctx.sessions.get(session)?.header
  const stored = live === undefined && session !== null
    ? await ctx.get('sessionPersistence')?.stat(session)
    : undefined
  const root = (live ?? stored?.header)?.cwd ?? url.searchParams.get('root') ?? undefined
  if (root === undefined || root.length === 0) {
    return new Response('unknown session', { status: 404, headers: JSON_HEADERS })
  }
  return { root }
}

/** The GET payload: identity, manifest, and the unregistered-file inbox. */
async function payload(root: string): Promise<Record<string, unknown>> {
  const library = await loadLibrary(root)
  return {
    revision: library.revision,
    project: (await loadProject(root)) ?? null,
    works: library.works,
    cardMeta: library.cardMeta,
    inbox: await scanInbox(root, library),
  }
}

function isStage(value: unknown): value is WorkStage {
  return typeof value === 'string' && WORK_STAGES.includes(value as WorkStage)
}

function isKind(value: unknown): value is WorkKind {
  return typeof value === 'string' && WORK_KINDS.includes(value as WorkKind)
}

/** Apply one POST op to the manifest; returns the mutation or an error Response. */
async function applyOp(
  root: string,
  op: string,
  body: Record<string, unknown>,
  source: { type: 'manual' } | { type: 'session'; sessionId: string },
): Promise<{ libraryRevision: number } | Response> {
  const bad = (text: string) => new Response(text, { status: 400, headers: JSON_HEADERS })
  const base = typeof body.baseRevision === 'number' ? body.baseRevision : undefined
  const now = new Date().toISOString()
  try {
    switch (op) {
      case 'register': {
        const path = normalizeRel(String(body.path ?? ''))
        const title = String(body.title ?? '').trim() || path.split('/').pop() || path
        if (!validRelPath(path)) return bad('invalid path')
        const kind = isKind(body.kind) ? body.kind : inferKind(path)
        const stage = isStage(body.stage) ? body.stage : 'draft'
        const library = await mutateLibrary(root, (lib) => {
          const work: Work = {
            id: mintWorkId(title),
            title,
            kind,
            stage,
            archived: false,
            primary: { path },
            revisions: [],
            cardIds: [],
            source,
            createdAt: now,
            updatedAt: now,
          }
          lib.works.push(work)
          lib.ignored = lib.ignored.filter(p => p !== path)
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'add-revision': {
        const workId = String(body.workId ?? '')
        const path = normalizeRel(String(body.path ?? ''))
        const label = String(body.label ?? '').trim() || '新版本'
        if (!validRelPath(path)) return bad('invalid path')
        const library = await mutateLibrary(root, (lib) => {
          const work = workById(lib, workId)
          work.revisions.push({ ref: { path }, label, at: now, source })
          work.updatedAt = now
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'set-primary': {
        const workId = String(body.workId ?? '')
        const index = Number(body.revisionIndex)
        const library = await mutateLibrary(root, (lib) => {
          const work = workById(lib, workId)
          const revision = work.revisions[index]
          if (revision === undefined) throw new Error('unknown revision index')
          const previous = work.primary
          work.primary = revision.ref
          work.revisions.splice(index, 1)
          work.revisions.push({ ref: previous, label: '上一版正文', at: now, source })
          work.updatedAt = now
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'set-stage': {
        const workId = String(body.workId ?? '')
        const stage = body.stage
        if (!isStage(stage)) return bad('invalid stage')
        const library = await mutateLibrary(root, (lib) => {
          const work = workById(lib, workId)
          work.stage = stage
          work.updatedAt = now
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'archive': {
        const workId = String(body.workId ?? '')
        const archived = body.archived !== false
        const library = await mutateLibrary(root, (lib) => {
          const work = workById(lib, workId)
          work.archived = archived
          work.updatedAt = now
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'unregister': {
        const workId = String(body.workId ?? '')
        const library = await mutateLibrary(root, (lib) => {
          lib.works = lib.works.filter(w => w.id !== workId)
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'ignore': {
        const path = normalizeRel(String(body.path ?? ''))
        if (!validRelPath(path)) return bad('invalid path')
        const library = await mutateLibrary(root, (lib) => {
          if (!lib.ignored.includes(path)) lib.ignored.push(path)
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'unignore': {
        const path = normalizeRel(String(body.path ?? ''))
        const library = await mutateLibrary(root, (lib) => {
          lib.ignored = lib.ignored.filter(p => p !== path)
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'set-card-meta': {
        const cardId = String(body.cardId ?? '')
        const stage = body.stage
        const archived = body.archived
        if (cardId.length === 0) return bad('missing cardId')
        const library = await mutateLibrary(root, (lib) => {
          const meta = lib.cardMeta[cardId] ?? { stage: 'draft' as const, archived: false }
          if (isStage(stage)) meta.stage = stage
          if (typeof archived === 'boolean') meta.archived = archived
          lib.cardMeta[cardId] = meta
        }, base)
        return { libraryRevision: library.revision }
      }
      case 'set-project': {
        const title = String(body.title ?? '').trim()
        const description = typeof body.description === 'string' ? body.description : undefined
        const existing = await loadProject(root)
        await saveProject(root, {
          version: 1,
          id: existing?.id ?? `proj-${Date.now().toString(36)}`,
          title: title.length > 0 ? title : existing?.title ?? '未命名项目',
          ...(description !== undefined ? { description } : existing?.description !== undefined ? { description: existing.description } : {}),
          createdAt: existing?.createdAt ?? now,
        })
        return { libraryRevision: (await loadLibrary(root)).revision }
      }
      default:
        return bad(`unknown op: ${op}`)
    }
  } catch (error: unknown) {
    if (error instanceof LibraryConflictError) {
      return new Response(JSON.stringify({ error: 'conflict', revision: error.current }), { status: 409, headers: JSON_HEADERS })
    }
    if (error instanceof LibraryNotFoundError) {
      return new Response(error.message, { status: 404, headers: JSON_HEADERS })
    }
    return new Response(error instanceof Error ? error.message : 'library op failed', { status: 500, headers: JSON_HEADERS })
  }
}

/** Serve the creative library: GET reads the payload, POST applies one op. */
async function serveLibrary(request: Request, ctx: Context): Promise<Response> {
  const resolved = await projectRootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = JSON.stringify(await payload(resolved.root))
    return new Response(request.method === 'HEAD' ? null : body, { headers: JSON_HEADERS })
  }
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return new Response('library payload too large', { status: 413, headers: JSON_HEADERS })
  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
  }
  const op = String(body.op ?? '')
  const session = new URL(request.url).searchParams.get('session') ?? ''
  const result = await applyOp(resolved.root, op, body, session.length > 0 ? { type: 'session', sessionId: session } : { type: 'manual' })
  if (result instanceof Response) return result
  return new Response(JSON.stringify({ ok: true, revision: result.libraryRevision }), { headers: JSON_HEADERS })
}

/** Live card count under the visible `卡/` store plus any un-migrated legacy dirs. */
async function liveCardCount(root: string): Promise<number> {
  const count = async (dir: string): Promise<number> => {
    const names = await readdir(dir).catch(() => [] as string[])
    const live = await Promise.all(names.map(async name =>
      stat(join(dir, name, 'card.json')).then(
        async () => !(await stat(join(dir, name, 'deleted.json')).then(() => true, () => false)),
        () => false,
      )))
    return live.filter(Boolean).length
  }
  return (await count(cardsDir(root))) + (await count(legacyCardsDir(root)))
}

/** One resolved row of the 创作库 root grid: registry pointer plus live project state. */
async function projectRow(entry: { root: string; title?: string; id?: string }): Promise<Record<string, unknown>> {
  const { root } = entry
  const missing = !(await dirExists(root))
  if (missing) return { root, missing: true, title: entry.title ?? root.split('/').pop() ?? root, works: 0, pending: 0, kindCounts: {}, covers: [] }
  const data = await payload(root)
  const library = data.works as readonly { archived: boolean; kind: string; updatedAt: string; cover?: { path?: string }; primary: { path: string } }[]
  const IMAGE_KINDS = new Set(['image', 'map', 'comic'])
  const kindCounts: Record<string, number> = {}
  const covers: string[] = []
  let updatedAt: string | undefined
  for (const work of library) {
    if (work.archived) continue
    kindCounts[work.kind] = (kindCounts[work.kind] ?? 0) + 1
    if (covers.length < 4 && IMAGE_KINDS.has(work.kind)) covers.push(work.cover?.path ?? work.primary.path)
    if (updatedAt === undefined || work.updatedAt > updatedAt) updatedAt = work.updatedAt
  }
  const project = data.project as { title?: string; description?: string } | null
  return {
    root,
    missing: false,
    /** Registry title is the single display authority; marker/dirname only backstop it. */
    title: entry.title ?? project?.title ?? root.split('/').pop() ?? root,
    description: project?.description,
    id: entry.id,
    hasMarker: (await readMarker(root)) !== undefined,
    works: library.filter(w => !w.archived).length,
    cards: await liveCardCount(root),
    pending: (data.inbox as readonly unknown[]).length,
    kindCounts,
    covers,
    updatedAt,
  }
}

/**
 * Fold session workspaces that already carry markers into the registry, and
 * heal rows whose folder moved: a tattooed id appearing at a new path re-points
 * its row instead of claiming a second project. Excluded ids stay out until a
 * manual 移入.
 */
async function autoClaim(ctx: Context): Promise<void> {
  await upgradeRegistry().catch(() => { /* a lost upgrade never blocks the listing */ })
  const persisted = await ctx.get('sessionPersistence')?.list().catch(() => undefined)
  const cwds = new Set<string>()
  for (const snap of persisted ?? []) {
    const cwd = snap.header?.cwd
    if (cwd !== undefined && cwd.length > 0) cwds.add(cwd)
  }
  const registered = new Set((await loadRegistry()).map(p => p.root))
  const byId = new Map((await loadRegistry()).flatMap(p => p.id === undefined ? [] : [[p.id, p.root] as const]))
  const excluded = await loadExcluded()
  for (const cwd of cwds) {
    if (registered.has(cwd)) continue
    const marker = await readMarker(cwd).catch(() => undefined)
    if (marker !== undefined) {
      if (excluded.has(marker.id)) continue
      if (byId.has(marker.id)) {
        await relinkProject(marker.id, cwd).catch(() => { /* a lost relink never blocks the listing */ })
        continue
      }
    }
    if (excluded.has(cwd)) continue
    if (marker !== undefined || await hasNovenMarkers(cwd)) {
      await registerProject(cwd).catch(() => { /* a lost write never blocks the listing */ })
    }
  }
}

/** Serve the global 创作库 registry: GET lists resolved rows, POST registers/unregisters/creates. */
async function serveProjects(request: Request, ctx: Context): Promise<Response> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    await autoClaim(ctx)
    const registry = await loadRegistry()
    const idCounts = new Map<string, number>()
    for (const p of registry) {
      if (p.id !== undefined) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1)
    }
    const rows = await Promise.all(registry.map(async p => ({
      ...await projectRow(p),
      ...(p.id !== undefined && (idCounts.get(p.id) ?? 0) > 1 ? { duplicate: true } : {}),
    })))
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({ projects: rows }), { headers: JSON_HEADERS })
  }
  let body: Record<string, unknown>
  try {
    body = JSON.parse(await request.text()) as Record<string, unknown>
  } catch {
    return new Response('body is not valid JSON', { status: 400, headers: JSON_HEADERS })
  }
  const bad = (text: string) => new Response(text, { status: 400, headers: JSON_HEADERS })
  const root = normalizeRoot(String(body.root ?? ''))
  if (root === '/' || root.length < 2) return bad('missing root')
  switch (String(body.op ?? '')) {
    case 'register': {
      if (!(await dirExists(root))) return bad(`directory does not exist: ${root}`)
      await registerProject(root, typeof body.title === 'string' && body.title.trim().length > 0 ? { title: body.title.trim() } : {})
      return new Response(JSON.stringify({ ok: true, row: await projectRow(await registryRow(root) ?? { root }) }), { headers: JSON_HEADERS })
    }
    case 'unregister': {
      await unregisterProject(root)
      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS })
    }
    case 'rename': {
      const title = String(body.title ?? '').trim()
      if (title.length === 0) return bad('missing title')
      if (!(await dirExists(root))) return bad(`directory does not exist: ${root}`)
      await renameProject(root, title)
      return new Response(JSON.stringify({ ok: true, row: await projectRow(await registryRow(root) ?? { root }) }), { headers: JSON_HEADERS })
    }
    case 'create': {
      const title = String(body.title ?? '').trim() || root.split('/').pop() || root
      await mkdir(root, { recursive: true })
      await registerProject(root, {
        title,
        })
      const marker = await readMarker(root)
      if (marker !== undefined && typeof body.description === 'string') {
        await writeMarker(root, { ...marker, description: body.description })
      }
      return new Response(JSON.stringify({ ok: true, row: await projectRow(await registryRow(root) ?? { root }) }), { headers: JSON_HEADERS })
    }
    default:
      return bad(`unknown op: ${String(body.op ?? '')}`)
  }
}

const LIBRARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string' },
    stage: { type: 'string' },
    count: { type: 'integer' },
  },
} as const

const HAND_EDIT_WARNING
  = 'Library state lives in the app ledger (~/.noven/ledger/); never read or edit it by hand — use these tools.'

/** Tool output row: the work with the library's work count. */
function toolOutput(work: Work, count: number): { id: string; title: string; kind: string; stage: string; count: number } {
  return { id: work.id, title: work.title, kind: work.kind, stage: work.stage, count }
}

/** Register the route and the model-facing registration tools. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-library',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serveLibrary(request, ctx),
  }), 'noven-library: /api/noven-library')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-projects',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serveProjects(request, ctx),
  }), 'noven-library: /api/noven-projects')

  ctx.tools.register(defineTool({
    name: 'list_library',
    description: `列出当前项目创作库里登记的作品（含阶段与类型）与未登记的收件箱文件。${HAND_EDIT_WARNING}`,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          works: { type: 'array', items: { type: 'object', additionalProperties: true } },
          inbox: { type: 'array', items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `创作库：${JSON.stringify(value)}` }],
    },
    async execute(_args, exec) {
      const root = sessionCwd(exec)
      const library = await loadLibrary(root)
      return {
        works: library.works.map(w => ({ id: w.id, title: w.title, kind: w.kind, stage: w.stage, archived: w.archived, path: w.primary.path, revisions: w.revisions.length })),
        inbox: (await scanInbox(root, library)).map(i => i.path),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'register_work',
    description: `把项目里一个文件登记为创作库作品；只有登记过的文件才会在创作库显示。${HAND_EDIT_WARNING}`,
    parameters: {
      path: { type: 'string', required: true, description: '文件相对项目根的路径。' },
      title: { type: 'string', description: '作品名；缺省用文件名。' },
      kind: { type: 'string', description: `作品类型，可选：${WORK_KINDS.join(' / ')}；缺省按扩展名推断。` },
      stage: { type: 'string', description: `阶段：${WORK_STAGES.join(' / ')}；缺省 draft。` },
    },
    output: { schema: LIBRARY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `已登记：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const path = normalizeRel(String(args.path ?? ''))
      if (!validRelPath(path)) throw new Error(`invalid path: ${path}`)
      const title = String(args.title ?? '').trim() || path.split('/').pop() || path
      const kind = isKind(args.kind) ? args.kind : inferKind(path)
      const stage = isStage(args.stage) ? args.stage : 'draft'
      const sessionId = exec.agent?.session.id ?? 'unknown'
      const now = new Date().toISOString()
      let created: Work | undefined
      const library = await mutateLibrary(root, (lib) => {
        created = {
          id: mintWorkId(title),
          title,
          kind,
          stage,
          archived: false,
          primary: { path },
          revisions: [],
          cardIds: [],
          source: { type: 'session', sessionId },
          createdAt: now,
          updatedAt: now,
        }
        lib.works.push(created)
        lib.ignored = lib.ignored.filter(p => p !== path)
      })
      return toolOutput(created as Work, library.works.length)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'add_work_revision',
    description: `给已登记作品追加一个历史版本（草稿、旧稿）；历史链折叠在作品详情里。${HAND_EDIT_WARNING}`,
    parameters: {
      id: { type: 'string', required: true, description: '作品 id（先 list_library）。' },
      path: { type: 'string', required: true, description: '该版本文件相对项目根的路径。' },
      label: { type: 'string', description: '版本标签，如「草稿：潮退时刻」。' },
    },
    output: { schema: LIBRARY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `已追加版本：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const path = normalizeRel(String(args.path ?? ''))
      if (!validRelPath(path)) throw new Error(`invalid path: ${path}`)
      const sessionId = exec.agent?.session.id ?? 'unknown'
      const library = await mutateLibrary(root, (lib) => {
        const work = workById(lib, String(args.id))
        work.revisions.push({ ref: { path }, label: String(args.label ?? '').trim() || '新版本', at: new Date().toISOString(), source: { type: 'session', sessionId } })
        work.updatedAt = new Date().toISOString()
      })
      return toolOutput(workById(library, String(args.id)), library.works.length)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_work_stage',
    description: `修改已登记作品的阶段：draft（草稿）/ final（定稿）/ published（已发布）。${HAND_EDIT_WARNING}`,
    parameters: {
      id: { type: 'string', required: true, description: '作品 id。' },
      stage: { type: 'string', required: true, description: `目标阶段：${WORK_STAGES.join(' / ')}。` },
    },
    output: { schema: LIBRARY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `阶段已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      if (!isStage(args.stage)) throw new Error(`invalid stage: ${String(args.stage)}`)
      const library = await mutateLibrary(root, (lib) => {
        const work = workById(lib, String(args.id))
        work.stage = args.stage as WorkStage
        work.updatedAt = new Date().toISOString()
      })
      return toolOutput(workById(library, String(args.id)), library.works.length)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'archive_work',
    description: `归档或取消归档一件作品；归档后默认隐藏，不删除文件。${HAND_EDIT_WARNING}`,
    parameters: {
      id: { type: 'string', required: true, description: '作品 id。' },
      archived: { type: 'boolean', description: '缺省 true；传 false 取消归档。' },
    },
    output: { schema: LIBRARY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `已更新归档：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const library = await mutateLibrary(root, (lib) => {
        const work = workById(lib, String(args.id))
        work.archived = args.archived !== false
        work.updatedAt = new Date().toISOString()
      })
      return toolOutput(workById(library, String(args.id)), library.works.length)
    },
  }))
}
