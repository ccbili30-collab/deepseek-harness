/**
 * 创作 — the creation surface: the real conversation composer hosted on a
 * blank Session (embedded `conversation.content`, never a lookalike) and the
 * two working paths (handcraft / import). The page keeps a blank Session as
 * the composer's host while it is the active panel; the host's first prompt
 * is a plain conversation submission, and the page morphs into the revealed
 * conversation as it engages.
 * @module noven-shell/client/pages/Create
 */
import { useEffect, useRef, useState } from 'react'
import type { ShellT } from './Home.tsx'
import { CreateHero } from '../create-hero.tsx'
import type { RenderFactorySlot, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceId, WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { glyph } from '../icons.tsx'
import { enterConversationScene } from '../creation-transition.ts'

interface Props {
  readonly t: ShellT
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  readonly useSessions: SnapshotSelectorHook<SessionListState>
  readonly renderFactorySlot: RenderFactorySlot
  /** Ensure a blank Session is the current main-view host without leaving this page. */
  readonly ensureBlankHost: (workspaceId: WorkspaceId | undefined) => Promise<void>
  /** Reveal a Session's conversation in the main area (the handoff target). */
  readonly revealSession: (sessionId: SessionId) => void
  /** Enters the blank IDE after ensuring a real session exists. */
  readonly onStartHandcraft: (workspaceId: WorkspaceId | undefined, source: HTMLElement) => Promise<boolean>
  /** Imports a card package file into the chosen workspace, then opens it in the editor. */
  readonly onImportCard: (file: File, workspaceId?: WorkspaceId) => void
}

/** The main-view-retained Session is this page's composer host. */
function mainSessionId(list: SessionListState): SessionId | undefined {
  return Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id
}

export function Create({ t, useWorkspaces, useSessions, renderFactorySlot, ensureBlankHost, revealSession, onStartHandcraft, onImportCard }: Props) {
  const [handcraftFailed, setHandcraftFailed] = useState(false)
  const importRef = useRef<HTMLInputElement | null>(null)

  const workspaces = useWorkspaces(s => s.items)
  const workspacesState = useWorkspaces(s => s.state)
  const hostId = useSessions(mainSessionId)
  const hostBlank = useSessions(s => (hostId === undefined ? undefined : s.byId[hostId]?.blank))
  const hostCwd = useSessions(s => (hostId === undefined ? undefined : s.byId[hostId]?.cwd))
  /** 空白宿主的实际预设；改默认前留下的 standard 空白不能再当这个页面的宿主。 */
  const hostPreset = useSessions(s => (hostId === undefined ? undefined : s.byId[hostId]?.projectionValues?.agentPreset))
  /** 默认 = 最近活跃会话所在的工作区（没有则清单第一项）。 */
  const recentCwd = useSessions(s => {
    let cwd: string | undefined
    let at = Number.NEGATIVE_INFINITY
    for (const id of s.ids) {
      const row = s.byId[id]
      if (row?.cwd !== undefined && row.updatedAt > at) { at = row.updatedAt; cwd = row.cwd }
    }
    return cwd
  })
  const workspace: WorkspaceView | undefined =
    workspaces.find(w => w.path === hostCwd)
    ?? workspaces.find(w => w.path === recentCwd)
    ?? workspaces[0]

  // The host's first prompt is the real submission. The app immediately
  // stands up a fresh blank as the new current when one engages, so the
  // handoff must follow the Session this page hosted — the current blank
  // before engagement, not whatever the main view points at afterwards. A
  // mount-time real Session is not a submission: only a Session this page
  // watched go blank → engaged.
  const [hostedId, setHostedId] = useState<SessionId | undefined>(undefined)
  const hostEngaged = useSessions(s => hostedId !== undefined && s.byId[hostedId]?.blank === false)
  useEffect(() => {
    // A workspace switch re-hosts the page on another blank: follow it until
    // one engages, then keep the engaged id as the handoff target.
    if (hostBlank === true && hostId !== undefined && !hostEngaged) setHostedId(hostId)
  }, [hostBlank, hostId, hostEngaged])
  const revealedRef = useRef(false)
  useEffect(() => {
    if (!hostEngaged || revealedRef.current) return
    revealedRef.current = true
    const id = hostedId as SessionId
    void enterConversationScene(async () => {
      revealSession(id)
      return true
    })
  }, [hostEngaged, hostedId, revealSession])

  // The composer needs a blank host: acquire one when the current main view
  // holds a real Session (or nothing). It stands down once the hosted Session
  // engages — re-homing then would fight the handoff — and it never repeats.
  const ensuringRef = useRef(false)
  useEffect(() => {
    // Wait for the workspace list: creating the host before it loads falls back
    // to the harness cwd, and a blank outside every workspace leaves the
    // composer in its read-only "choose a workspace" state.
    if (workspacesState === 'loading') return
    if ((hostBlank === true && hostPreset === 'explore') || hostEngaged || revealedRef.current || ensuringRef.current) return
    ensuringRef.current = true
    void ensureBlankHost(workspace?.workspaceId).catch((reason: unknown) => {
      console.warn('noven-shell: blank host ensure failed:', reason)
      ensuringRef.current = false
    })
  }, [hostBlank, hostPreset, hostEngaged, ensureBlankHost, workspace?.workspaceId, workspacesState])

  return (
    <div className="nv-page nv-create-page">
      <div className="nv-create-ritual">
        <CreateHero t={t} />

        {/* The composer mounts only on a real blank host: bound to a real
            Session it would queue prompts into it. It stays mounted through
            the engage→reveal handoff (hostEngaged): unmounting it on the same
            render that fires the handoff would rob the morph of its old
            anchor — the capture needs the hero composer still on the page. */}
        {(hostBlank === true || hostEngaged) && (
          <div className="nv-create-hero">
            {renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'hero', hero: true })}
          </div>
        )}

        <div className="nv-create-paths">
          <button type="button" className="nv-create-path" onClick={event => {
            setHandcraftFailed(false)
            void onStartHandcraft(workspace?.workspaceId, event.currentTarget).then(ok => { if (!ok) setHandcraftFailed(true) })
          }}>
            <span className="nv-create-path-icon">{glyph.file(18)}</span>
            <span><strong>{t('create.handcraft')}</strong><small>{t('create.handcraft.sub')}</small></span>
            <span className="nv-create-path-arrow">↗</span>
          </button>
          <button type="button" className="nv-create-path" onClick={() => importRef.current?.click()}>
            <span className="nv-create-path-icon">{glyph.download(18)}</span>
            <span><strong>{t('create.import')}</strong><small>{t('create.import.sub')}</small></span>
            <span className="nv-create-path-arrow">↗</span>
          </button>
          <input ref={importRef} type="file" hidden onChange={event => {
            const file = event.target.files?.[0]
            if (file !== undefined) onImportCard(file, workspace?.workspaceId)
            event.currentTarget.value = ''
          }} />
        </div>
        {handcraftFailed && <div className="nv-create-inline-error">{t('create.handcraft.failed')}</div>}
      </div>
    </div>
  )
}
