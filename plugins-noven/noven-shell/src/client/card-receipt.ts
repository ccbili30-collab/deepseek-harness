/**
 * Turn-scoped saved-card projection for the Noven receipt card.
 *
 * This Definition publishes the cards a settled write call saved against its
 * Turn, so the receipt renders as a turn-level element through ui-chat's
 * `conversation.chat.turnTail` list seat — beneath the closing prose and
 * outside the collapsed process group. The card narrows the persisted
 * `tool/result` meta projected by noven-cards' `presentationMeta`, so Session
 * replay reproduces it with no presentation side channel.
 * @module noven-shell/client/card-receipt
 */
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type {
  ConversationMatch, ConversationNodeDefinition, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Saved-result meta projected by noven-cards write tools. */
export interface SavedCardMeta {
  readonly status: string
  readonly root_id?: string
  readonly target_id?: string
  readonly card_name?: string
  readonly card_kind?: string
}

/** One settled write result the receipt renders. */
export interface SavedCardResult {
  readonly seq: number
  readonly callId: string
  readonly tool: string
  readonly meta: SavedCardMeta
}

/** Immutable saved-card facts published against one Turn. */
export interface NovenCardSavedData {
  readonly saved: readonly SavedCardResult[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** `status:"saved"` card-write results settled in this Turn, in order. */
    'noven-card-saved': NovenCardSavedData
  }
}

/** Owner currency the turn-tail entry narrows: the closing Turn and bound seq. */
export interface CardReceiptOwner {
  readonly turn: TurnLocation
  readonly seq: number
}

/** Narrow the durable meta payload; older sessions may lack card fields. */
export function savedMeta(value: unknown): SavedCardMeta | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const meta = value as SavedCardMeta
  return meta.status === 'saved' ? meta : undefined
}

/**
 * Select the cards one Turn saved, deduplicated by root card and bound by the
 * Turn's own end so late settlements do not cross into the next Turn.
 * @param owner - Turn-tail owner currency for the closing Turn.
 * @returns one receipt row per saved root card, or null when none settled.
 */
export function selectSavedCards(owner: CardReceiptOwner): NovenCardSavedData | null {
  const bound = owner.turn.end?.seq ?? owner.seq
  const data = owner.turn.data.get('noven-card-saved')
  if (data === undefined) return null
  const latest = new Map<string, SavedCardResult>()
  const order: string[] = []
  for (const result of data.saved) {
    if (result.seq > bound) continue
    const key = result.meta.root_id ?? result.callId
    if (!latest.has(key)) order.push(key)
    latest.set(key, result)
  }
  return order.length === 0 ? null : { saved: order.map(key => latest.get(key) as SavedCardResult) }
}

/** One in-window root call head, kept to name its settled result. */
interface SavedCall {
  readonly name: string
}

interface CardSavedState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, SavedCall>
  readonly saved: readonly SavedCardResult[]
}

/** Turn-local saved-card accumulator; it publishes no view Node. */
export const cardSavedDefinition: ConversationNodeDefinition<CardSavedState> = {
  kind: 'noven-card-saved',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('noven-card-saved start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), saved: [] }
  },
  update: (context, match) => {
    if (match.event.type === 'tool/call') {
      const calls = new Map(context.state.calls)
      calls.set(String(match.event.data.callId), { name: match.event.data.name })
      return { ...context.state, calls }
    }
    if (match.event.type !== 'tool/result') return context.state
    const message = match.event.data.message
    if (message.isError === true) return context.state
    const call = context.state.calls.get(String(message.source.callId))
    const meta = savedMeta(match.event.data.meta)
    if (call === undefined || meta === undefined) return context.state
    return {
      ...context.state,
      saved: [...context.state.saved, {
        seq: match.event.seq, callId: String(message.source.callId), tool: call.name, meta,
      }],
    }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'noven-card-saved'
      && previous.value.saved === context.state.saved) return previous
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'noven-card-saved',
      value: { saved: context.state.saved },
    }
  },
}
