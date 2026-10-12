/**
 * noven-dock — 会话挂窗的服务端。挂窗是主线会话的一次分叉：继承主线到
 * 分叉点的全部记忆，之后两边各跑各的；双向尾随（tail.ts）把对方的新
 * 对话注入成带来源标记的隐藏消息——彼此心里有数，用户看不见。配对由
 * /api/noven-dock 管理，账本在 ~/.noven/dock/。
 * @module noven-dock
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { DockPairs } from './ledger.ts'
import { registerTail } from './tail.ts'
import { registerDockRoutes } from './routes.ts'

export const name = 'noven-dock'
export const inject = ['connection', 'sessions', 'sessionProjections', 'sessionController']

export function apply(ctx: Context): void {
  const pairs = new DockPairs()
  registerTail(ctx, pairs)
  registerDockRoutes(ctx, pairs)
}
