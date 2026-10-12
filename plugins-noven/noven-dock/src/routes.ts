/**
 * `/api/noven-dock` — 挂窗配对面。
 *
 *   GET  ?session=<id>          → { role: 'main'|'dock'|'none', dockId?, mainId? }
 *   POST { op: 'open', session } → { dockId }   幂等：有配对复用，没有就 fork。
 *
 * 挂窗就是一次主线分叉（sessionController.fork）：继承主线到分叉点的完整
 * 日志，悬空回合以 forked 收尾——"被打断的任务"在挂窗这份记忆里天然终止。
 * 配对记在 ~/.noven/dock/ 账本上，挂窗会话本身是普通会话，重启可续。
 * @module noven-dock/routes
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-session-title'
import { loadPair, savePair, type DockPairs } from './ledger.ts'

/** 配对还在用的挂窗会话：活会话直接成立，冷会话看持久化里还有没有。 */
async function dockAlive(ctx: Context, dockId: SessionId): Promise<boolean> {
  if (ctx.sessions.get(dockId) !== undefined) return true
  const stat = await ctx.get('sessionPersistence')?.stat(dockId).catch(() => undefined)
  return stat !== undefined
}

/** 拿挂窗的会话对象；不在内存里就 resolveAgent 把它的 agent 唤起来。 */
async function dockSession(ctx: Context, dockId: SessionId): Promise<Session | undefined> {
  const live = ctx.sessions.get(dockId)
  if (live !== undefined) return live
  const resolved = await ctx.sessionController.resolveAgent(dockId)
  return 'agent' in resolved ? resolved.agent.session : undefined
}

/**
 * 确保一条主线会话有挂窗：复用存活配对，否则 fork 出挂窗、记分叉点、
 * 起个认得出的名字。同一条主线的并发 open 串行——浮窗与后续发送可能
 * 同时来。
 */
const inflight = new Map<string, Promise<SessionId>>()

function ensureDock(ctx: Context, pairs: DockPairs, mainId: SessionId): Promise<SessionId> {
  const running = inflight.get(mainId)
  if (running !== undefined) return running
  const task = (async (): Promise<SessionId> => {
    const stored = pairs.dockOf(mainId) ?? loadPair(mainId)
    if (stored !== undefined && await dockAlive(ctx, stored.dockId)) {
      pairs.add(mainId, stored)
      return stored.dockId
    }
    pairs.drop(mainId)
    // FIXME(origin): origin:'service' 已进 SessionForkRequest 源码，但插件吃发布包类型，发布前先用结构型变量绕过多余属性检查。
    const forkRequest = { sessionId: mainId, origin: 'service' as const }
    const forked = await ctx.sessionController.fork(forkRequest)
    const dockId = forked.sessionId
    const dock = await dockSession(ctx, dockId)
    if (dock === undefined) throw new Error('挂窗会话建出来了但唤不醒')
    const endSeed = dock.snapshotEvents().findLast(ev => ev.type === 'session/end-seed')
    if (endSeed === undefined) throw new Error('挂窗会话缺 end-seed 分界')
    const pair = { dockId, forkAt: endSeed.seq }
    savePair(mainId, pair)
    pairs.add(mainId, pair)
    const main = ctx.sessions.get(mainId)
    const title = main === undefined ? null : ctx.sessionProjections.stateOf(main, 'title')
    try {
      ctx.get('sessionTitle')?.rename(dock, `挂窗 · ${typeof title === 'string' && title.length > 0 ? title : mainId}`)
    } catch { /* 标题是展示层，失败不挡配对 */ }
    return dockId
  })()
  inflight.set(mainId, task)
  void task.finally(() => { if (inflight.get(mainId) === task) inflight.delete(mainId) }).catch(() => { /* 失败由等待方拿 */ })
  return task
}

/** 注册 GET/POST 两个挂窗配对端点。 */
export function registerDockRoutes(ctx: Context, pairs: DockPairs): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-dock',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async request => {
      const url = new URL(request.url)
      const sessionId = url.searchParams.get('session') ?? undefined
      if (request.method === 'GET') {
        if (sessionId === undefined) return Response.json({ role: 'none' })
        const spot = pairs.roleOf(sessionId as SessionId)
        if (spot === undefined) return Response.json({ role: 'none' })
        return spot.role === 'main'
          ? Response.json({ role: 'main', dockId: spot.pair.dockId })
          : Response.json({ role: 'dock', mainId: spot.peer })
      }
      const body = await request.json().catch(() => undefined) as { op?: string; session?: string } | undefined
      if (body?.op !== 'open' || typeof body.session !== 'string') {
        return new Response('需要 { op: "open", session }', { status: 400 })
      }
      // 挂窗不能再开挂窗——一次开一个，往深处叉没意义。
      if (pairs.mainOf(body.session as SessionId) !== undefined) {
        return new Response('挂窗会话不能再生挂窗', { status: 409 })
      }
      try {
        const dockId = await ensureDock(ctx, pairs, body.session as SessionId)
        return Response.json({ dockId })
      } catch (error) {
        return new Response(error instanceof Error ? error.message : 'open failed', { status: 500 })
      }
    },
  }), 'noven-dock: /api/noven-dock')
}
