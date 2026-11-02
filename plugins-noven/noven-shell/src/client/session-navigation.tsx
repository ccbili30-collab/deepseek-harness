/** Persistent Session navigation shared by Conversation, Create, and the content tree. */
import { useSyncExternalStore } from 'react'
import { IconClockOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { NovenMode } from './arrangement.ts'
import type { ShellT } from './pages/Home.tsx'

/** Actions owned by the product shell; the button never changes Session or mode itself. */
export interface SessionNavigationActions {
  /** Temporarily replace IDE content navigation with the full Session browser. */
  readonly showTemporary: () => void
  /** Restore the product content navigator after temporary Session navigation. */
  readonly hideTemporary: () => void
  /** Reopen the whole navigation column when macOS or the user hid it. */
  readonly expandSidebar: () => void
}

/** Inputs for the connected button used outside the slot renderer's injection hooks. */
export interface SessionNavigationButtonProps extends SessionNavigationActions {
  readonly t: ShellT
  readonly mode: ObservableSnapshot<NovenMode>
  readonly sessionBrowser: ObservableSnapshot<boolean>
}

/** Injected form of the connected button, with locale supplied by the slot renderer. */
export type SessionNavigationInjected = Omit<SessionNavigationButtonProps, 't'>

interface SessionNavigationViewProps extends SessionNavigationActions {
  readonly t: ShellT
  readonly mode: NovenMode
  readonly open: boolean
}

/**
 * Render one clock affordance whose label names the destination rather than generic history.
 * @param props - Current mode, temporary-browser state, locale, and shell actions.
 * @returns The shared Session-list clock.
 */
export function SessionNavigationView({ t, mode, open, showTemporary, hideTemporary, expandSidebar }: SessionNavigationViewProps) {
  const returning = mode === 'ide' && open
  const label = t(returning ? 'nav.contentTree' : 'nav.sessions')
  return (
    <Tooltip label={label} side="bottom" delayMs={400}>
      <button
        type="button"
        className="nv-session-nav-button"
        aria-label={label}
        aria-expanded={mode === 'ide' ? open : undefined}
        data-active={returning || undefined}
        data-noven-session-navigation={mode}
        onClick={() => {
          if (mode === 'agent') {
            hideTemporary()
            expandSidebar()
          } else if (open) {
            hideTemporary()
          } else {
            showTemporary()
            expandSidebar()
          }
        }}
      >
        <IconClockOutlineRegular size={15} />
      </button>
    </Tooltip>
  )
}

/**
 * Subscribe directly to the product sources so Create can share the button without a second slot.
 * @param props - Mode and temporary-browser sources plus navigation actions.
 * @returns The persistent Session-list clock.
 */
export function SessionNavigationButton(props: SessionNavigationButtonProps) {
  const mode = useSyncExternalStore(props.mode.subscribe, props.mode.getSnapshot)
  const open = useSyncExternalStore(props.sessionBrowser.subscribe, props.sessionBrowser.getSnapshot)
  return <SessionNavigationView {...props} mode={mode} open={open} />
}
