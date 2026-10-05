/**
 * 管理员会话的生命周期：一个项目一个真会话（noven-sidecar preset），
 * 编号记在项目账本的 sidecar/admin.json。会话被删就重建，被挂起就
 * resolve 回来——调用方拿到的永远是可以 followup 的 Agent。
 * @module noven-sidecar/admin
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { SidecarStore } from './store.ts'
import { SIDECAR_PRESET_ID } from './preset.ts'

/** 同 root 的建会话请求串行——消化循环与 pane GET 会同时来。 */
const inflight = new Map<string, Promise<SessionId>>()

/** 项目目录挂着的 workspace 实体；没挂成 workspace 的项目走裸 cwd。 */
function workspaceOf(ctx: Context, root: string): WorkspaceId | undefined {
  return ctx.get('workspaceRegistry')?.list().find(w => w.path === root)?.id
}

/**
 * 项目管理员会话的编号：有就用，没有（或被删）就建一条 preset 会话并
 * 记进账本。建好顺手钉一个可读标题，侧栏里才认得出是谁。
 */
export async function ensureAdminId(ctx: Context, root: string): Promise<SessionId> {
  const running = inflight.get(root)
  if (running !== undefined) return running
  const task = (async (): Promise<SessionId> => {
    const store = new SidecarStore(root)
    const stored = store.adminSession()
    if (stored !== undefined && ctx.sessions.get(stored) !== undefined) return stored
    if (stored !== undefined) {
      const observed = await ctx.get('sessionPersistence')?.stat(stored).catch(() => undefined)
      if (observed !== undefined) return stored
    }
    const workspaceId = workspaceOf(ctx, root)
    // origin: 'service' 让这条会话留在普通会话导航之外。发布版 .d.ts
    // 尚未带这个字段——显式标注的变量不触发字面量多余属性检查，类型
    // 追上后这行照常编译。
    const request: {
      cwd?: string
      workspaceId?: WorkspaceId
      agentPreset?: string
      origin?: 'service'
    } = {
      ...(workspaceId === undefined ? { cwd: root } : { workspaceId }),
      agentPreset: SIDECAR_PRESET_ID,
      origin: 'service',
    }
    const created = await ctx.sessionController.create(request)
    store.saveAdminSession(created.sessionId)
    const titles = ctx.get('sessionTitle')
    const session = ctx.sessions.get(created.sessionId)
    if (titles !== undefined && session !== undefined) {
      try { titles.rename(session, '设定管理员') } catch { /* 标题是展示层，失败不挡会话 */ }
    }
    return created.sessionId
  })()
  inflight.set(root, task)
  void task.finally(() => { if (inflight.get(root) === task) inflight.delete(root) })
  return task
}

/**
 * 管理员会话的活 Agent：休眠的 resume，被删的重建后再 resolve。
 * 返回 undefined 表示会话在但被别的写入方占着——调用方按失败记账。
 */
export async function adminAgent(ctx: Context, root: string): Promise<Agent | undefined> {
  let id = await ensureAdminId(ctx, root)
  let result = await ctx.sessionController.resolveAgent(id)
  if ('agent' in result) return result.agent
  if (result.error.code !== 'session/not-found') return undefined
  new SidecarStore(root).saveAdminSession(undefined)
  id = await ensureAdminId(ctx, root)
  result = await ctx.sessionController.resolveAgent(id)
  return 'agent' in result ? result.agent : undefined
}
