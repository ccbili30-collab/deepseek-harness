/**
 * noven-workbench — the workbench registration family and the image anchor,
 * ported from the legacy CreatX workbench/image-runtime packages onto plain
 * project files: registry state lives in the app ledger, and the
 * anchor inserts a Markdown image reference into a document.
 * @module noven-workbench
 */

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, normalize, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import {
  AnnotationValidationError,
  emptyAnnotationDoc,
  parseAnnotationDoc,
  readAnnotations,
  safeImageRel,
  writeAnnotations,
} from './annotations.ts'
import { loadRegistry, mintId, saveRegistry, underRoot } from './registry.ts'
import type { WorkbenchRecord, WorkbenchVisibility } from './registry.ts'
import { visibilityMatcher } from './visibility.ts'

export const name = 'noven-workbench'
export const inject = ['tools', 'connection', 'sessions']

/** One response per annotation request, JSON everywhere, never cached. */
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** Hard cap on one annotation write, matching the document-size validation. */
const MAX_BODY_BYTES = 256 * 1024

/**
 * Serve one image's annotation sidecar: GET reads it, POST replaces it.
 *
 * The connection service authenticates before this handler runs (same fence
 * as `/api/file`); the session names the workspace root, the image path is
 * confined to it, and the sidecar lands under the ledger's `annotations/` only.
 * @param request - the authenticated request.
 * @param ctx - host context carrying the session service.
 * @returns the JSON response.
 */
async function serveAnnotations(request: Request, ctx: Context): Promise<Response> {
  const fail = (status: number, text: string): Response =>
    new Response(request.method === 'HEAD' ? null : text, { status, headers: JSON_HEADERS })
  const params = new URL(request.url).searchParams
  const imageRel = safeImageRel(params.get('image') ?? '')
  if (imageRel === undefined) return fail(400, 'invalid image path')
  const session = params.get('session') as SessionId | null
  const projectRoot = session === null ? undefined : ctx.sessions.get(session)?.header?.cwd
  if (projectRoot === undefined) return fail(404, 'unknown session')
  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const doc = await readAnnotations(projectRoot, imageRel)
      const body = JSON.stringify(doc ?? emptyAnnotationDoc(imageRel))
      return new Response(request.method === 'HEAD' ? null : body, { headers: JSON_HEADERS })
    }
    const body = await request.text()
    if (body.length > MAX_BODY_BYTES) return fail(413, 'annotation payload too large')
    const doc = parseAnnotationDoc(JSON.parse(body), imageRel)
    await writeAnnotations(projectRoot, imageRel, doc)
    return new Response(JSON.stringify({ ok: true, count: doc.annotations.length }), { headers: JSON_HEADERS })
  } catch (error: unknown) {
    if (error instanceof AnnotationValidationError) return fail(400, error.message)
    if (error instanceof SyntaxError) return fail(400, 'body is not valid JSON')
    return fail(500, error instanceof Error ? error.message : 'annotation store failed')
  }
}

/**
 * Serve the session's workbench registry — the client cannot reach the
 * app-side ledger (`~/.noven/ledger/`) through workspaceFiles, so the gallery
 * reads it here. Read-only; tools remain the only writers.
 */
async function serveWorkbenches(request: Request, ctx: Context): Promise<Response> {
  const session = new URL(request.url).searchParams.get('session') as SessionId | null
  const projectRoot = session === null ? undefined : ctx.sessions.get(session)?.header?.cwd
  if (projectRoot === undefined) return new Response('unknown session', { status: 404, headers: JSON_HEADERS })
  const registry = await loadRegistry(projectRoot)
  return new Response(JSON.stringify(registry), { headers: JSON_HEADERS })
}

/** Session cwd for one tool execution. */
function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

/** Resolve a session's workspace root, or undefined for an unknown session. */
function sessionRoot(ctx: Context, session: string | null): string | undefined {
  return session === null ? undefined : ctx.sessions.get(session as SessionId)?.header?.cwd
}

/**
 * Fence a path under the project root: resolves `rel` against `base` (an
 * already-fenced absolute directory) and rejects every escape. A leading
 * slash on `rel` means workspace-root-relative, not filesystem-absolute.
 * @param root - absolute project root.
 * @param rel - the requested path (relative to `base`, or workspace-relative with a leading slash).
 * @param base - fenced absolute base directory; the root when absent.
 * @returns the absolute fenced path, or undefined on escape.
 */
