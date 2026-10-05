/**
 * noven-shell host half — serves the demo illustration assets that the client
 * pages reference until real card/workbench covers exist. Assets are the
 * generated images under `assets/`, read-only and name-fenced.
 * @module noven-shell
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'noven-shell'
export const inject = ['connection']

const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const ASSET_NAME = /^[a-z0-9-]+\.(webp|png|jpg|svg)$/
const TYPES: Record<string, string> = {
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml',
}

/** Serve one packaged asset; unknown or malformed names are a plain 404. */
async function serveAsset(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name') ?? ''
  if (!ASSET_NAME.test(name)) return new Response('not found', { status: 404 })
  try {
    const body = await readFile(join(ASSETS_DIR, name))
    return new Response(body, { headers: { 'content-type': sniffType(body) ?? TYPES[name.slice(name.lastIndexOf('.') + 1)] } })
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

/** Register the read-only asset route; all presentation ships through ./client. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-assets',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: request => serveAsset(request),
  }), 'noven-shell: /api/noven-assets')
}
