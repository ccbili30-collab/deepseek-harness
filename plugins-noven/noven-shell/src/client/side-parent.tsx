/**
 * The side subject's parent entry: the Sessions list when the side subject is
 * the Conversation, the Workspace directory when it is the Canvas.
 *
 * One frame seat renders this in the side column's trailing row, before the
 * fold. The Conversation and Canvas never render their own parent; switching
 * subjects switches the provider here. The directory provider is a
 * Session-scoped child entry, so the slot renderer binds its tree hooks
 * instead of this component rebuilding them.
 * @module noven-shell/client/side-parent
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { NovenSubject } from './arrangement.ts'
import { NovenSideSessionMenu, type SideSessions } from './mode.tsx'

/** Data and actions the shell supplies to the side parent seat. */
export interface SideParentInjected {
  /** Which subject currently owns the side column. */
  readonly subject: ObservableSnapshot<NovenSubject>
  /** Session whose Workspace the directory reads in Agent. */
  readonly currentSession: ObservableSnapshot<SessionId | undefined>
  /** Current-Workspace Session summaries for the side Conversation. */
  readonly sessions: ObservableSnapshot<SideSessions>
  /** Open a Session and reveal the side conversation. */
  readonly openSession: (id: SessionId) => void
  /** Open the complete Session browser without replacing the current Session. */
  readonly showBrowser: () => void
  /** Hold one Client reference for the directory child's Session scope. */
  readonly retainSession: (id: SessionId) => SessionReference
}

/** Hold the directory child's Session scope for exactly the current Session. */
function useSessionReference(
  sessionId: SessionId | undefined,
  retain: (id: SessionId) => SessionReference,
): SessionReference | undefined {
  const [reference, setReference] = useState<SessionReference | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined) {
      setReference(undefined)
      return
    }
    const next = retain(sessionId)
    setReference(next)
    return () => { next.release() }
  }, [retain, sessionId])
  return reference?.sessionId === sessionId ? reference : undefined
}

/** Props from the frame's side-header trailing seat plus the shell injection. */
export type SideParentProps = PropsRuntime<'side.header.trailing'>
  & PropsLocale<'novenShell'>
  & InjectFace<SideParentInjected>
  & PropsRenderSlots<'side.parent.directory'>

/**
 * Render the side subject's parent; the frame owns the fold beside it.
 * @param props - Frame collapse fact, locale, shell provider data, and the
 * Session-scoped directory child seat.
 * @returns The side parent entry, or null while folded.
 */
export function SideParent(props: SideParentProps) {
  const subject = useSyncExternalStore(props.subject.subscribe, props.subject.getSnapshot)
  const sessionId = useSyncExternalStore(props.currentSession.subscribe, props.currentSession.getSnapshot)
  const reference = useSessionReference(subject === 'conversation' ? sessionId : undefined, props.retainSession)
  if (props.collapsed) return null
  if (subject === 'canvas') {
    return <NovenSideSessionMenu t={props.t} sessions={props.sessions} open={props.openSession} showBrowser={props.showBrowser} />
  }
  if (reference === undefined) return null
  return (
    <props.SessionProvider session={reference}>
      {props.renderSlot('side.parent.directory', {})}
    </props.SessionProvider>
  )
}
