/**
 * Live AI-editing state for one Session's canvas.
 *
 * The model's card writes are ordinary tool calls. A call that names a card
 * (`root_id`) and a module (`module_id`/`parent_id`) is surfaced as an edit
 * from `tool/call` until its `tool/result` settles; the state keeps each card
 * visible for a short minimum so a fast write still reads as an intentional
 * shimmer instead of a one-frame flicker. The canvas tab strip, the canvas
 * frame, and the card page all read this one snapshot, so a module edit is the
 * same activity in every surface.
 *
 * This state is presentation-only: it never writes cards and never gates a
 * write. AI edits commit directly.
 * @module noven-shell/client/ai-edits
 */
import { createContext, useContext } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type {
  ISessions, SessionEventLike, SessionEventLikeEntry, SessionReference,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CARD_WRITE_TOOLS } from './card-tools.ts'

/** Cards being edited right now, keyed by card id; the set holds module ids (empty = card-level). */
export interface AiEditsSnapshot {
  readonly cards: ReadonlyMap<string, ReadonlySet<string>>
}

/** Stable empty snapshot for components outside a canvas. */
export const EMPTY_AI_EDITS: AiEditsSnapshot = { cards: new Map() }

/** Canvas-scoped provider: one Session's live edit snapshot. */
export const AiEditsContext = createContext<AiEditsSnapshot>(EMPTY_AI_EDITS)

/** Read the enclosing canvas's AI-editing snapshot. */
export function useAiEdits(): AiEditsSnapshot {
  return useContext(AiEditsContext)
}

interface EditTarget {
  readonly cardId: string
  readonly moduleIds: readonly string[]
}

interface PendingEdit extends EditTarget {
  readonly startedAt: number
}

interface HeldEdit extends EditTarget {
  readonly until: number
}

/** At least this long on screen per settled call, so a fast write still shimmers. */
const HOLD_MS = 900

const CARD_TOOL_SET: ReadonlySet<string> = new Set(CARD_WRITE_TOOLS)
const MODULE_ARG_KEYS = ['module_id', 'parent_id', 'target_module_id'] as const

/**
 * Read a card edit out of a tool call. `target_id` is deliberately absent: the
 * world/character target is a card, not a module. Calls without `root_id`
 * (card creation) have no open tab to mark.
 * @param name - wire tool name.
 * @param raw - JSON argument text from the durable `tool/call` event.
 * @returns the card and its named modules, or undefined for reads and malformed calls.
 */
function editTarget(name: string, raw: string): EditTarget | undefined {
  if (!CARD_TOOL_SET.has(name)) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // SyntaxError: a partial or malformed call carries no card identity.
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const args = parsed as Record<string, unknown>
  const cardId = typeof args.root_id === 'string' ? args.root_id : undefined
  if (cardId === undefined || cardId === '') return undefined
  const moduleIds: string[] = []
  for (const key of MODULE_ARG_KEYS) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') moduleIds.push(value)
  }
  return { cardId, moduleIds }
}

function sameCards(left: ReadonlyMap<string, ReadonlySet<string>>, right: ReadonlyMap<string, ReadonlySet<string>>): boolean {
  if (left.size !== right.size) return false
  for (const [cardId, modules] of left) {
    const other = right.get(cardId)
    if (other === undefined || other.size !== modules.size) return false
    for (const moduleId of modules) if (!other.has(moduleId)) return false
  }
  return true
}

function addModules(cards: Map<string, Set<string>>, cardId: string, moduleIds: readonly string[]): void {
  const modules = cards.get(cardId) ?? new Set<string>()
  for (const moduleId of moduleIds) modules.add(moduleId)
  cards.set(cardId, modules)
}

/**
 * Follow one Session's tool calls and publish the cards/modules being written.
 * @param sessions - the Client sessions service (retained while subscribers exist).
 * @param sessionId - the canvas owner whose tool calls drive the shimmer.
 * @returns snapshot source for the canvas provider.
 */
