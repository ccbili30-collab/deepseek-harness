/**
 * 探索模式的手门：`tools/pre-execute` 默认拒绝，只读工具放行。
 * 写入与执行类工具在这个模式下永远锁；对话如何收口不再由运行时强制。
 *
 * 作为预设插件挂载，作用域即该会话。
 * @module noven-explore/gate
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import { canRunTool, denyReason } from './state.ts'

export const name = 'explore-gate'

/** 挂上只读手门。 */
export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.agent === undefined) return next()
    if (canRunTool(exec.name)) return next()
    return { kind: 'deny', reason: denyReason(exec.name) }
  })
}
