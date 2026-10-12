/**
 * 双向尾随：挂窗与主线互为对方的"背景"。任一方跑到回合边界
 * （agent/pre-step）时，把对端日志里游标之后的新增对话打成一条带来源
 * 标记的 user 消息注入——它落进接收方日志（模型可见即有据可查），但
 * `source.kind` 让界面不把它当用户发言展示。游标写在注入消息本体里，
 * 由投影折叠重建，重启不重发；对端注入的消息来源不是 'user'，不会被
 * 再转述回去——没有回声。注入是拉取式：对方不跑步它的日志原地待着，
 * 轮到哪边跑步才补增量，不打扰空闲会话。
 * @module noven-dock/tail
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { DockPairs } from './ledger.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** 对端会话动态——配对两侧互相注入的对方新内容，界面不展示。 */
    'noven-dock-peer': { kind: 'noven-dock-peer'; peer: SessionId; uptoSeq: number }
    /** 挂窗身份简报——分叉后的第一步注入一次。 */
    'noven-dock': { kind: 'noven-dock' }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** 已投递的对端 seq 游标；挂窗是否已收身份简报。 */
    novenDock: DockTailState
  }
}

interface DockTailState {
  readonly cursor: number | null
  readonly introduced: boolean
}

const stateSchema = z.object({ cursor: z.number().nullable(), introduced: z.boolean() })

/** 一条尾随消息带的对话量上限——转述是底稿不是全量备份。 */
const TAIL_LIMIT = 8000

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content.filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()
}

/**
 * 挂窗的身份简报：它继承了主线记忆，不知道自己不是主线，会接着干主线
 * 的活——第一句就告诉它身世，打消这个误会。
 */
const INTRO = `【身份简报】你是这条会话的挂窗分叉：用户在主对话之外单独开了这个窗口和你聊。你带着主线到分叉点为止的全部记忆，但你不是主线——主线自己还在运行，它的任务由它负责，你不要接着做。你的工作是回应这个窗口里的用户：答疑、讨论、帮用户想清楚。主线之后产生的对话会以【主线动态】的形式注入给你——知道即可，不要主动向用户提起，用户问起时如实回答。`

/** 挂窗收主线动态的包装。 */
function mainTailFrame(body: string, truncated: boolean): string {
  return `【主线动态】你的主线对话在你分叉后还在继续，以下是它新产生的内容${truncated ? '（超长，已截尾）' : ''}：
---
${body}
---
这些只是背景：知道即可，不要主动向用户提起主线在做什么；用户问起时如实回答。`
}

/** 主线收挂窗动态的包装。 */
function dockTailFrame(body: string, truncated: boolean): string {
  return `【旁窗动态】用户在旁边的一个小窗里另开了一段讨论（那是你的分叉，拥有你此刻之前的记忆），以下是那边新产生的内容${truncated ? '（超长，已截尾）' : ''}：
---
${body}
---
知道即可——不要主动向用户提起"旁窗"或这段讨论的存在，用户问起时如实回答。如果那边的内容明确改变了你该做的事，照新的意思办。`
}

/**
 * 收对端日志游标之后值得转述的行：真人发言和助手文本。注入内容、系统
 * 面、回合边界都不进——它们是背景噪音或我们自己的回声。返回值带游标
 * 应走到的位置（扫过的最后一个 seq），没新内容时与入参相同。
 */
function tailLines(events: readonly SessionEvent[], cursor: number): { readonly lines: readonly string[]; readonly uptoSeq: number } {
  const lines: string[] = []
  let uptoSeq = cursor
  for (const ev of events) {
    if (ev.seq <= uptoSeq) continue
    uptoSeq = ev.seq
    if (ev.type === 'user/message') {
      if (ev.data.source.kind !== 'user') continue
      const text = textOf(ev.data.content)
      if (text.length > 0) lines.push(`用户：${text}`)
    } else if (ev.type === 'assistant/message') {
      const text = textOf(ev.data.message.content)
      if (text.length > 0) lines.push(`助手：${text}`)
    }
  }
  return { lines, uptoSeq }
}

/**
 * 注册游标投影与 pre-step 注入器。投影只折叠本方日志里的注入事件——
 * cursor/introduced 都能从日志重建，进程重启不丢。
 * @param ctx - 插件上下文。
 * @param pairs - 配对索引（调用方与路由共享的同一份）。
 */
export function registerTail(ctx: Context, pairs: DockPairs): void {
  ctx.sessionProjections.register({
    key: 'novenDock',
    stateVersion: 1,
    stateSchema,
    init: (): DockTailState => ({ cursor: null, introduced: false }),
    apply: (state, event) => {
      if (event.type !== 'user/message') return state
      const kind = event.data.source.kind
      if (kind === 'noven-dock') return { ...state, introduced: true }
      if (kind === 'noven-dock-peer') return { ...state, cursor: event.data.source.uptoSeq }
      return state
    },
  })

  ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    const spot = pairs.roleOf(agent.session.id)
    if (spot === undefined) return decision
    const state = ctx.sessionProjections.stateOf(agent.session, 'novenDock') as DockTailState | undefined
    const added: ReturnType<typeof createUserMessage>[] = []
    if (spot.role === 'dock' && state?.introduced !== true) {
      added.push(createUserMessage({
        content: [{ type: 'text', text: INTRO }],
        source: { kind: 'noven-dock' },
      }))
    }
    // 对端不在场就读不到它的日志——增量留在原地，下次它在场时一次补齐。
    const peer = ctx.sessions.get(spot.peer)
    if (peer !== undefined) {
      // 游标缺省值：挂窗共享主线 forkAt 之前的内容；主线共享挂窗 forkAt
      // 及之前的内容（那本身就是主线的副本）。双方游标的初始含义一致。
      const cursor = state?.cursor ?? (spot.role === 'main' ? spot.pair.forkAt : spot.pair.forkAt - 1)
      const { lines, uptoSeq } = tailLines(peer.snapshotEvents(), cursor)
      if (lines.length > 0) {
        let body = lines.join('\n\n')
        const truncated = body.length > TAIL_LIMIT
        if (truncated) body = body.slice(0, TAIL_LIMIT)
        added.push(createUserMessage({
          content: [{ type: 'text', text: (spot.role === 'dock' ? mainTailFrame : dockTailFrame)(body, truncated) }],
          source: { kind: 'noven-dock-peer', peer: spot.peer, uptoSeq },
        }))
      }
    }
    return added.length === 0 ? decision : { ...decision, messages: [...decision.messages, ...added] }
  })
}
