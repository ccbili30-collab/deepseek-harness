/**
 * In-place edit and regeneration for the Noven conversation.
 *
 * The Session log is append-only, so the old answer cannot be deleted. These
 * actions instead replace the prompt's surface range in place: the edited (or
 * repeated) prompt becomes the visible tail, everything after it leaves the
 * transcript and the model context, and a new answer is generated in the same
 * Session. No fork, no second Session, no session-switch animation.
 *
 * - `conversation.chat.user-actions`: 修改 opens the inline editor; 重试
 *   re-sends the same prompt immediately.
 * - `conversation.chat.assistant-actions`: 重试 finds the Turn's prompt and
 *   re-sends it.
 * - `conversation.input.dock`: the inline editor bar above the composer.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { NovenShellLocaleKey } from './locales.ts'
import { glyph } from './icons.tsx'
import { notifyUndo } from './ui/interact.tsx'

/** Locale namespace（与 index.tsx 的 NS 同一字典）。 */
const NS = 'novenShell' as const

/** Error-notice translator supplied by the plugin root. */
type NoticeT = (key: Extract<NovenShellLocaleKey, 'rewind.failed' | 'rewind.noPrompt'>) => string

/** One message waiting in the inline editor. */
interface EditState {
  readonly sessionId: SessionId
  readonly startSeq: number
  readonly text: string
}

let editState: EditState | undefined
const editListeners = new Set<() => void>()

function publishEdit(next: EditState | undefined): void {
  if (next === editState) return
  editState = next
  for (const listener of editListeners) listener()
}

/** Inline editor selection shared by the message action and the dock bar. */
const rewindEdit = {
  getSnapshot: (): EditState | undefined => editState,
  subscribe: (listener: () => void): (() => void) => {
    editListeners.add(listener)
    return () => { editListeners.delete(listener) }
  },
  open: (state: EditState): void => { publishEdit(state) },
  close: (): void => { publishEdit(undefined) },
}

/** A turn's prompting message, resolved from the live event window. */
interface PromptInfo {
  readonly seq: number
  readonly text: string
}

/**
 * Join a user message's plain text. Non-text parts are not re-sent; the
 * original message stays in the shadowed log range.
 */
function userText(content: readonly { type: string; text?: string }[] | undefined): string {
  const parts: string[] = []
  for (const block of content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/**
 * Find the first human message after a Turn's `turn/start` event. The loop
 * appends `turn/start` before the prompt, so a lookup strictly before it picks
 * the previous Turn instead of this one.
 */
function promptForTurn(ctx: ClientContext, sessionId: SessionId, turnStartSeq: number): PromptInfo | undefined {
  const entries = ctx.sessions.binding(sessionId)?.eventSource.getSnapshot().entries
  if (entries === undefined) return undefined
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const event = entry.event
    if (event.seq <= turnStartSeq || event.type !== 'user/message') continue
    const data = event.data as { source?: { kind?: string }; content?: readonly { type: string; text?: string }[] }
    if (data.source?.kind !== 'user') continue
    const text = userText(data.content)
    if (text === '') continue
    return { seq: event.seq, text }
  }
  return undefined
}

/**
 * Ask the Host to replace the surface after `startSeq` and re-run the prompt.
 * The request returns once the new turn is admitted; the transcript updates
 * from Session events, so the view never navigates.
 */
async function postRewind(sessionId: SessionId, startSeq: number, text: string): Promise<boolean> {
  try {
    const response = await fetch('/api/noven-rewind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, startSeq, text }),
    })
    if (response.ok) return true
    const detail = await response.text().catch(() => '')
    console.warn('noven-shell: rewind rejected:', response.status, detail)
    return false
  } catch (reason: unknown) {
    console.warn('noven-shell: rewind request failed:', reason)
    return false
  }
}

/** 用户消息行的「修改」「重试」。 */
interface BranchActionsInjected {
  /** 打开这条消息的内联编辑器；发送时才真正替换。 */
  readonly edit: (seq: number, text: string) => void
  /** 把同一句提问在当前位置重发。 */
  readonly retry: (seq: number, text: string) => void
}

type UserActionProps =
  PropsRuntime<'conversation.chat.user-actions'> & PropsLocale<typeof NS> & InjectFace<BranchActionsInjected>

