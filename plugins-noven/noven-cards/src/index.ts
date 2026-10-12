/**
 * noven-cards — 手机版（Novex）卡系统的桌面移植：两种卡类（世界卡/角色卡）
 * 共用一套模块化内容底座，项目内可见存储（卡/<卡名>/，Finder 可达），AI 全量
 * 管卡工具 + 交换包导入导出 + /api/noven-cards 编辑器路由。
 * @module noven-cards
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-session'
import { registerCardTools } from './tools.ts'
import { registerCardRoutes } from './routes.ts'
import { registerTreeRoutes } from './tree.ts'
import { registerImportRoutes } from './import.ts'
import { registerBindingRoutes } from './bindings.ts'
import { registerCardContext } from './context.ts'

export const name = 'noven-cards'
export const inject = ['tools', 'connection', 'sessions', 'agents', 'sessionProjections']

/** Register the card tool family, the editor route, the content-tree route, the import route, the session-binding route, and mounted-card context injection. */
export function apply(ctx: Context): void {
  registerCardTools(ctx)
  registerCardRoutes(ctx)
  registerTreeRoutes(ctx)
  registerImportRoutes(ctx)
  registerBindingRoutes(ctx)
  registerCardContext(ctx)
}
