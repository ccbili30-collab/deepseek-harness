/**
 * User-facing HTTP surface for scoped appearance. The browser can read the
 * current Session/file view, change the two appearance domains, pick a
 * workspace shell background, and upload one local image.
 * @module noven-shell/appearance/routes
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readAppearance, AppearanceConflictError, AppearanceStoreError } from './store.ts'
import {
  AppearanceInvalidError, applyAppearancePreset, readAppearanceAsset, resetAppearance, saveAppearanceAsset, saveAppearancePreset, sessionAppearanceRoot,
  setCanvasAppearance, setConversationAppearance, setSharedAppearance, setShellAppearance, setUnifiedAppearance, setVisualAppearance,
  type AvatarChoice, type BackgroundChoice, type SharedBackgroundChoice, type VisualAppearanceInput,
} from './service.ts'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
const MAX_BODY = 8 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function failure(error: unknown): Response {
  if (error instanceof AppearanceConflictError) return Response.json({ error: error.message, revision: error.revision }, { status: 409, headers: JSON_HEADERS })
  if (error instanceof AppearanceInvalidError) return Response.json({ error: error.message }, { status: 400, headers: JSON_HEADERS })
  if (error instanceof AppearanceStoreError) return Response.json({ error: error.message }, { status: 500, headers: JSON_HEADERS })
  console.warn('noven-shell: appearance request failed:', error)
  return Response.json({ error: 'appearance request failed' }, { status: 500, headers: JSON_HEADERS })
}

function revision(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new AppearanceInvalidError('expectedRevision must be a non-negative integer')
  return value as number
}

function background(value: unknown): BackgroundChoice {
  if (!isRecord(value) || (value['kind'] !== 'default' && value['kind'] !== 'transparent' && value['kind'] !== 'image' && value['kind'] !== 'shared')) {
    throw new AppearanceInvalidError('background.kind must be default, transparent, image, or shared')
  }
  const imagePath = value['imagePath']
  const dim = value['dim']
  const blur = value['blur']
  const focus = value['focus']
  const material = value['material']
  const foreground = value['foreground']
  if (imagePath !== undefined && typeof imagePath !== 'string') throw new AppearanceInvalidError('background.imagePath must be a string')
  if (dim !== undefined && typeof dim !== 'number') throw new AppearanceInvalidError('background.dim must be a number')
  if (blur !== undefined && typeof blur !== 'number') throw new AppearanceInvalidError('background.blur must be a number')
  if (focus !== undefined && typeof focus !== 'string') throw new AppearanceInvalidError('background.focus must be a string')
  if (material !== undefined && typeof material !== 'string') throw new AppearanceInvalidError('background.material must be a string')
  if (foreground !== undefined && typeof foreground !== 'string') throw new AppearanceInvalidError('background.foreground must be a string')
  const keys = ['kind', 'imagePath', 'dim', 'blur', 'focus', 'material', 'foreground']
  if (!Object.keys(value).every(key => keys.includes(key))) throw new AppearanceInvalidError('background has unsupported fields')
  return {
    kind: value['kind'],
    ...(imagePath === undefined ? {} : { imagePath }),
    ...(dim === undefined ? {} : { dim }),
    ...(blur === undefined ? {} : { blur }),
    ...(focus === undefined ? {} : { focus: focus as BackgroundChoice['focus'] }),
    ...(material === undefined ? {} : { material: material as BackgroundChoice['material'] }),
    ...(foreground === undefined ? {} : { foreground: foreground as BackgroundChoice['foreground'] }),
  }
}

function shared(value: unknown): SharedBackgroundChoice {
  if (!isRecord(value) || (value['kind'] !== 'default' && value['kind'] !== 'image')) {
    throw new AppearanceInvalidError('shared.kind must be default or image')
  }
  const imagePath = value['imagePath']
  if (imagePath !== undefined && typeof imagePath !== 'string') throw new AppearanceInvalidError('shared.imagePath must be a string')
  if (!Object.keys(value).every(key => key === 'kind' || key === 'imagePath')) throw new AppearanceInvalidError('shared has unsupported fields')
  return { kind: value['kind'], ...(imagePath === undefined ? {} : { imagePath }) }
}

function avatar(value: unknown): AvatarChoice {
  if (!isRecord(value) || (value['kind'] !== 'default' && value['kind'] !== 'image')) {
    throw new AppearanceInvalidError('avatar.kind must be default or image')
  }
  const imagePath = value['imagePath']
  if (imagePath !== undefined && typeof imagePath !== 'string') throw new AppearanceInvalidError('avatar.imagePath must be a string')
  if (!Object.keys(value).every(key => key === 'kind' || key === 'imagePath')) throw new AppearanceInvalidError('avatar has unsupported fields')
  return { kind: value['kind'], ...(imagePath === undefined ? {} : { imagePath }) }
}

function visual(value: unknown): VisualAppearanceInput {
  if (!isRecord(value)) throw new AppearanceInvalidError('visual must be an object')
  if (!Object.keys(value).every(key => ['view', 'surface', 'foreground', 'backgroundVisibility', 'action', 'scope', 'expectedRevision'].includes(key))) {
    throw new AppearanceInvalidError('visual has unsupported fields')
  }
  const view = value['view']
  const surface = value['surface']
  const foreground = value['foreground']
  const backgroundVisibility = value['backgroundVisibility']
  if (view !== undefined && view !== 'light' && view !== 'dark') throw new AppearanceInvalidError('view must be light or dark')
  if (surface !== undefined && surface !== 'auto' && surface !== 'frosted' && surface !== 'clear') {
    throw new AppearanceInvalidError('surface is unsupported')
  }
  if (foreground !== undefined && foreground !== 'system' && foreground !== 'light' && foreground !== 'dark') {
    throw new AppearanceInvalidError('foreground is unsupported')
  }
  if (backgroundVisibility !== undefined && typeof backgroundVisibility !== 'number') {
    throw new AppearanceInvalidError('backgroundVisibility must be a number')
  }
  return {
    ...(view === undefined ? {} : { view }),
    ...(surface === undefined ? {} : { surface }),
    ...(foreground === undefined ? {} : { foreground }),
    ...(backgroundVisibility === undefined ? {} : { backgroundVisibility }),
  }
}

async function rootFor(ctx: Context, request: Request): Promise<{ root: string; sessionId: SessionId } | Response> {
  const url = new URL(request.url)
  const session = url.searchParams.get('session') ?? ''
  if (session === '') return Response.json({ error: 'session is required' }, { status: 400, headers: JSON_HEADERS })
  const sessionId = session as SessionId
  const root = await sessionAppearanceRoot(ctx.sessionController, sessionId)
  if (root === undefined) return Response.json({ error: 'session unavailable' }, { status: 404, headers: JSON_HEADERS })
  return { root, sessionId }
}

async function read(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(ctx, request)
  if (resolved instanceof Response) return resolved
  const file = new URL(request.url).searchParams.get('file') ?? undefined
  const view = await readAppearance(resolved.root, resolved.sessionId, file === '' ? undefined : file)
  return Response.json(view, { headers: JSON_HEADERS })
}

async function mutate(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(ctx, request)
  if (resolved instanceof Response) return resolved
  const raw: unknown = await request.json().catch(() => undefined)
  if (!isRecord(raw) || typeof raw['action'] !== 'string') {
    return Response.json({ error: 'invalid appearance action' }, { status: 400, headers: JSON_HEADERS })
  }
  const expectedRevision = revision(raw['expectedRevision'])
  switch (raw['action']) {
    case 'canvas': {
      const scope = raw['scope']
      if (scope !== 'workspace' && scope !== 'file') throw new AppearanceInvalidError('canvas scope must be workspace or file')
      const filePath = raw['filePath']
      if (filePath !== undefined && typeof filePath !== 'string') throw new AppearanceInvalidError('filePath must be a string')
      const view = await setCanvasAppearance(resolved.root, resolved.sessionId, {
        scope,
        ...(filePath === undefined ? {} : { filePath }),
        background: background(raw['background']),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      })
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'conversation': {
      const scope = raw['scope']
      if (scope !== 'workspace' && scope !== 'session') throw new AppearanceInvalidError('conversation scope must be workspace or session')
      const view = await setConversationAppearance(resolved.root, resolved.sessionId, {
        scope,
        ...(raw['background'] === undefined ? {} : { background: background(raw['background']) }),
        ...(raw['avatar'] === undefined ? {} : { avatar: avatar(raw['avatar']) }),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      })
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'visual': {
      const view = await setVisualAppearance(resolved.root, resolved.sessionId, {
        ...visual(raw),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      })
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'shared': {
      const view = await setSharedAppearance(resolved.root, resolved.sessionId, shared(raw['background']), expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'shell': {
      const view = await setShellAppearance(resolved.root, resolved.sessionId, background(raw['background']), expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'unified': {
      const view = await setUnifiedAppearance(resolved.root, resolved.sessionId, background(raw['background']), expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'preset_save': {
      if (typeof raw['name'] !== 'string') throw new AppearanceInvalidError('preset name must be a string')
      const view = await saveAppearancePreset(resolved.root, resolved.sessionId, raw['name'], expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'preset_apply': {
      if (typeof raw['presetId'] !== 'string') throw new AppearanceInvalidError('presetId must be a string')
      const view = await applyAppearancePreset(resolved.root, resolved.sessionId, raw['presetId'], expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    case 'reset': {
      const view = await resetAppearance(resolved.root, resolved.sessionId, expectedRevision)
      return Response.json(view, { headers: JSON_HEADERS })
    }
    default:
      return Response.json({ error: 'unsupported appearance action' }, { status: 400, headers: JSON_HEADERS })
  }
}

async function asset(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(ctx, request)
  if (resolved instanceof Response) return resolved
  if (request.method === 'POST') {
    const length = Number(request.headers.get('content-length') ?? '0')
    if (!Number.isFinite(length) || length > MAX_BODY) return Response.json({ error: 'asset exceeds 8 MiB' }, { status: 413, headers: JSON_HEADERS })
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength > MAX_BODY) return Response.json({ error: 'asset exceeds 8 MiB' }, { status: 413, headers: JSON_HEADERS })
    const path = await saveAppearanceAsset(resolved.root, bytes)
    return Response.json({ path }, { headers: JSON_HEADERS })
  }
  const path = new URL(request.url).searchParams.get('path') ?? ''
  const image = await readAppearanceAsset(resolved.root, path)
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(image.bytes), {
    headers: { 'content-type': image.type, 'cache-control': 'private, max-age=60' },
  })
}

/**
 * Register the appearance view, mutation, and asset routes.
 * @param ctx - Host context with the Session controller and authenticated fetch.
 */
export function registerAppearanceRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-appearance',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try { return request.method === 'GET' ? await read(request, ctx) : await mutate(request, ctx) }
      catch (error: unknown) { return failure(error) }
    },
  }), 'noven-shell: /api/noven-appearance')
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-appearance/asset',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: async request => {
      try { return await asset(request, ctx) }
      catch (error: unknown) { return failure(error) }
    },
  }), 'noven-shell: /api/noven-appearance/asset')
}