export function aiEditsSource(sessions: ISessions, sessionId: SessionId): ObservableSnapshot<AiEditsSnapshot> {
  let snapshot = EMPTY_AI_EDITS
  const listeners = new Set<() => void>()
  let started = false
  let ref: SessionReference | undefined
  let disposeFeed: (() => void) | undefined
  let disposeRetry: (() => void) | undefined
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  /** callId → edit in flight. */
  const pending = new Map<string, PendingEdit>()
  /** cardId → trailing hold after its last result. */
  const held = new Map<string, HeldEdit>()

  const build = (): AiEditsSnapshot => {
    const now = Date.now()
    const cards = new Map<string, Set<string>>()
    for (const edit of pending.values()) addModules(cards, edit.cardId, edit.moduleIds)
    for (const [cardId, edit] of held) {
      if (edit.until > now) addModules(cards, cardId, edit.moduleIds)
    }
    return { cards }
  }

  const publish = (): void => {
    const next = build()
    if (sameCards(snapshot.cards, next.cards)) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  const scheduleHolds = (): void => {
    if (holdTimer !== undefined) clearTimeout(holdTimer)
    holdTimer = undefined
    let next = Number.POSITIVE_INFINITY
    for (const edit of held.values()) next = Math.min(next, edit.until)
    if (next === Number.POSITIVE_INFINITY) return
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      const now = Date.now()
      for (const [cardId, edit] of held) if (edit.until <= now) held.delete(cardId)
      publish()
      scheduleHolds()
    }, Math.max(0, next - Date.now()))
  }

  const settle = (callId: string): void => {
    const edit = pending.get(callId)
    if (edit === undefined) return
    pending.delete(callId)
    const moduleIds = new Set(edit.moduleIds)
    for (const other of pending.values()) {
      if (other.cardId === edit.cardId) for (const moduleId of other.moduleIds) moduleIds.add(moduleId)
    }
    held.set(edit.cardId, {
      cardId: edit.cardId,
      moduleIds: [...moduleIds],
      until: Math.max(Date.now(), edit.startedAt + HOLD_MS),
    })
    scheduleHolds()
    publish()
  }

  const live = (event: SessionEventLike): void => {
    if (event.type === 'tool/call') {
      const target = editTarget(event.data.name, event.data.arguments)
      if (target === undefined) return
      held.delete(target.cardId)
      pending.set(String(event.data.callId), { ...target, startedAt: Date.now() })
      publish()
      return
    }
    if (event.type === 'tool/result') {
      settle(String(event.data.message.source.callId))
      return
    }
    if (event.type === 'turn/end' && pending.size > 0) {
      pending.clear()
      publish()
    }
  }

  /** Rebuild from a replaced window; no holds — those only come from live results. */
  const scan = (entries: readonly SessionEventLikeEntry[]): void => {
    pending.clear()
    held.clear()
    if (holdTimer !== undefined) clearTimeout(holdTimer)
    holdTimer = undefined
    const active = new Map<string, PendingEdit>()
    for (const entry of entries) {
      if (entry.type !== 'event') continue
      const event = entry.event
      if (event.type === 'tool/call') {
        const target = editTarget(event.data.name, event.data.arguments)
        if (target !== undefined) active.set(String(event.data.callId), { ...target, startedAt: Date.now() })
      } else if (event.type === 'tool/result') {
        active.delete(String(event.data.message.source.callId))
      } else if (event.type === 'turn/end') {
        active.clear()
      }
    }
    for (const [callId, edit] of active) pending.set(callId, edit)
    publish()
  }

  const feed = (): void => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    const source = binding.eventSource
    const { change } = source.getSnapshot()
    if (change.kind === 'replace') scan(source.getSnapshot().entries)
    else if (change.kind === 'append') {
      for (const entry of change.entries) if (entry.type === 'event') live(entry.event)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) {
        started = true
        const tryBind = (): void => {
          if (disposeFeed !== undefined) return
          // Subscribers retain their own reference: binding() alone does not
          // extend the Session's life, and an unretained binding freezes.
          try {
            ref = sessions.retain(sessionId, { source: 'novenShell' })
          } catch {
            // A Session that is not addressable yet; the list subscription retries.
            return
          }
          disposeFeed = ref.binding.eventSource.subscribe(feed)
          scan(ref.binding.eventSource.getSnapshot().entries)
        }
        tryBind()
        disposeRetry = sessions.list.subscribe(tryBind)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        disposeFeed?.()
        disposeFeed = undefined
        disposeRetry?.()
        disposeRetry = undefined
        ref?.release()
        ref = undefined
        if (holdTimer !== undefined) clearTimeout(holdTimer)
        holdTimer = undefined
        pending.clear()
        held.clear()
        started = false
      }
    },
  }
}
