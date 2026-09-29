/**
 * noven-cards — 手机版（Novex）卡系统的桌面移植：两种卡类（世界卡/角色卡）
 * 共用一套模块化内容底座，项目内存储（.noven/cards/，随 git 走），AI 全量
 * 管卡工具 + 交换包导入导出。设计契约见 noven-docs/手机版卡系统拆解.md。
 *
 * 宿主半边 only：工具面；卡片 UI 后议（前端停做中）。
 * @module noven-cards
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerCardTools } from './tools.ts'

export const name = 'noven-cards'
export const inject = ['tools']

/** Register the card tool family. */
export function apply(ctx: Context): void {
  registerCardTools(ctx)
}
