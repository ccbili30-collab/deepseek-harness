/** Fixed topbar mode control and the auxiliary header/terminal actions. */
import { useState, useSyncExternalStore } from 'react'
import { IconClockOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { createNovenSubjectStore } from './arrangement.ts'
import { modeOfSubject } from './arrangement.ts'
import { glyph } from './icons.tsx'

/** Current-Workspace Session summaries for the side Conversation's history menu. */
export interface SideSessions {
  readonly rows: readonly { readonly id: SessionId; readonly title: string; readonly blank: boolean }[]
  readonly currentId: SessionId | undefined
}

/** Props supplied by the Conversation header actions seat. */
export type NovenSideSessionMenuProps = PropsLocale<'novenShell'> & {
  readonly sessions: ObservableSnapshot<SideSessions>
  readonly open: (id: SessionId) => void
}

/**
 * The side Conversation's parent: a Session-list button beside its fold.
 * @param props - Current-Workspace summaries, open callback, and locale.
 * @returns The header session menu.
 */
export function NovenSideSessionMenu({ sessions, open, t }: NovenSideSessionMenuProps) {
  const snapshot = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot)
  const [menuOpen, setMenuOpen] = useState(false)
  const label = t('nav.sessions')
  return (
    <Menu
      open={menuOpen && snapshot.rows.length > 0}
      onClose={() => { setMenuOpen(false) }}
      items={snapshot.rows.map(row => ({
        id: row.id,
        label: row.blank && row.title === '' ? t('nav.newSession') : row.title,
        icon: <IconClockOutlineRegular size={16} />,
      }))}
      selectedId={snapshot.currentId}
      onSelect={(id) => { open(id as SessionId); setMenuOpen(false) }}
      side="bottom"
      align="end"
      portal
      dense
      anchor={(
        <Tooltip label={label} side="bottom" delayMs={400}>
          <button type="button" className="nv-side-session-button" aria-label={label} aria-expanded={menuOpen}
            data-side-session-menu disabled={snapshot.rows.length === 0}
            onClick={() => { setMenuOpen(value => !value) }}>
            <IconClockOutlineRegular size={16} />
          </button>
        </Tooltip>
      )}
    />
  )
}

/** Props supplied by the fixed topbar seat and the application-wide subject store. */
export type NovenModeSwitchProps = PropsRuntime<'shell.topbar'>
  & PropsLocale<'novenShell'>
  & PropsStore<ReturnType<typeof createNovenSubjectStore>>
  & { readonly side?: 'right' | 'bottom'; readonly onMode: (mode: import('./arrangement.ts').NovenMode) => void }

/**
 * Toggle the workbench subject without changing Session or Canvas content.
 * @param props - Locale and the global subject store.
 * @returns One fixed Agent / Handcraft button that displays the current subject's label.
 */
export function NovenModeSwitch({ useStore, onMode, t, side = 'bottom' }: NovenModeSwitchProps) {
  const mode = modeOfSubject(useStore(state => state.subject))
  const currentLabel = t(mode === 'agent' ? 'mode.toAgent' : 'mode.toIde')
  const targetLabel = t(mode === 'agent' ? 'mode.toIde' : 'mode.toAgent')
  const actionLabel = t('mode.toggle', { mode: targetLabel })
  return (
    <Tooltip label={actionLabel} side={side} delayMs={400}>
      <button type="button" className="nv-mode-switch nv-mode-switch-topbar"
        aria-label={actionLabel} aria-pressed={mode === 'ide'}
        onClick={() => { onMode(mode === 'agent' ? 'ide' : 'agent') }}>
        <span className="nv-mode-switch-icon" aria-hidden="true">{mode === 'agent' ? glyph.layers(16) : glyph.sparkle(16)}</span>
        <span className="nv-mode-switch-label">{currentLabel}</span>
      </button>
    </Tooltip>
  )
}
