/**
 * Turn-scoped presented-artifact projection for the in-conversation frame.
 *
 * `present_artifact` persists `{status:"presented", frame, source, title?}` as
 * its result meta; this Definition collects those per Turn so the turn-tail
 * seat renders each as a live framed block beneath the closing prose —
 * replay reproduces it with no presentation side channel, and the frame
 * itself re-reads its source at render time.
 * @module noven-workbench/client/present-receipt
 */
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type {
  ConversationNodeDefinition, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Presented-artifact meta projected by `present_artifact`. */
export interface PresentedMeta {
  readonly status: string
  readonly frame: string
  readonly source: string
  readonly title?: string
}

/** One settled present_artifact result the tail renders. */
export interface PresentedResult {
  readonly seq: number
  readonly callId: string
  readonly meta: PresentedMeta
}

/** Immutable presented facts published against one Turn. */
export interface NovenPresentedData {
  readonly presented: readonly PresentedResult[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** `status:"presented"` artifact results settled in this Turn, in order. */
    'noven-frame-presented': NovenPresentedData
  }
}

/** Owner currency the turn-tail entry narrows: the closing Turn and bound seq. */
export interface PresentOwner {
  readonly turn: TurnLocation
  readonly seq: number
}

/** Narrow the durable meta payload; older sessions may lack frame fields. */
export function presentedMeta(value: unknown): PresentedMeta | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const meta = value as PresentedMeta
  return meta.status === 'presented' && typeof meta.frame === 'string' && typeof meta.source === 'string'
    ? meta
    : undefined
}

/**
 * Select the artifacts one Turn presented, deduplicated by frame+source and
 * bound by the Turn's own end.
 */
export function selectPresented(owner: PresentOwner): NovenPresentedData | null {
  const bound = owner.turn.end?.seq ?? owner.seq
  const data = owner.turn.data.get('noven-frame-presented')
  if (data === undefined) return null
  const latest = new Map<string, PresentedResult>()
  const order: string[] = []
  for (const result of data.presented) {
    if (result.seq > bound) continue
    const key = `${result.meta.frame}::${result.meta.source}`
    if (!latest.has(key)) order.push(key)
    latest.set(key, result)
  }
  return order.length === 0 ? null : { presented: order.map(key => latest.get(key) as PresentedResult) }
}

/** One in-window call head, kept to name its settled result. */
interface PresentCall {
  readonly name: string
}

interface PresentedState {
  readonly turn: number
  readonly calls: ReadonlyMap<string, PresentCall>
  readonly presented: readonly PresentedResult[]
}

/** Turn-local presented-artifact accumulator; it publishes no view Node. */
export const presentSavedDefinition: ConversationNodeDefinition<PresentedState> = {
  kind: 'noven-frame-presented',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('noven-frame-presented start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), presented: [] }
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
    const meta = presentedMeta(match.event.data.meta)
    if (call === undefined || call.name !== 'present_artifact' || meta === undefined) return context.state
    return {
      ...context.state,
      presented: [...context.state.presented, {
        seq: match.event.seq, callId: String(message.source.callId), meta,
      }],
    }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    if (previous?.kind === 'turn'
      && previous.turn === context.state.turn
      && previous.key === 'noven-frame-presented'
      && previous.value.presented === context.state.presented) return previous
    return {
      kind: 'turn',
      turn: context.state.turn,
      key: 'noven-frame-presented',
      value: { presented: context.state.presented },
    }
  },
}