function UserMessageRewindActions({ seq, text, edit, retry, t }: UserActionProps) {
  return (
    <>
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

/** AI 回复操作行的「重试」。 */
interface AssistantRewindInjected {
  /** 重新生成本回合的回答。 */
  readonly retry: (turnStartSeq: number) => void
  /** 本回合提问消息的 seq；找不到时不显示按钮。 */
  readonly promptSeqForTurn: (turnStartSeq: number) => number | undefined
}

// turnStartSeq 先落在 ui-chat 源码的 owner 类型里，发布的 rc 类型还没带——
// 这里按运行时实际形状补一个可选字段，不碰模块合并。
type AssistantActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & { readonly turnStartSeq?: number }
  & PropsLocale<typeof NS> & InjectFace<AssistantRewindInjected>

function AssistantRewindActions({ turnStartSeq, retry, promptSeqForTurn, t }: AssistantActionProps) {
  if (turnStartSeq === undefined) return null
  if (promptSeqForTurn(turnStartSeq) === undefined) return null
  return (
    <button
      type="button" className="nv-msgact"
      title={t('msg.retry')} aria-label={t('msg.retry')}
      onClick={() => { retry(turnStartSeq) }}
    >{glyph.retry(13)}</button>
  )
}

/** 输入框上方的内联编辑器：改完点发送才替换，不预先动会话。 */
function RewindEditor({
  session, t,
}: PropsRuntime<'conversation.input.dock'> & PropsLocale<typeof NS>) {
  const edit = useSyncExternalStore(rewindEdit.subscribe, rewindEdit.getSnapshot)
  const [text, setText] = useState('')
  const active = edit !== undefined && edit.sessionId === session.sessionId

  useEffect(() => {
    if (edit !== undefined && edit.sessionId === session.sessionId) setText(edit.text)
  }, [edit?.sessionId, edit?.startSeq, session.sessionId])

  if (!active || edit === undefined) return null
  const send = (): void => {
    const value = text.trim()
    if (value === '') return
    void postRewind(edit.sessionId, edit.startSeq, value).then((ok) => {
      if (ok) rewindEdit.close()
      else notifyUndo({ text: t('rewind.failed') })
    })
  }
  return (
    <div className="nv-rewind-editor" data-rewind-seq={edit.startSeq}>
      <div className="nv-rewind-head">{t('rewind.editing')}</div>
      <textarea
        className="nv-rewind-input"
        value={text}
        rows={3}
        onChange={(event) => { setText(event.target.value) }}
      />
      <div className="nv-rewind-actions">
        <button type="button" className="nv-rewind-cancel" onClick={() => { rewindEdit.close() }}>
          {t('ui.cancel')}
        </button>
        <button type="button" className="nv-rewind-send" disabled={text.trim() === ''} onClick={send}>
          {t('rewind.send')}
        </button>
      </div>
    </div>
  )
}

/**
 * 挂消息修改/重试与内联编辑器。
 * @param ctx - client root context.
 * @param t - locale translator for request failures.
 */
export function applyBranches(ctx: ClientContext, t: NoticeT): void {
  const send = (sessionId: SessionId, startSeq: number, text: string): void => {
    void postRewind(sessionId, startSeq, text).then((ok) => {
      if (!ok) notifyUndo({ text: t('rewind.failed') })
    })
  }

  /** 重试 AI 回复：找回本回合的提问，在当前位置替换并重发。 */
  const retryAssistant = (sessionId: SessionId, turnStartSeq: number): void => {
    const prompt = promptForTurn(ctx, sessionId, turnStartSeq)
    if (prompt === undefined) {
      notifyUndo({ text: t('rewind.noPrompt') })
      return
    }
    send(sessionId, prompt.seq, prompt.text)
  }

  ctx.effect(() => ctx.slots.inject('conversation.chat.user-actions', () => ctx.slots.register({
    name: 'conversation.chat.user-actions', id: 'noven-rewind', order: 10, locale: NS,
    inject: (sessionId: SessionId): BranchActionsInjected => ({
      edit: (seq, text) => { rewindEdit.open({ sessionId, startSeq: seq, text }) },
      retry: (seq, text) => { send(sessionId, seq, text) },
    }),
  }, UserMessageRewindActions)), 'noven-shell: 消息修改/重试')

  ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions', id: 'noven-rewind', order: 10, locale: NS,
    inject: (sessionId: SessionId): AssistantRewindInjected => ({
      retry: turnStartSeq => { retryAssistant(sessionId, turnStartSeq) },
      promptSeqForTurn: turnStartSeq => promptForTurn(ctx, sessionId, turnStartSeq)?.seq,
    }),
  }, AssistantRewindActions)), 'noven-shell: AI 重试')

  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'noven-rewind-editor', order: 10, locale: NS,
  }, RewindEditor)), 'noven-shell: 修改编辑器')
}
