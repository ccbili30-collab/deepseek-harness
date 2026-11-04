/** Shared auxiliary-content commands rendered inside the owning content column's Chrome row. */
import { useSyncExternalStore, type ReactNode } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { FrameFoldState } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconPanelLeftOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NovenSubject } from './arrangement.ts'
import type { ShellT } from './pages/Home.tsx'

/**
 * Render the one button specification shared by every auxiliary fold and recovery action.
 * @param props - Whether this is recovery, its localized label, and the command callback.
 * @returns A 28px content-Chrome icon button.
 */
export function AuxiliaryFoldButton({ reveal, label, onClick }: {
  readonly reveal: boolean
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      className="nv-chrome-icon-button"
      data-chrome-command={reveal ? 'reveal-auxiliary' : 'fold-auxiliary'}
      data-side-fold
      aria-label={label}
      onClick={onClick}
    >
      <IconPanelLeftOutlineRegular size={16} />
    </button>
  )
}

/**
 * Place the Conversation's fold or recovery command in its real trailing slot.
 * Agent shows recovery only while Canvas is folded; handcraft shows fold only
 * while the auxiliary Conversation is expanded.
 * @param props - Subject, fold snapshot, locale, and shared actions.
 * @returns The shared button when the current arrangement needs it, otherwise null.
 */
export function ConversationAuxiliaryChrome({ t, subject, useFrameFoldState, revealAuxiliary, setAuxiliaryCollapsed, navigation, sessionId, claims, chromeHidden }: {
  readonly t: ShellT
  readonly subject: ObservableSnapshot<NovenSubject>
  readonly useFrameFoldState?: SnapshotSelectorHook<FrameFoldState>
  readonly revealAuxiliary: () => void
  readonly setAuxiliaryCollapsed: (collapsed: boolean) => void
  readonly navigation?: ReactNode
  readonly sessionId?: SessionId
  readonly claims?: {
    claim(sessionId: string | null, includeParked?: boolean): 'left' | 'right' | null
    subscribe(listener: () => void): () => void
  }
  readonly chromeHidden?: boolean
}) {
  const current = useSyncExternalStore(subject.subscribe, subject.getSnapshot)
  const collapsed = useFrameFoldState?.(state => state.auxiliaryCollapsed) ?? false
  const canReveal = useSyncExternalStore(
    listener => claims?.subscribe(listener) ?? (() => {}),
    () => {
      if (claims === undefined) return true
      if (sessionId === undefined) return false
      return claims.claim(sessionId, true) !== null
    },
  )
  const showNavigation = current === 'canvas' && !collapsed
  if (chromeHidden === true) return null
  if (current === 'conversation' && (!collapsed || !canReveal)) return null
  if (current === 'canvas' && collapsed) return null
  const reveal = current === 'conversation'
  return (
    <>
      {showNavigation && navigation}
      <AuxiliaryFoldButton
        reveal={reveal}
        label={reveal ? t('tree.expand') : t('tree.collapse')}
        onClick={reveal ? revealAuxiliary : () => { setAuxiliaryCollapsed(true) }}
      />
    </>
  )
}