function fenceRel(root: string, rel: string, base?: string): string | undefined {
  const absolute = rel.startsWith('/')
    ? normalize(resolve(root, rel.replace(/^\/+/, '')))
    : normalize(resolve(base ?? root, rel))
  const inside = absolute === root || absolute.startsWith(`${root}${sep}`)
  return inside ? absolute : undefined
}

/** Content types the frame route needs for its served resources. */
const FRAME_MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mdx': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
}

/**
 * The sandbox prelude injected ahead of served HTML: patches `fetch` so
 * relative requests resolve against the frame's own directory through this
 * route, and publishes `NOVEN_FRAME` (`url`, `loadSource`, `src`). Markup
 * resources use `NOVEN_FRAME.url(rel)`; data reads use `fetch(rel)`.
 */
function framePrelude(session: string, dir: string, src: string | null): string {
  return `<script>(()=>{const S=${JSON.stringify(session)},B=${JSON.stringify(dir)},SRC=${JSON.stringify(src)}`
    + `,R='/api/noven-frame',e=encodeURIComponent`
    + `,u=r=>R+'?session='+e(S)+'&path='+e(r)+(B?'&base='+e(B):'')`
    + `,a=r=>R+'?session='+e(S)+'&path='+e(r)`
    + `,f=window.fetch.bind(window);`
    + `window.fetch=(p,o)=>f(typeof p==='string'&&!/^[a-z][a-z0-9+.-]*:|^\\//i.test(p)?u(p):p,o);`
    + `window.NOVEN_FRAME={url:u,urlAbs:a,dir:B,src:SRC,loadSource:()=>SRC===null?Promise.reject(new Error('no source bound')):f(a(SRC)).then(r=>r.text())}})()</script>`
}

/**
 * The browser-visible origin of a frame request. The /api bridge rewrites
 * `request.url` onto `http://dsh.internal`, so `url.origin` is never the
 * origin the document runs as — the Host header is. CSP `'self'` is not a
 * substitute: the iframe's opaque origin resolves it to no match.
 */
function frameOrigin(request: Request, url: URL): string {
  const host = request.headers.get('host')
  if (host === null) return url.origin
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(/:$/, '')
  return `${proto}://${host}`
}

/** Lockdown CSP for served frame documents; `origin` is this server's own. */
function frameCsp(origin: string): string {
  const self = `'unsafe-inline' ${origin}`
  return `default-src 'none'; img-src ${origin} data: blob:; media-src ${origin} data: blob:;`
    + ` font-src ${origin} data:; style-src ${self}; script-src 'unsafe-inline' ${origin};`
    + ` worker-src ${origin} blob:; connect-src ${origin}; form-action 'none'; base-uri 'none';`
    + ` frame-ancestors ${origin}; object-src 'none'`
}

const FRAME_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

/**
 * Serve workspace files to sandboxed frame documents
 * (`GET /api/noven-frame?session=<s>&path=<p>&base=<dir>`). The iframe runs
 * without `allow-same-origin`, so every response carries `Access-Control-
 * Allow-Origin: *` for its cross-origin fetches; HTML additionally gets the
 * prelude and the lockdown CSP. Read-only, fenced to the session workspace.
 */
