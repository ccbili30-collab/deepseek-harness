/**
 * 会话分支操作：
 * - `conversation.chat.user-actions`：每条用户消息行挂「回溯」「修改」「重试」。
 *   回溯把会话分叉到这条消息之前并打开新分支；修改同样分叉并把原文预填进
 *   草稿待改后发；重试分叉后自动把原文重发——一步重新生成。
 * - `conversation.chat.assistant-actions`：AI 回合尾挂「回溯」「重试」。重试
 *   向上找回本回合的提问，分叉到提问之前并自动重发。
 * 会话日志 append-only，上游唯一的"改写"是 fork：分叉在内部发生，外部呈现
 * 为"这条会话从这一点继续"——旧线留在工作区，不藏起来。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import { glyph } from './icons.tsx'

/** Locale namespace（与 index.tsx 的 NS 同一字典）。 */
const NS = 'novenShell' as const

/** 新分支装配输入面/绑定需要几个 tick；轮询到可用或耗尽为止。 */
const READY_ATTEMPTS = 40
const READY_INTERVAL_MS = 150

/**
 * 把分叉建好的新会话草稿预填成原文。输入面要等 openSession 装配后才可用，
 * 轮询到有 input 或重试耗尽为止。
 */
function prefillDraft(ctx: ClientContext, id: SessionId, text: string, attempts = READY_ATTEMPTS): void {
  const scope = ctx.sessions.scope(id)
  const input = scope?.get('conversation')?.input.for(scope)
  if (input !== undefined) {
    input.setDraft(text)
    input.focus()
    return
  }
  if (attempts > 0) window.setTimeout(() => { prefillDraft(ctx, id, text, attempts - 1) }, READY_INTERVAL_MS)
}

/**
 * 分叉建好后在新会话里自动重发原文。等会话作用域可用再 prompt；失败少量重试
 * ——重试是"一步重新生成"，不能停在草稿态。
 */
function autoSend(ctx: ClientContext, id: SessionId, text: string, attempts = READY_ATTEMPTS): void {
  if (ctx.sessions.scope(id) === undefined) {
    if (attempts > 0) window.setTimeout(() => { autoSend(ctx, id, text, attempts - 1) }, READY_INTERVAL_MS)
    return
  }
  void ctx.sessions.using(id, { source: 'novenShell' }, async reference => {
    const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok && attempts > 0) window.setTimeout(() => { autoSend(ctx, id, text, Math.min(attempts - 1, 10)) }, READY_INTERVAL_MS)
  }).catch((reason: unknown) => { console.warn('noven-shell: 分支重发失败:', reason) })
}

/** 事件流里 seq 边界之前的最后一条真人提问（供 AI 回合重试找回原文）。 */
function lastUserPrompt(entries: readonly SessionEventLikeEntry[], beforeSeq: number): { seq: number; text: string } | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!
    if (entry.type !== 'event' || entry.event.type !== 'user/message' || entry.event.seq >= beforeSeq) continue
    const data = entry.event.data as { source?: { kind?: string }; content?: readonly { type: string; text?: string }[] }
    if (data.source?.kind !== 'user') continue
    const text = (data.content ?? []).filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()
    if (text.length > 0) return { seq: entry.event.seq, text }
  }
  return undefined
}

/** 用户消息行的「回溯」「修改」「重试」注入面。 */
interface BranchActionsInjected {
  /** 从 seq-1 处分叉并打开新分支（这条消息不进新分支）。 */
  readonly rewind: (seq: number) => void
  /** 同回溯，再把原文预填进新分支草稿。 */
  readonly edit: (seq: number, text: string) => void
  /** 同回溯，再把原文自动重发——一步重新生成。 */
  readonly retry: (seq: number, text: string) => void
}

type UserActionProps =
  PropsRuntime<'conversation.chat.user-actions'> & PropsLocale<typeof NS> & InjectFace<BranchActionsInjected>

/** 消息操作行追加的三枚小钮。 */
function UserMessageBranchActions({ seq, text, rewind, edit, retry, t }: UserActionProps) {
  return (
    <>
      <button
        type="button" className="nv-msgact"
        title={t('msg.rewind')} aria-label={t('msg.rewind')}
        onClick={() => { rewind(seq) }}
      >{glyph.rewind(13)}</button>
      <button
        type="button" className="nv-msgact"
        title={t('msg.edit')} aria-label={t('msg.edit')}
        onClick={() => { edit(seq, text) }}
      >{glyph.edit(13)}</button>
      <button
        type="button" className="nv-msgact"
        title={t('msg.retry')} aria-label={t('msg.retry')}
        onClick={() => { retry(seq, text) }}
      >{glyph.retry(13)}</button>
    </>
  )
}

