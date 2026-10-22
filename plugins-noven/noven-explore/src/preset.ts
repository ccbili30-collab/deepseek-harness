/**
 * 注册「探索模式」预设：人格 + 读写基础工具 + 选项工具 + 门。
 *
 * 预设是每个会话的插件树，门挂在树内因此只作用于本模式会话。
 * @module noven-explore/preset
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { EXPLORE_PERSONA, EXPLORE_SUFFIX } from './persona.ts'

/** 预设 id；注册表默认值与门共用。 */
export const EXPLORE_PRESET_ID = 'explore'

/** 向预设注册表声明探索模式；返回的卸载器挂进插件 dispose。 */
export function registerExplorePreset(ctx: Context): void {
  ctx.effect(() => {
    let unregister: (() => Promise<void>) | undefined
    void ctx.agentPresets.register({
      id: EXPLORE_PRESET_ID,
      name: '探索模式',
      description: '默认模式：只交流和推演，不修改工作区。要动手请切到创作模式。',
      order: 10,
      plugins: [
        {
          name: '@deepseek-ai/dsh-persona',
          config: { prefix: EXPLORE_PERSONA, suffix: EXPLORE_SUFFIX },
        },
        { name: '@deepseek-ai/dsh-tool-fs' },
        { name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
        { name: '@deepseek-ai/dsh-skill-filesystem' },
        { name: '@deepseek-ai/dsh-tool-skill' },
        { name: '@deepseek-ai/dsh-tool-ask-user' },
        { name: 'noven-explore/gate' },
      ],
    }).then(dispose => { unregister = dispose })
    return () => { void unregister?.() }
  }, 'noven-explore: preset')
}