async function serveFrame(request: Request, ctx: Context): Promise<Response> {
  const fail = (status: number, text: string): Response =>
    new Response(text, { status, headers: { ...FRAME_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })
  const url = new URL(request.url)
  const root = sessionRoot(ctx, url.searchParams.get('session'))
  if (root === undefined) return fail(404, 'unknown session')
  const path = url.searchParams.get('path') ?? ''
  const baseParam = url.searchParams.get('base') ?? undefined
  const base = baseParam === undefined ? undefined : fenceRel(root, baseParam)
  if (baseParam !== undefined && base === undefined) return fail(403, 'base escapes the workspace')
  const absolute = fenceRel(root, path, base)
  if (absolute === undefined) return fail(403, 'path escapes the workspace')
  const info = await stat(absolute).catch(() => undefined)
  if (info === undefined || !info.isFile()) return fail(404, 'no such file')
  const type = FRAME_MIME[extname(absolute).toLowerCase()] ?? 'application/octet-stream'
  const origin = frameOrigin(request, url)
  if (type.startsWith('text/html')) {
    const html = await readFile(absolute, 'utf8')
    const dir = relative(root, dirname(absolute)).replaceAll(sep, '/')
    const prelude = framePrelude(url.searchParams.get('session') ?? '', dir === '.' ? '' : dir, url.searchParams.get('src'))
    // Inside <head> when there is one — a bare prepend would push the doctype
    // down and drop the frame page into quirks mode.
    const head = /<head[^>]*>/iu.exec(html)
    const body = head === null ? `${prelude}${html}` : `${html.slice(0, head.index + head[0].length)}${prelude}${html.slice(head.index + head[0].length)}`
    return new Response(body, {
      headers: { ...FRAME_HEADERS, 'Content-Type': type, 'Content-Security-Policy': frameCsp(origin) },
    })
  }
  const bytes = await readFile(absolute)
  return new Response(new Uint8Array(bytes), { headers: { ...FRAME_HEADERS, 'Content-Type': type } })
}

/** Dependency/build directories that never count toward a frozen file set. */
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', '__pycache__'])

/**
 * Walk a workbench folder and list the files its live visibility keeps —
 * the frozen set `set_workbench_visibility` persists when auto-inclusion is
 * off. Paths come back workbench-relative, matching the matcher's contract.
 */
async function collectVisibleFiles(root: string, folder: string, visibility: WorkbenchVisibility): Promise<string[]> {
  const base = fenceRel(root, folder)
  if (base === undefined) return []
  const matcher = visibilityMatcher(visibility)
  const out: string[] = []
  const entries = await readdir(base, { recursive: true, withFileTypes: true }).catch(() => [] as const)
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    const rel = relative(base, entry.parentPath === undefined ? base : `${entry.parentPath}`).replaceAll(sep, '/')
    const workbenchRel = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (workbenchRel.split('/').some(part => SKIPPED_DIRECTORY_NAMES.has(part))) continue
    if (matcher(workbenchRel)) out.push(workbenchRel)
  }
  return out
}

/** One document write through `/api/noven-doc`: optimistic-lock by base text. */
async function serveDoc(request: Request, ctx: Context): Promise<Response> {
  const fail = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
  if (request.method !== 'POST') return fail(405, { error: 'POST only' })
  let payload: { session?: string; path?: string; content?: string; base?: string | null }
  try {
    payload = await request.json() as typeof payload
  } catch {
    return fail(400, { error: 'body is not valid JSON' })
  }
  const root = sessionRoot(ctx, payload.session ?? null)
  if (root === undefined) return fail(404, { error: 'unknown session' })
  const absolute = fenceRel(root, payload.path ?? '')
  if (absolute === undefined) return fail(403, { error: 'path escapes the workspace' })
  if (typeof payload.content !== 'string') return fail(400, { error: 'content must be a string' })
  const current = await readFile(absolute, 'utf8').catch(() => undefined)
  if (payload.base !== null && payload.base !== undefined && current !== undefined && current !== payload.base) {
    return fail(409, { conflict: true, error: 'file changed on disk since it was loaded' })
  }
  await mkdir(dirname(absolute), { recursive: true })
  const temp = `${absolute}.noven-tmp-${String(process.pid)}`
  await writeFile(temp, payload.content)
  await rename(temp, absolute)
  return fail(200, { ok: true, bytes: payload.content.length })
}

const HAND_EDIT_WARNING
  = 'Registry state lives in the app ledger (~/.noven/ledger/); never read or edit it by hand — use these tools.'

const REGISTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    folder: { type: 'string' },
    home: { type: 'string' },
    visible: { type: 'boolean' },
    pinned: { type: 'array', items: { type: 'string' } },
    views: { type: 'object', additionalProperties: true },
    present: {
      type: 'object', additionalProperties: false,
      properties: { path: { type: 'string' }, at: { type: 'string' } },
    },
    visibility: {
      type: 'object', additionalProperties: false,
      properties: {
        include: { type: 'array', items: { type: 'string' } },
        exclude: { type: 'array', items: { type: 'string' } },
        autoIncludeNewFiles: { type: 'boolean' },
        files: { type: 'array', items: { type: 'string' } },
      },
    },
    count: { type: 'integer' },
  },
} as const

/** Throw with a stable message when an id does not resolve. */
function byId(registry: { workbenches: WorkbenchRecord[] }, id: string): WorkbenchRecord {
  const record = registry.workbenches.find(w => w.id === id)
  if (record === undefined) throw new Error(`unknown workbench id: ${id}（先 register_workbench）`)
  return record
}

