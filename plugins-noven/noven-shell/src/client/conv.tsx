/**
 * 侧线会话页（conv:<sessionId>）：挂窗配对会话、侧边对话侧线、一切 fork
 * 会话共用的一面迷你对话。
 *
 * 折叠规则（与挂窗同一条）：end-seed 之前是继承的主线史——只进模型记忆、
 * 不进呈现；非 'user' source 的注入消息（对端动态、sidechat 边界快照）
 * 天然隐身。用户要看主线去主会话看，这页只放它自己聊过的。
 */
import { useEffect, useRef, useState } from 'react'
import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'

export interface ConvMsg {
  readonly key: string
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/** 一页侧会话的呈现态：ready 前事件源还没挂上。 */
export interface ConvEntry {
  readonly ready: boolean
  readonly busy: boolean
  readonly error?: string
  readonly messages: readonly ConvMsg[]
}

export type ConvsMap = Readonly<Record<string, ConvEntry>>

/** 发送通道：普通 fork 会话走 session.prompt；sidechat 侧线首条要带边界注入，走 sidechat.prompt。 */
export type ConvChannel = 'direct' | 'sidechat'

const textOf = (content: readonly { type: string; text?: string }[] | undefined): string =>
  (content ?? []).filter(b => b.type === 'text' && b.text !== undefined).map(b => b.text!).join('\n').trim()

/**
 * 把一批日志事件折进视图态（纯函数，注入侧与视图共用一份真）。
 * @returns {messages, busy} 追加后的完整结果——调用方负责游标。
 */
export function foldConvEntries(
  entries: readonly SessionEventLikeEntry[],
  state: { messages: ConvMsg[]; busy: boolean; seeded: boolean },
): { messages: ConvMsg[]; busy: boolean; seeded: boolean } {
  const hasSeed = entries.some(e => e.type === 'event' && e.event.type === 'session/end-seed')
  let { messages, busy, seeded } = state
  for (const entry of entries) {
    if (entry.type !== 'event') continue
    const ev = entry.event
    if (ev.type === 'session/end-seed') { seeded = true; continue }
    if (!seeded && hasSeed) continue
    if (ev.type === 'user/message') {
      if ((ev.data.source as { kind: string }).kind !== 'user') continue
      const text = textOf(ev.data.content)
      if (text.length > 0) messages = [...messages, { key: `u${ev.seq}`, role: 'user', text }]
    } else if (ev.type === 'assistant/message') {
      const text = textOf(ev.data.message.content)
      if (text.length > 0) messages = [...messages, { key: `a${ev.seq}`, role: 'assistant', text }]
    } else if (ev.type === 'turn/start') {
      busy = true
    } else if (ev.type === 'turn/end') {
      busy = false
    }
  }
  return { messages, busy, seeded }
}

/** 侧会话页体：消息流 + 输入。发送动作由注入面按 channel 路由。 */
export function ConvView({ entry, send, labels, placeholder, sendLabel, busyLabel }: {
  readonly entry: ConvEntry | undefined
  readonly send: (text: string) => void
  readonly labels: MarkdownLabels
  readonly placeholder: string
  readonly sendLabel: string
  readonly busyLabel: string
}) {
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const busy = entry?.busy === true
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [entry?.messages.length, busy])
  const submit = (): void => {
    const text = draft.trim()
    if (text.length === 0 || busy) return
    setDraft('')
    send(text)
  }
  return (
    <div className="nv-conv">
      <div className="nv-conv-body" ref={bodyRef}>
        {(entry?.messages.length ?? 0) === 0 && !busy && (
          <div className="nv-conv-empty">{placeholder}</div>
        )}
        {entry?.messages.map(msg => msg.role === 'assistant'
          ? <div key={msg.key} className="nv-conv-msg assistant"><MarkdownText text={msg.text} labels={labels} variant="compact" /></div>
          : <div key={msg.key} className="nv-conv-msg user">{msg.text}</div>)}
        {busy && <div className="nv-conv-empty">{busyLabel}</div>}
        {entry?.error !== undefined && <div className="nv-conv-empty">{entry.error}</div>}
      </div>
      <div className="nv-conv-foot">
        <input className="nv-conv-input" value={draft} placeholder={placeholder}
          onChange={ev => setDraft(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && !ev.nativeEvent.isComposing) submit() }} />
        <button type="button" className="nv-conv-send" disabled={busy} onClick={submit}>{sendLabel}</button>
      </div>
    </div>
  )
}
