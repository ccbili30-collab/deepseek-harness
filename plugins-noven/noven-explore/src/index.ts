/**
 * noven-explore — 诺文的探索模式。注册一个默认预设（人格 + 选项工具 + 门），
 * 让创作会话默认先问后写；用户下令落笔后按授权执行。
 * @module noven-explore
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { registerExplorePreset } from './preset.ts'

export const name = 'noven-explore'
export const inject = ['agentPresets']

export function apply(ctx: Context): void {
  registerExplorePreset(ctx)
}