/** Tool output row: the record with a mutable-array pinned view plus the registry count. */
function registryOutput(record: WorkbenchRecord, registry: { workbenches: readonly WorkbenchRecord[] }): {
  id: string, title: string, folder: string, home?: string, visible: boolean, pinned?: string[], count: number
} {
  // An explicit `undefined` property is not lossless JSON — the tool-output
  // validator rejects it, and the caller then sees a fake failure over a
  // write that already landed. Omit the key instead.
  const { pinned, ...rest } = record
  return { ...rest, ...(pinned === undefined ? {} : { pinned: [...pinned] }), count: registry.workbenches.length }
}

/** Register the annotation route and the seven ported tools. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-annotations',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serveAnnotations(request, ctx),
  }), 'noven-workbench: /api/noven-annotations')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-workbenches',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: request => serveWorkbenches(request, ctx),
  }), 'noven-workbench: /api/noven-workbenches')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-frame',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: request => serveFrame(request, ctx),
  }), 'noven-workbench: /api/noven-frame')

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-doc',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: request => serveDoc(request, ctx),
  }), 'noven-workbench: /api/noven-doc')

  ctx.tools.register(defineTool({
    name: 'register_workbench',
    description: `把项目内一个目录注册为工作台（侧栏可浏览的成果区）。${HAND_EDIT_WARNING}`,
    parameters: {
      title: { type: 'string', required: true, description: '工作台显示名，如「研究」「地图」。' },
      folder: { type: 'string', required: true, description: '工作台对应的目录（相对项目根）。' },
      home: { type: 'string', description: '打开工作台时首先展示的文件（相对该目录）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record: WorkbenchRecord = {
        id: mintId(args.title),
        title: args.title,
        folder: args.folder,
        ...(args.home !== undefined ? { home: args.home } : {}),
        visible: true,
      }
      registry.workbenches.push(record)
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rename_workbench',
    description: '修改一个已注册工作台的显示名。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      title: { type: 'string', required: true, description: '新的显示名。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      record.title = args.title
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'unregister_workbench',
    description: '注销一个工作台（只删注册记录，不删目录与文件）。',
    parameters: { id: { type: 'string', required: true, description: '工作台 id。' } },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      registry.workbenches = registry.workbenches.filter(w => w.id !== args.id)
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_workbench_home',
    description: '设置工作台打开时首先展示的文件。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      path: { type: 'string', required: true, description: '首页文件（相对工作台目录）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      record.home = args.path
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_workbench_visibility',
    description: `控制工作台的文件可见范围：visible 整个显隐；include/exclude 是相对工作台目录的 glob 规则（* 段内、** 跨段、? 单字符）；autoIncludeNewFiles=false 把当前匹配的文件集冻结成清单。${HAND_EDIT_WARNING}`,
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      visible: { type: 'boolean', description: 'true 显示 / false 隐藏工作台本身。' },
      include: { type: 'array', items: { type: 'string' }, description: '包含规则；空数组=全部可见。' },
      exclude: { type: 'array', items: { type: 'string' }, description: '排除规则，优先于 include。' },
      autoIncludeNewFiles: { type: 'boolean', description: 'false=冻结当刻匹配文件集（之后新增的文件不自动出现）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      if (typeof args.visible === 'boolean') record.visible = args.visible
      const hasScope = args.include !== undefined || args.exclude !== undefined || args.autoIncludeNewFiles !== undefined
      if (hasScope) {
        const include = (args.include ?? []).map(String)
        const exclude = (args.exclude ?? []).map(String)
        const autoIncludeNewFiles = args.autoIncludeNewFiles ?? true
        const live: WorkbenchVisibility = { include, exclude, autoIncludeNewFiles: true }
        const visibility: WorkbenchVisibility = autoIncludeNewFiles
          ? live
          : { ...live, autoIncludeNewFiles: false, files: await collectVisibleFiles(root, record.folder, live) }
        if (!autoIncludeNewFiles && (visibility.files?.length ?? 0) > 2000) {
          throw new Error(`workbench_invalid: 冻结清单超过 2000 个文件`)
        }
        record.visibility = visibility
      }
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'show_in_workbench',
    description: '把一个文件摆到画布上：记录为 pinned 优先展示，并触发一次即时呈现（工作台画布弹出该文件）。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      path: { type: 'string', required: true, description: '要展示的文件（相对项目根）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      const pinned = [...(record.pinned ?? []).filter(p => p !== args.path), args.path]
      record.pinned = pinned.slice(-16)
      record.present = { path: args.path, at: new Date().toISOString() }
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_file_view',
    description: `给工作台内一个文件绑定画框视图：canvas 打开该文件时改用指定的 HTML 画框渲染（画框经 /api/noven-frame 读源文件）。frame 省略或为空 = 解除绑定回到源视图。${HAND_EDIT_WARNING}`,
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      path: { type: 'string', required: true, description: '源文件（相对项目根）。' },
      frame: { type: 'string', description: '画框 HTML（相对项目根）；留空解除绑定。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      const views = { ...(record.views ?? {}) }
      if (args.frame === undefined || args.frame === '') delete views[args.path]
      else views[args.path] = args.frame
      record.views = Object.keys(views).length === 0 ? undefined : views
      await saveRegistry(root, registry)
      return registryOutput(record, registry)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'present_artifact',
    description: '把一帧渲染内容呈递到对话里（画框 HTML + 可选数据文件）：对话流中出现一个内嵌的渲染区块，可点开进入画布。画框是活的——它经 NOVEN_FRAME.loadSource()/fetch 读源文件，源文件更新画面即更新。',
    parameters: {
      source: { type: 'string', required: true, description: '内容源文件（相对项目根），画框经 ?src 读到它。' },
      frame: { type: 'string', required: true, description: '画框 HTML（相对项目根）。' },
      title: { type: 'string', description: '呈现标题（如「军情急报」），显示在区块上。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          status: { type: 'string' },
          frame: { type: 'string' },
          source: { type: 'string' },
          title: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const v = value as { title?: string, source?: string }
        return [{ type: 'text' as const, text: `已呈现${v.title === undefined ? '' : `「${v.title}」`}（${String(v.source ?? '')}）` }]
      },
      presentationMeta: (_args, value) => value,
    },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      for (const rel of [args.frame, args.source]) {
        const absolute = fenceRel(root, rel)
        const info = absolute === undefined ? undefined : await stat(absolute).catch(() => undefined)
        if (info === undefined || !info.isFile()) throw new Error(`present_invalid: 文件不存在或越出项目：${rel}`)
      }
      return {
        status: 'presented',
        frame: args.frame,
        source: args.source,
        ...(args.title === undefined ? {} : { title: args.title }),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'attach_image_to_document',
    description: '把项目内一张图片以 Markdown 引用插入一篇文档：默认追加到文末；给 anchor 时插到该标题之后。',
    parameters: {
      image_path: { type: 'string', required: true, description: '图片路径（相对项目根）。' },
      document_path: { type: 'string', required: true, description: 'Markdown 文档路径（相对项目根）。' },
      anchor: { type: 'string', description: '锚点标题文本（不含 #）；缺省则追加到文末。' },
      alt: { type: 'string', description: '图片替代文本，默认用文件名。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          document_path: { type: 'string' },
          image_ref: { type: 'string' },
          line: { type: 'integer' },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const record = (value ?? {}) as Record<string, unknown>
        return [{ type: 'text', text: `图片已插入：${String(record.document_path ?? '')}` }]
      },
    },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const documentPath = underRoot(root, args.document_path)
      const imagePath = underRoot(root, args.image_path)
      const { readFile, writeFile } = await import('node:fs/promises')
      const documentDir = dirname(documentPath)
      const ref = relative(documentDir, imagePath).replaceAll('\\', '/')
      const altText = (args.alt ?? '').trim()
      const alt = altText.length > 0 ? altText : args.image_path
      const line = `![${alt}](${ref})`
      const text = await readFile(documentPath, 'utf8')
      const lines = text.split('\n')
      let insertAt = lines.length
      if (args.anchor !== undefined && args.anchor.trim().length > 0) {
        const needle = args.anchor.trim()
        const index = lines.findIndex(candidate => /^#{1,6}\s+/u.test(candidate) && candidate.replace(/^#{1,6}\s+/u, '').trim() === needle)
        if (index >= 0) insertAt = index + 1
      }
      lines.splice(insertAt, 0, '', line)
      await writeFile(documentPath, lines.join('\n'))
      return { document_path: args.document_path, image_ref: line, line: insertAt + 1 }
    },
  }))
}
