/**
 * /api/noven-sidecar — 设定栏的 HTTP 面。GET 给当前 workspace 的实体库
 * （含草稿态、关系、自动整理开关）和管理员会话编号——下半区的对话流
 * 客户端直接订阅那条真会话的事件，发送走正常 prompt 通道，本路由不再
 * 代发聊天。POST 只剩人工操作：收下/略过草稿、改写描述、开关自动整理。
 * @module noven-sidecar/routes
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ensureAdminId } from './admin.ts'
import { SidecarStore } from './store.ts'
import { withEntityStore } from './shared.ts'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** Session cwd for the entity store; live headers first, persisted headers for dormant sessions. */
async function rootFor(request: Request, ctx: Context): Promise<{ root: string } | Response> {
  const session = new URL(request.url).searchParams.get('session') as SessionId | null
  const live = session === null ? undefined : ctx.sessions.get(session)?.header
  const stored = live === undefined && session !== null
    ? await ctx.get('sessionPersistence')?.stat(session)
    : undefined
  const root = (live ?? stored?.header)?.cwd
  if (root === undefined) {
    return new Response('unknown session', { status: 404, headers: JSON_HEADERS })
  }
  return { root }
}

interface OpBody {
  readonly session?: string
  readonly op?: string
  readonly id?: string
  readonly note?: string
  readonly paused?: boolean
}

async function serve(request: Request, ctx: Context): Promise<Response> {
  const resolved = await rootFor(request, ctx)
  if (resolved instanceof Response) return resolved
  const store = new SidecarStore(resolved.root)
  if (request.method === 'GET' || request.method === 'HEAD') {
    const data = store.load()
    // 打开设定栏即让管理员上岗——惰性建会话，幂等。
    const adminSessionId = await ensureAdminId(ctx, resolved.root).catch(() => store.adminSession())
    return new Response(JSON.stringify({
      revision: data.revision,
      entities: data.entities.filter(e => e.status !== 'dismissed'),
      relations: data.relations,
      paused: data.paused === true,
      ...(adminSessionId !== undefined ? { adminSessionId } : {}),
    }), { headers: JSON_HEADERS })
  }
  const body = await request.json() as OpBody
  // workspace 级开关：自动整理暂停/恢复——不涉及实体，先分发。
  if (body.op === 'paused') {
    await withEntityStore(resolved.root, data => { data.paused = body.paused === true ? true : undefined })
    return new Response(JSON.stringify({ ok: true, paused: body.paused === true }), { headers: JSON_HEADERS })
  }
  const data = store.load()
  const entity = data.entities.find(e => e.id === body.id && e.status !== 'dismissed')
  if (entity === undefined) {
    return new Response(JSON.stringify({ error: 'unknown entity' }), { status: 404, headers: JSON_HEADERS })
  }
  switch (body.op) {
    case 'confirm':
      if (entity.status === 'draft') { entity.status = 'confirmed'; entity.updatedAt = new Date().toISOString(); data.revision++ }
      break
    case 'dismiss':
      entity.status = 'dismissed'
      entity.updatedAt = new Date().toISOString()
      data.relations = data.relations.filter(r => r.from !== entity.id && r.to !== entity.id)
      data.revision++
      break
    case 'note': {
      const note = body.note?.trim() ?? ''
      if (note.length === 0) return new Response(JSON.stringify({ error: 'note required' }), { status: 400, headers: JSON_HEADERS })
      entity.note = note
      entity.updatedAt = new Date().toISOString()
      data.revision++
      break
    }
    default:
      return new Response(JSON.stringify({ error: `unknown op: ${String(body.op ?? '')}` }), { status: 400, headers: JSON_HEADERS })
  }
  store.save(data)
  return new Response(JSON.stringify({ ok: true, revision: data.revision }), { headers: JSON_HEADERS })
}

/** Register the sidecar HTTP route against the connection's fetch registry. */
export function registerSidecarRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-sidecar',
    methods: ['GET', 'HEAD', 'POST'],
    requestBody: 'buffered',
    fetch: request => serve(request, ctx),
  }), 'noven-sidecar: /api/noven-sidecar')
}
