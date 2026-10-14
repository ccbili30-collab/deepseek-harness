/**
 * 会话设置的统一读写（契约 C9 / 设计理念 §16）。
 *
 * 每个会话一份 `.noven/session/<sessionId>.json`——手机模拟器旧路径
 * `.noven/sim/<id>.json` 只作只读兼容（迁移来源）。设置页签与模拟器设置屏
 * 共用本 hook，保证一处改、处处见；文档走 {@link DocEntry} 温层，切回会话
 * 先见旧值再被后台刷新覆盖（缓存态留存）。
 * @module noven-shell/client/session-settings
 */
import { useCallback, useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { docKey, type CanvasInjected, type DocsHook, type DocEntry } from './canvas.tsx'

/**
 * 会话级设置——对齐 Android NovexConversationConfiguration 的文本字段。
 * answerIdentity/myIdentity 等字段普通会话的服务端注入尚未接线（后续批次），
 * 当前由设置面板与模拟器共同持久；模拟器会话发送时消费 perTurn/style。
 */
export interface SessionSettings {
  readonly answerIdentity: string
  readonly myIdentity: string
  readonly prompt: string
  readonly background: string
  readonly perTurn: string
  readonly style: string
}

export const SESSION_SETTINGS_EMPTY: SessionSettings = {
  answerIdentity: '', myIdentity: '', prompt: '', background: '', perTurn: '', style: '',
}

export const sessionSettingsPath = (sessionId: SessionId): string =>
  `.noven/session/${sessionId}.json`

/** 手机模拟器时代的旧路径，仅用于把已有设置搬进新文件。 */
const legacySimSettingsPath = (sessionId: SessionId): string =>
  `.noven/sim/${sessionId}.json`

function parseSettings(content: string | undefined): SessionSettings {
  if (content === undefined) return SESSION_SETTINGS_EMPTY
  try {
    const parsed = JSON.parse(content) as Partial<SessionSettings>
    return { ...SESSION_SETTINGS_EMPTY, ...parsed }
  } catch {
    return SESSION_SETTINGS_EMPTY
  }
}

export interface UseSessionSettingsResult {
  readonly settings: SessionSettings
  /** true = 温层还没拿到任何快照（首次加载），调用方应避免渲染可编辑空表单。 */
  readonly loading: boolean
  readonly save: (next: SessionSettings) => void
}

/**
 * 绑定一个会话的设置文档：先渲染温层旧值；旧 `.noven/sim` 文件存在而新文件
 * 缺失时，一次性把内容搬到新路径。保存带 base，防止覆盖外部改动。
 */
export function useSessionSettings(
  sessionId: SessionId | undefined,
  useDocs: DocsHook,
  ensureDoc: CanvasInjected['ensureDoc'],
  saveDoc: CanvasInjected['saveDoc'],
): UseSessionSettingsResult {
  const newPath = sessionId === undefined ? undefined : sessionSettingsPath(sessionId)
  const legacyPath = sessionId === undefined ? undefined : legacySimSettingsPath(sessionId)
  const entry = useDocs(s => (sessionId === undefined || newPath === undefined ? undefined : s[docKey(sessionId, newPath)]))
  const legacyEntry = useDocs(s => (sessionId === undefined || legacyPath === undefined ? undefined : s[docKey(sessionId, legacyPath)]))

  const [settings, setSettings] = useState<SessionSettings>(SESSION_SETTINGS_EMPTY)
  const [base, setBase] = useState<string | null>(null)
  const [forSession, setForSession] = useState<SessionId | undefined>(undefined)

  useEffect(() => {
    if (sessionId === undefined) return
    ensureDoc(sessionId, sessionSettingsPath(sessionId))
  }, [sessionId, ensureDoc])
  useEffect(() => {
    if (sessionId === undefined) return
    // 老会话的模拟器设置也捞起来当迁移源。
    ensureDoc(sessionId, legacySimSettingsPath(sessionId))
  }, [sessionId, ensureDoc])

  useEffect(() => {
    if (sessionId === undefined || newPath === undefined) {
      setForSession(undefined); setSettings(SESSION_SETTINGS_EMPTY); setBase(null)
      return
    }
    if (forSession === sessionId) return
    if (entry === undefined || entry.state === 'loading') return
    setForSession(sessionId)
    if (entry.state === 'ready' && entry.content !== undefined) {
      setSettings(parseSettings(entry.content))
      setBase(entry.content)
      return
    }
    // 新文件缺失：若旧 sim 文件有内容，搬进新文件（只搬一次，保存即定型）。
    if (entry.state === 'missing' && legacyEntry?.state === 'ready' && legacyEntry.content !== undefined) {
      const migrated = parseSettings(legacyEntry.content)
      if (migrated !== SESSION_SETTINGS_EMPTY && Object.values(migrated).some(v => v.trim() !== '')) {
        const text = JSON.stringify(migrated, null, 2)
        setSettings(migrated)
        setBase(null)
        void saveDoc(sessionId, newPath, text, null).then(res => { if (res === 'ok') setBase(text) })
        return
      }
    }
    setSettings(SESSION_SETTINGS_EMPTY)
    setBase(null)
  }, [sessionId, newPath, entry, legacyEntry, forSession, saveDoc])

  const save = useCallback((next: SessionSettings) => {
    setSettings(next)
    if (sessionId === undefined || newPath === undefined) return
    const text = JSON.stringify(next, null, 2)
    void saveDoc(sessionId, newPath, text, base).then(res => { if (res === 'ok') setBase(text) })
  }, [sessionId, newPath, saveDoc, base])

  return { settings, loading: entry === undefined || entry.state === 'loading', save }
}