/** AI 回合尾的「回溯」「重试」注入面。 */
interface AssistantRewindInjected {
  /** 在 boundarySeq 处分叉并打开新分支。 */
  readonly forkAt: (boundarySeq: number) => void
  /** 找回本回合的提问：分叉到提问之前并自动重发。入参 = 本回合 turn/start 的 seq。 */
  readonly retry: (turnStartSeq: number) => void
}

// turnStartSeq 先落在 ui-chat 源码的 owner 类型里，发布的 rc 类型还没带——
// 这里按运行时实际形状补一个可选字段，不碰模块合并。
type AssistantActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & { readonly turnStartSeq?: number }
  & PropsLocale<typeof NS> & InjectFace<AssistantRewindInjected>

/** AI 回复操作行的回溯/重试小钮。 */
function AssistantRewindAction({ turnStartSeq, forkAt, retry, t }: AssistantActionProps) {
  if (turnStartSeq === undefined || turnStartSeq < 2) return null
  return (
    <>
      <button
        type="button" className="nv-msgact"
        title={t('msg.rewind')} aria-label={t('msg.rewind')}
        onClick={() => { forkAt(turnStartSeq - 1) }}
      >{glyph.rewind(13)}</button>
      <button
        type="button" className="nv-msgact"
        title={t('msg.retry')} aria-label={t('msg.retry')}
        onClick={() => { retry(turnStartSeq) }}
      >{glyph.retry(13)}</button>
    </>
  )
}

/**
 * 挂两个会话级分支位。
 * @param ctx - client root context.
 * @param inheritCanvas - 分叉成功后把父会话的画布（页签/布局/浮窗）复制给子会话。
 */
export function applyBranches(ctx: ClientContext, inheritCanvas: (from: SessionId, to: SessionId) => void): void {
  const forkAt = (sessionId: SessionId, boundary: number, text?: string, resend = false): void => {
    if (boundary < 1) return
    // FIXME(origin): fork 的 origin:'service' 已进 SessionForkRequest 与本地契约源码，但插件吃
    // 发布包类型（同 noven-dock/routes.ts 的 FIXME），发布前先用结构型变量绕过多余属性检查。
    const forkOpts = { sessionId, atSeq: boundary, increaseTitle: true, origin: 'service' as const }
    ctx.sessions.fork(forkOpts)
      .then((childId) => {
        inheritCanvas(sessionId, childId)
        ctx.uiWorkspace.openSession(childId)
        if (text !== undefined) (resend ? autoSend : prefillDraft)(ctx, childId, text)
      })
      .catch((reason: unknown) => { console.warn('noven-shell: 分支分叉失败:', reason) })
  }
  /** AI 回合重试：找回 turnStartSeq 前的最后一条真人提问，分叉到它之前并自动重发。 */
  const retryTurn = (sessionId: SessionId, turnStartSeq: number): void => {
    let found: { seq: number; text: string } | undefined
    void ctx.sessions.using(sessionId, { source: 'novenShell' }, async reference => {
      found = lastUserPrompt(reference.binding.eventSource.getSnapshot().entries, turnStartSeq)
    }).then(() => {
      if (found !== undefined) forkAt(sessionId, found.seq - 1, found.text, true)
    }).catch((reason: unknown) => { console.warn('noven-shell: 找回提问失败:', reason) })
  }

  ctx.effect(() => ctx.slots.inject('conversation.chat.user-actions', () => ctx.slots.register({
    name: 'conversation.chat.user-actions', id: 'noven-branches', order: 10, locale: NS,
    inject: (sessionId: SessionId): BranchActionsInjected => ({
      rewind: (seq) => { forkAt(sessionId, seq - 1) },
      edit: (seq, text) => { forkAt(sessionId, seq - 1, text) },
      retry: (seq, text) => { forkAt(sessionId, seq - 1, text, true) },
    }),
  }, UserMessageBranchActions)), 'noven-shell: 消息分支操作')

  ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'noven-assistant-rewind', order: 10, locale: NS,
    inject: (sessionId: SessionId): AssistantRewindInjected => ({
      forkAt: (boundary) => { forkAt(sessionId, boundary) },
      retry: (boundary) => { retryTurn(sessionId, boundary) },
    }),
  }, AssistantRewindAction)), 'noven-shell: AI 回溯操作')
}
