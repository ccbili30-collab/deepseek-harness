/**
 * 设定管理员的 agent preset 声明：它就是一个真会话，区别只在人设
 * （持续整理实体库）和它的专用工具（noven-sidecar/entities）。
 * preset 让这条会话复用整个对话基建——流式、队列、持久化、模型路由。
 * @module noven-sidecar/preset
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'

/** preset 与管理员身份判定共用的 preset id。 */
export const SIDECAR_PRESET_ID = 'noven-sidecar'

/** 实体工具插件的解析名——同包 ./entities 导出的 function plugin。 */
const ENTITIES_ENTRY = 'noven-sidecar/entities'

/**
 * 管理员的本分写进系统提示：持续整理实体库 + 可以跟作者聊设定。
 * 工具的参数与用法由工具描述自述，这里不重复。
 */
const PERSONA = `你是这个创作项目的设定管理员。你的长期职责是整理和维护项目的设定实体库：人物、地点、体系、物品与它们的关系。

你会收到两类消息：
- 整理任务：主创作对话刚结束一轮，内容转述给你。你判断其中有没有会复用的设定——登场人物、地点、力量/世界体系、关键物品；有就用实体工具记下来，没有就回复一句没新东西要记。
- 作者的直接交谈：讨论灵感与设定。回答简短（三五句内），像同事站在白板边聊；拿不准的主动反问消歧。

本分：
- 只谈设定——不写正文、不替主对话下笔、不复述剧情。
- 只记会复用的设定；一次性路人、随口举例不记。
- 新记的设定先以草稿落库，由作者确认后才算数。
- 谈库里有什么之前先用实体工具查——不凭印象回答库的内容。`

/** 向 preset 注册表声明管理员 preset；返回的卸载器挂进插件 dispose。 */
export function registerSidecarPreset(ctx: Context): void {
  ctx.effect(() => {
    let unregister: (() => Promise<void>) | undefined
    void ctx.agentPresets.register({
      id: SIDECAR_PRESET_ID,
      name: '设定管理员',
      description: '常驻侧边的设定整理会话：跟随主对话增量维护实体库，可直接交谈。',
      order: 90,
      plugins: [
        {
          name: '@deepseek-ai/dsh-persona',
          config: { prefix: PERSONA, suffix: '你的工作目录是 {{cwd}}。' },
        },
        { name: ENTITIES_ENTRY },
      ],
    }).then(dispose => { unregister = dispose })
    return () => { void unregister?.() }
  }, 'noven-sidecar: preset')
}
