/**
 * 探索模式的判定：只交流，不落笔。
 *
 * 没有"落笔态"：内容写入、平台写入、执行类工具在这个模式下永远是锁的。
 * 用户要动手时，唯一的出口是切换到标准模式。提问收口仍然强制。
 * @module noven-explore/state
 */

/** 唯一被允许的收口工具。 */
export const ASK_TOOL = 'ask_user_question'

/** 每会话一份；turn 用于按轮重置提问检查。 */
export interface ExploreState {
  /** 最近一次 pre-step 的 turn；首次为 -1。 */
  turn: number
  /** 本轮是否调用过 ask_user_question。 */
  asked: boolean
  /** 本轮因未收口被打回的次数。 */
  steers: number
}

/** 只读工具：放行。 */
const READ = /^(list_|read_|.*_describe$|help$|skill$|export_card$|read$|glob$|grep$|ls$|web_search$|web_fetch$|todo_write$)/

/** 新会话的初始状态。 */
export function initialState(): ExploreState {
  return { turn: -1, asked: false, steers: 0 }
}

/**
 * 该工具在当前模式是否放行。默认拒绝；只读白名单与收口工具是仅有的出口。
 * @param name - 模型请求的工具名。
 * @returns true 表示交给后续 pre-execute 与执行；false 表示由门拒绝。
 */
export function canRunTool(name: string): boolean {
  if (name === ASK_TOOL) return true
  return READ.test(name)
}

/** 新的一轮开始：重置提问检查与打回计数。 */
export function beginTurn(state: ExploreState, turn: number): void {
  if (state.turn === turn) return
  state.turn = turn
  state.asked = false
  state.steers = 0
}

/** 本轮调用过收口工具。 */
export function noteAsk(state: ExploreState): void {
  state.asked = true
}

/** 用户已经回答完这次提问：下一段输出必须重新收口。 */
export function noteAnswered(state: ExploreState): void {
  state.asked = false
}

/** 是否需要在 turn-stopping 打回（没提问、未超两次）。 */
export function shouldNudge(state: ExploreState): boolean {
  return !state.asked && state.steers < 2
}

/**
 * 记一次打回。返回 false 表示已达上限，本次不再 steer。
 * @param state - 当前会话状态。
 */
export function noteSteer(state: ExploreState): boolean {
  if (!shouldNudge(state)) return false
  state.steers += 1
  return true
}

/** 固定打回文案：把选择交回用户。 */
export const NUDGE = '【收口】这一轮没有把选择交回用户。请用 ask_user_question 提出下一个问题，附二到三个同级选项；不要用陈述成品收尾。'

/** 固定拒绝文案：只说明模式边界与出口。 */
export function denyReason(name: string): string {
  return `【探索模式】只交流，不落笔：${name} 已锁。要继续聊天就调用 ask_user_question 提下一个问题；想让我动手编辑，请切换到创作模式。`
}
