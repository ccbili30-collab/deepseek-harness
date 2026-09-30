/**
 * Left-column occupants: the flat session list seated in `sidebar.workspaces`
 * (shadowing the workspace browser at a lower priority) and the account row in
 * `settings.launcher`. Sessions come from the global `useSessions` hook; card
 * context labels are fixtures until card-session binding lands.
 * @module noven-shell/client/sidebar
 */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { asset, sessionBinding } from './data.ts'
import { glyph } from './icons.tsx'

/** Business face injected into the session list: workspace navigation without the workspace browser UI. */
export interface SessionListInjected {
  readonly openSession: (sessionId: SessionId) => void
  readonly startSession: () => void
}

export type SessionListProps =
  PropsRuntime<'sidebar.workspaces'> & InjectFace<SessionListInjected> & PropsLocale<'novenShell'>

/** Flat session list: section header, title filter, thumbnail + context rows. */
export function SessionList({
  wide, expandSidebar, useSessions, useWorkspaces, usePanelInfo, openSession, startSession, t,
}: SessionListProps) {
  const list = useSessions(s => s)
  const workspaces = useWorkspaces(w => w)
  const panelActive = usePanelInfo(info => info.activePanelId !== null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  if (!wide) {
    return (
      <button type="button" className="nv-side-railbtn" onClick={expandSidebar} aria-label={t('side.sessions')}>
        {glyph.chat(18)}
      </button>
    )
  }
  const archived = new Set(workspaces.archivedSessionIds)
  const rows = list.ids
    .map(id => list.byId[id])
    .filter(s => s !== undefined && !archived.has(s.id))
    .filter(s => query === '' || s.displayTitle.includes(query))
  const currentId = panelActive
    ? undefined
    : rows.find(s => (s.retainedBy.mainView ?? 0) > 0)?.id
  return (
    <div className="nv-sessions">
      <div className="nv-sessions-head">
        <span className="nv-sessions-title">{t('side.sessions')}</span>
        <button
          type="button" className="nv-iconbtn" aria-label={t('side.search')}
          onClick={() => { setSearching(v => !v); if (searching) setQuery('') }}
        >{glyph.search(14)}</button>
        <button type="button" className="nv-iconbtn" aria-label={t('side.new')} onClick={() => { startSession() }}>
          {glyph.plus(14)}
        </button>
      </div>
      {searching && (
        <input
          className="nv-sessions-search" value={query} placeholder={t('side.search')}
          onChange={e => { setQuery(e.target.value) }}
        />
      )}
      <div className="nv-sessions-list">
        {rows.length === 0 && <p className="nv-sessions-empty">{t('side.empty')}</p>}
        {rows.map(s => {
          const meta = sessionBinding(s.displayTitle)
          return (
            <button
              type="button" key={s.id}
              className="nv-sessions-row" data-active={s.id === currentId || undefined}
              onClick={() => { openSession(s.id) }}
            >
              {meta.cover === undefined
                ? <span className="nv-sessions-thumb nv-sessions-tile" aria-hidden="true">{s.displayTitle.slice(0, 1)}</span>
                : <img className="nv-sessions-thumb" src={asset(meta.cover)} alt="" />}
              <span className="nv-sessions-texts">
                <span className="nv-sessions-name">{s.displayTitle}</span>
                <span className="nv-sessions-sub">{meta.context}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Footer-row inject face: open the 我的 panel from the avatar half. */
export interface FootLauncherInjected {
  readonly openMy: () => void
}

export type FootLauncherProps =
  PropsRuntime<'settings.launcher'> & InjectFace<FootLauncherInjected> & PropsLocale<'novenShell'>

/** Sidebar foot: avatar + user name on the left, settings gear on the right. */
export function FootLauncher({ wide, openSettings, openMy, t }: FootLauncherProps) {
  if (!wide) {
    return (
      <button type="button" className="nv-foot-rail" onClick={openSettings} aria-label={t('side.settings')}>
        <img className="nv-foot-avatar" src={asset('avatar-shenyan.webp')} alt="" />
      </button>
    )
  }
  return (
    <div className="nv-foot">
      <button type="button" className="nv-foot-user" onClick={openMy}>
        <img className="nv-foot-avatar" src={asset('avatar-shenyan.webp')} alt="" />
        <span className="nv-foot-name">{t('side.user')}</span>
      </button>
      <button type="button" className="nv-iconbtn nv-foot-gear" aria-label={t('side.settings')} onClick={openSettings}>
        {glyph.gear(16)}
      </button>
    </div>
  )
}
