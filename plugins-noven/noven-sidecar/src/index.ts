/**
 * noven-sidecar — 常驻设定管理员的服务端。它是一条真会话（noven-sidecar
 * preset：管理员人设 + 实体工具），输入有两路：消化循环把主对话每轮增量
 * 打包成整理任务 followup 进去，作者从设定栏直接向它说话。它的工作成果
 * 物化在项目级实体库（应用侧账本），由 /api/noven-sidecar 面供给侧栏 pane。
 * @module noven-sidecar
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { registerDigest } from './digest.ts'
import { registerSidecarPreset } from './preset.ts'
import { registerSidecarRoutes } from './routes.ts'

export const name = 'noven-sidecar'
export const inject = ['connection', 'sessions', 'sessionProjections', 'sessionController', 'agentPresets']

export function apply(ctx: Context): void {
  registerSidecarPreset(ctx)
  registerDigest(ctx)
  registerSidecarRoutes(ctx)
}
