/**
 * 探索模式的两道门：
 * - 手门：`tools/pre-execute` 默认拒绝，只读与收口工具放行；写入/执行永远锁。
 * - 口门：`agent/turn-stopping` 检查本轮是否用 ask_user_question 收口，
 *   没有就 steer 打回；每轮最多两次，数据缺失时放行。
 *
 * 作为预设插件挂载，作用域即该会话。
 * @module noven-explore/gate
 */
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  ASK_TOOL, NUDGE, beginTurn, canRunTool, denyReason, initialState,
  noteAnswered, noteAsk, noteSteer, shouldNudge, type ExploreState,
} from './state.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** 门打回时注入的纠正消息：模型可见，界面不作为用户发言展示。 */
    'noven-explore-nudge': { kind: 'noven-explore-nudge' }
  }
}

export const name = 'explore-gate'

/** 每会话一份状态；进程内有效，重启归零。 */
const states = new WeakMap<object, ExploreState>()

function stateOf(session: Session): ExploreState {
  let state = states.get(session)
  if (state === undefined) {
    state = initialState()
    states.set(session, state)
  }
  return state
}

/** 挂上两道门。 */
export function apply(ctx: Context): void {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const agent = exec.agent
    if (agent === undefined) return next()
    const state = stateOf(agent.session)
    if (exec.name === ASK_TOOL) noteAsk(state)
    if (canRunTool(exec.name)) return next()
    return { kind: 'deny', reason: denyReason(exec.name) }
  })

  ctx.on('tools/result', exec => {
    if (exec.name !== ASK_TOOL) return
    const agent = exec.agent
    if (agent === undefined) return
    // The user has answered: the next model output must close with a new ask.
    noteAnswered(stateOf(agent.session))
  })

  ctx.on('agent/pre-step', async (payload, next) => {
    beginTurn(stateOf(payload.agent.session), payload.turn)
    return next()
  })

  ctx.on('agent/turn-stopping', ({ agent }) => {
    const state = stateOf(agent.session)
    if (!shouldNudge(state)) return
    if (!noteSteer(state)) return
    agent.steer(createUserMessage({
      content: [{ type: 'text', text: NUDGE }],
      source: { kind: 'noven-explore-nudge' },
    }))
  })
}
