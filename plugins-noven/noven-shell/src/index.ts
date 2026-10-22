/**
 * noven-shell host half — serves the demo illustration assets that the client
 * pages reference until real card/workbench covers exist. Assets are the
 * generated images under `assets/`, read-only and name-fenced.
 * @module noven-shell
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerRewind } from './rewind.ts'

export const name = 'noven-shell'
export const inject = ['connection', 'sessionController']

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
/** Vendored Fantasy-Map-Generator editor (complete upstream app, built with a relative base). */
const MAP_EDITOR_DIR = join(ASSETS_DIR, 'map-editor')
const MAP_EDITOR_PREFIX = '/api/noven-map-editor'
/** Structural slice of the Host web server; avoids a hard dependency on the Host package. */
interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const MAP_EDITOR_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', wasm: 'application/wasm',
  map: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8',
}
/** 自由 3D 沙箱的本地 three.js 运行时（与 standalone 导出同一份源码）。 */
const THREE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'three-runtime.js')
let threeBody: Promise<Buffer> | undefined
const ASSET_NAME = /^[a-z0-9-]+\.(webp|png|jpg|svg|woff2)$/
const TYPES: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
  woff2: 'font/woff2',
}

/** Serve one packaged asset; unknown or malformed names are a plain 404. */
async function serveAsset(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name') ?? ''
  if (!ASSET_NAME.test(name)) return new Response('not found', { status: 404 })
  try {
    const body = await readFile(join(ASSETS_DIR, name))
    return new Response(body, { headers: {
      'content-type': sniffType(body) ?? TYPES[name.slice(name.lastIndexOf('.') + 1)],
      'cache-control': 'public, max-age=3600',
    } })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

/**
 * Magic-byte sniff for the served type: a few shipped `.webp` files are
 * really PNGs, and a wrong declared type makes strict decoders drop them.
 */
function sniffType(body: Buffer): string | undefined {
  if (body.length > 8 && body[0] === 0x89 && body[1] === 0x50) return 'image/png'
  if (body.length > 3 && body[0] === 0xFF && body[1] === 0xD8) return 'image/jpeg'
  if (body.length > 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

/** Serve the local three.js ESM build to the sandbox; CORS is required because srcdoc iframes have an opaque origin. */
async function serveThree(request: Request): Promise<Response> {
  try {
    threeBody ??= readFile(THREE_PATH)
    const body = await threeBody
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=60',
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'three runtime unavailable', { status: 500 })
  }
}

/** Serve one file from the vendored editor; prefix-route, traversal-fenced. */
async function serveMapEditor(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.end()
    return
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.statusCode = 400
    res.end()
    return
  }
  if (pathname !== MAP_EDITOR_PREFIX && !pathname.startsWith(`${MAP_EDITOR_PREFIX}/`)) {
    res.statusCode = 404
    res.end()
    return
  }
  let relative = pathname.slice(MAP_EDITOR_PREFIX.length).replace(/^\/+/, '')
  if (relative === '') relative = 'index.html'
  const file = resolve(MAP_EDITOR_DIR, relative)
  if (!file.startsWith(`${MAP_EDITOR_DIR}${sep}`)) {
    res.statusCode = 403
    res.end()
    return
  }
  try {
    const body = await readFile(file)
    const type = MAP_EDITOR_TYPES[extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'
    res.statusCode = 200
    res.setHeader('content-type', type)
    res.setHeader('content-length', body.length)
    res.setHeader('cache-control', type.startsWith('text/html') ? 'no-store' : 'public, max-age=60')
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.statusCode = 404
    res.end()
  }
}

/** Register the read-only asset route; all presentation ships through ./client. */
export function apply(ctx: Context): void {
  registerRewind(ctx)
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-assets',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: request => serveAsset(request),
  }), 'noven-shell: /api/noven-assets')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-three',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: request => serveThree(request),
  }), 'noven-shell: /api/noven-three')
  ctx.inject(['webServer'], web => {
    const server = web.get('webServer') as WebServerLike
    web.effect(() => server.register({
      kind: 'prefix',
      path: MAP_EDITOR_PREFIX,
      handler: serveMapEditor,
    }), 'noven-shell: /api/noven-map-editor')
  })
}
