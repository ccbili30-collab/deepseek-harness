/**
 * noven-dock browser half — 挂窗配对服务。
 *
 * 窗本体已经收编成 noven-shell 画布的 conv 浮窗（同一页实体、同一折叠
 * 规则），本包只留配对查询/开配对这条服务缝：noven-shell 的工具菜单
 * 「挂窗」调 `ensureDock` 拿到挂窗会话 id，然后开 `conv:<id>` 浮窗。
 * 配对账本与 fork 逻辑在宿主侧 `routes.ts`。
 * @module noven-dock/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fetchDock, openDock } from './api.ts'

/** 挂窗对壳层暴露的服务面：查配对 + 开配对。窗体归画布管，这里只认会话。 */
export interface NovenDockService {
  /** 查配对角色：主线回它的挂窗 id；传入挂窗会话本身回自身；无配对/路由缺席回 undefined。 */
  readonly dockIdOf: (main: SessionId) => Promise<SessionId | undefined>
  /** 开（或复用）主线的挂窗配对，回挂窗会话 id；配对失败/路由缺席回 undefined。 */
  readonly ensureDock: (main: SessionId) => Promise<SessionId | undefined>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    novenDock: NovenDockService
  }
}

export function apply(_ctx: ClientContext): void {
  _ctx.provide('novenDock', {
    dockIdOf: async main => {
      const info = await fetchDock(main)
      if (info === undefined) return undefined
      if (info.role === 'dock') return main
      return info.role === 'main' ? info.dockId : undefined
    },
    ensureDock: async main => {
      const info = await fetchDock(main)
      if (info !== undefined) {
        if (info.role === 'dock') return main
        if (info.dockId !== undefined) return info.dockId
      }
      try {
        return await openDock(main)
      } catch (error) {
        console.warn('noven-dock: open failed:', error)
        return undefined
      }
    },
  })
}
