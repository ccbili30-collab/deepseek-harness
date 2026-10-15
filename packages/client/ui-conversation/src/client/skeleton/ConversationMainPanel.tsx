import type { ConversationSlotProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { ConversationWidthControls } from './ConversationWidthControls.tsx'
import css from './ConversationRoot.module.css'

/**
 * Render the existing main Conversation frame around the extracted content.
 * @param props - the original `main.conversation` Slot props.
 * @returns the unchanged root, Header, content, and width-control subtree.
 */
export function ConversationMainPanel(props: ConversationSlotProps) {
  const { sessionId, useSession, useSessions, useConversation, useWorkspaces, renderSlot, renderFactorySlot } = props
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const shellPhase = session === undefined || conversation === undefined
    ? 'blank'
    : conversationPhase(session, conversation)
  const openState = session?.openState
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)
  // Cold-start restoration: a saved main selection (persisted by ui-workspace)
  // exists, but the session has not been re-retained yet and the lists are
  // still loading. Showing the "choose workspace" hero here is wrong in two
  // ways — it is not the first run, and the picker would be clickable for a
  // few hundred ms before the real session replaces it. Hold a non-interactive
  // restoring state until either the session lands or the lists prove there is
  // nothing to restore.
  const sessionsPhase = useSessions(s => s.phase)
  const workspacesPhase = useWorkspaces(s => s.phase)
  const restoring = (() => {
    if (sessionId !== undefined) return false
    if (sessionsPhase === 'ready' && workspacesPhase === 'ready') return false
    try {
      const saved = JSON.parse(localStorage.getItem('dsh.sessions.current') ?? 'null') as unknown
      return saved !== null
        && typeof saved === 'object'
        && (typeof (saved as { sessionId?: unknown }).sessionId === 'string'
          || typeof (saved as { subagentAddress?: unknown }).subagentAddress === 'object')
    } catch {
      return false
    }
  })()

  // While a session is still replaying (loading + blank) the hero/docked
  // choice is unknowable — render the composer hidden instead of flashing
  // the centered hero and snapping to the docked bar (or vice versa).
  // Exemption: a session the list summary already proves blank can only
  // land on the hero, so hiding would blank the column for the whole
  // history round-trip (the startup auto-selection flash) for nothing.
  // The exemption is deliberately open-state-wide, not loading-only: a
  // summary-blank session is the hero before its open starts (`cold`) and
  // after one fails (`error`) for the same reason — there is no history.
  // A restored continuable subagent waits for a Host summary to establish
  // parent availability. This keeps the composer
  // hidden instead of briefly rendering the parent-offline takeover.
  const parentAvailabilityPending = session?.subagent?.address.mode === 'continuable'
    && session.subagent.parentAvailable === undefined
  const settling = sessionId !== undefined && (
    (shellPhase === 'blank' && openState === 'loading' && summaryBlank !== true)
    || parentAvailabilityPending
  )
  const hero = !restoring
    && (sessionId === undefined
      || (shellPhase === 'blank' && (openState === 'open' || summaryBlank === true)))
  const phase = restoring ? 'restoring' : settling ? 'settling' : hero ? 'hero' : 'active'

  return (
    <div className={css.root} data-phase={phase} data-restoring={restoring || undefined} aria-busy={restoring || undefined}>
      {renderSlot('conversation.header', {})}
      {renderFactorySlot('conversation.content', {
        variant: 'main',
        phase,
        hero,
      }, {
        slots: { widthControls: ConversationWidthControls },
      })}
    </div>
  )
}
