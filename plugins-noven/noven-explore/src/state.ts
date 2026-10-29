/**
 * 探索模式的工具边界：只交流，不落笔。
 *
 * 没有"落笔态"：内容写入、平台写入、执行类工具在这个模式下永远锁。
 * 提问是可用的协作方式，不再是每轮必须完成的收口动作。
 * @module noven-explore/state
 */

/** 提问工具；与只读工具一样放行。 */
export const ASK_TOOL = 'ask_user_question'

/** 只读工具：放行。 */
const READ = /^(list_|read_|.*_describe$|help$|skill$|export_card$|read$|glob$|grep$|ls$|web_search$|web_fetch$|todo_write$)/

/**
 * 该工具在当前模式是否放行。默认拒绝；只读白名单与提问工具是仅有的出口。
 * @param name - 模型请求的工具名。
 * @returns true 表示交给后续 pre-execute 与执行；false 表示由门拒绝。
 */
export function canRunTool(name: string): boolean {
  if (name === ASK_TOOL) return true
  return READ.test(name)
}

/** 固定拒绝文案：说明只读边界与创作出口，不把拒绝转成新的提问任务。 */
export function denyReason(name: string): string {
  return `【探索模式】只交流，不落笔：${name} 已锁。不要换工具绕开；如果用户要动手，先说明并询问是否切换到创作模式。`
}
