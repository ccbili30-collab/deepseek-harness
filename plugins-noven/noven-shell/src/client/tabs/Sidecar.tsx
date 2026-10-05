/**
 * 设定 sidecar — 右单元的常驻助手页：上半是管理员的工作成果（实体库
 * 物化视图，草稿等着收下/略过），下半是管理员会话的真实对话流——
 * 整理任务与作者消息同流，流式、排队、错误都是正常会话语义。
 * @module noven-shell/client/tabs/Sidecar
 */
import { useEffect, useRef, useState } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from '../pages/Home.tsx'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidecarEntityView, SidecarOp, SidecarPayload } from '../sidecar-api.ts'
import { glyph } from '../icons.tsx'

/** 管理员会话流里的一条消息：task=true 是消化循环投来的整理任务。 */
export interface SidecarMessage {
  readonly key: string
  readonly role: 'user' | 'assistant'
  readonly task?: boolean
  readonly text: string
}

/** 管理员会话的实况：流 + 是否在跑一轮。 */
export interface SidecarAdminState {
  readonly messages: readonly SidecarMessage[]
  readonly busy: boolean
}

/** The pane's observable: entity store plus the admin session's live stream. */
export interface SidecarState {
  readonly payload: SidecarPayload | undefined
  readonly admin: SidecarAdminState
}

interface Props {
  readonly t: ShellT
  readonly useTabInfo: UseSidebarRightTabInfo
  readonly useSidecar: SnapshotSelectorHook<SidecarState>
  readonly run: (op: SidecarOp) => Promise<void>
  readonly send: (text: string) => Promise<{ ok: boolean; error?: string }>
}

const KIND_ORDER = ['character', 'place', 'system', 'item', 'other'] as const

function kindLabel(t: ShellT, kind: SidecarEntityView['kind']): string {
  return t(`sidecar.kind.${kind}`)
}

function EntityRow({ t, entity, run }: { readonly t: ShellT; readonly entity: SidecarEntityView; readonly run: (op: SidecarOp) => Promise<void> }) {
  const draft = entity.status === 'draft'
  return (
    <div className="nv-sidecar-entity" data-draft={draft || undefined}>
      <div className="nv-sidecar-entityhead">
        <span className="nv-sidecar-name">{entity.name}</span>
        {draft && (
          <span className="nv-sidecar-actions">
            <button type="button" className="nv-btn-ghost nv-sidecar-act" onClick={() => { void run({ op: 'confirm', id: entity.id }) }}>{t('sidecar.accept')}</button>
            <button type="button" className="nv-btn-ghost nv-sidecar-act" onClick={() => { void run({ op: 'dismiss', id: entity.id }) }}>{t('sidecar.dismiss')}</button>
          </span>
        )}
      </div>
      {entity.note.length > 0 && <div className="nv-sidecar-note">{entity.note}</div>}
    </div>
  )
}

export function SidecarTab({ t, useTabInfo, useSidecar, run, send }: Props) {
  useTabInfo()
  const state = useSidecar(s => s)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const streamRef = useRef<HTMLDivElement | null>(null)
  const entities = state.payload?.entities ?? []
  const relations = state.payload?.relations ?? []
  const messages = state.admin.messages
  const paused = state.payload?.paused === true
  const nameOf = (id: string): string => entities.find(e => e.id === id)?.name ?? id
  const submit = async () => {
    const text = draft.trim()
    if (text.length === 0 || sending) return
    setSending(true)
    setSendError(false)
    try {
      const result = await send(text)
      if (result.ok) setDraft('')
      else setSendError(true)
    } finally {
      setSending(false)
    }
  }
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
  }, [messages.length, state.admin.busy, sending])
  return (
    <div className="nv-sidecar">
      <div className="nv-sidecar-top">
        <div className="nv-sidecar-topbar">
          <span className="nv-sidecar-topbar-label">{t('sidecar.autodigest')}</span>
          <Switch
            checked={!paused}
            label={t('sidecar.autodigest')}
            onChange={next => { void run({ op: 'paused', paused: !next }) }}
          />
        </div>
        {entities.length === 0 && messages.length === 0 && (
          <div className="nv-sidecar-empty">{t('sidecar.empty')}</div>
        )}
        {KIND_ORDER.map(kind => {
          const members = entities.filter(e => e.kind === kind)
          if (members.length === 0) return null
          return (
            <section className="nv-sidecar-section" key={kind}>
              <h4>{kindLabel(t, kind)}<span className="nv-sidecar-count">{members.length}</span></h4>
              {members.map(entity => <EntityRow key={entity.id} t={t} entity={entity} run={run} />)}
            </section>
          )
        })}
        {relations.length > 0 && (
          <section className="nv-sidecar-section">
            <h4>{t('sidecar.relations')}<span className="nv-sidecar-count">{relations.length}</span></h4>
            {relations.map((r, i) => (
              <div className="nv-sidecar-rel" key={`${r.from}-${r.label}-${r.to}-${i}`}>
                {nameOf(r.from)} <em>{r.label}</em> {nameOf(r.to)}
              </div>
            ))}
          </section>
        )}
      </div>
      <div className="nv-sidecar-seam" aria-hidden="true" />
      <div className="nv-sidecar-stream" ref={streamRef}>
        {messages.map(msg => msg.task === true
          ? (
            <div className="nv-sidecar-msg nv-sidecar-task" data-role="user" key={msg.key}>
              <span className="nv-sidecar-msgmark">{glyph.sparkle(12)}</span>
              <span className="nv-sidecar-msgtext">{t('sidecar.task')}</span>
            </div>
          )
          : (
            <div className="nv-sidecar-msg" data-role={msg.role} key={msg.key}>
              <span className="nv-sidecar-msgtext">{msg.text}</span>
            </div>
          ))}
        {state.admin.busy && <div className="nv-sidecar-status" data-live="true">{glyph.sparkle(12)} {t('sidecar.thinking')}</div>}
      </div>
      {sendError && <div className="nv-sidecar-error">{t('sidecar.send.failed')}</div>}
      <div className="nv-sidecar-composer">
        <textarea
          className="nv-sidecar-input"
          rows={2}
          placeholder={t('sidecar.chat.placeholder')}
          value={draft}
          onChange={e => { setDraft(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <button
          type="button" className="nv-iconbtn nv-sidecar-send"
          aria-label={t('sidecar.send')} disabled={sending || draft.trim().length === 0}
          onClick={() => { void submit() }}
        >{glyph.send(14)}</button>
      </div>
    </div>
  )
}
