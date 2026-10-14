/**
 * Warm-layer retention (设计理念 §14): once an object has been shown, it never
 * falls back to a loading state. Entering a view renders the last snapshot
 * first, refreshes in the background, and swaps in only what changed.
 *
 * - {@link cardCache} / {@link useRetainedCard}: card states keyed by card
 *   address + id, shared by the canvas card page, CardStudio and CardEditor.
 * - {@link useRetainedScroll}: scroll offsets keyed by an owner-chosen key
 *   (session × tab), restored when the scroller remounts.
 *
 * Both stores are module-level and in-memory: they survive unmount, tab
 * switches, and session switches, and reset on a full page reload.
 * @module noven-shell/client/ui/retain
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { CardAddr, CardState } from '../card-api.ts'

// ── card snapshots ─────────────────────────────────────────────────────────

const cards = new Map<string, CardState>()
const cardListeners = new Map<string, Set<(state: CardState | undefined) => void>>()

/** Cache key for one card; the project root wins over the session so two sessions of one project share it. */
export function cardKey(addr: CardAddr, cardId: string): string {
  return `${addr.root ?? `session:${addr.sessionId ?? ''}`}::${cardId}`
}

/** Module-level card snapshot store. */
export const cardCache = {
  /**
   * Last known state of a card.
   * @param addr - card address (project root or session).
   * @param cardId - card id.
   * @returns the snapshot, or undefined when the card was never loaded.
   */
  get(addr: CardAddr, cardId: string): CardState | undefined {
    return cards.get(cardKey(addr, cardId))
  },
  /**
   * Record a fresh state (or forget the card with undefined) and notify views showing it.
   * @param addr - card address.
   * @param cardId - card id.
   * @param state - new snapshot; undefined when the card no longer exists.
   */
  put(addr: CardAddr, cardId: string, state: CardState | undefined): void {
    const key = cardKey(addr, cardId)
    if (state === undefined) cards.delete(key)
    else cards.set(key, state)
    for (const listener of cardListeners.get(key) ?? []) listener(state)
  },
}

/** What {@link useRetainedCard} hands to a card view. */
export interface RetainedCard {
  /** Snapshot to render: last known state, `'loading'` only for a never-seen card, undefined when missing. */
  readonly state: CardState | 'loading' | undefined
  /** Replace the view's state locally (optimistic paths) and record it in the cache. */
  readonly setState: (next: CardState | undefined) => void
  /** Refetch now; resolves with the fresh state and records it. */
  readonly refresh: () => Promise<CardState | undefined>
}

/**
 * Card state with stale-while-revalidate semantics: mounting a card seen
 * before renders its snapshot at once and refreshes in the background.
 * @param addr - card address, or null when no card is selected.
 * @param cardId - card id, or undefined when no card is selected.
 * @param load - the fetcher (`loadCard`).
 * @returns the state, a local setter, and a refresh handle.
 */
export function useRetainedCard(
  addr: CardAddr | null,
  cardId: string | undefined,
  load: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>,
): RetainedCard {
  const key = addr === null || cardId === undefined ? undefined : cardKey(addr, cardId)
  const seed = (): CardState | 'loading' | undefined =>
    addr === null || cardId === undefined ? undefined : cardCache.get(addr, cardId) ?? 'loading'
  const [state, setLocal] = useState<CardState | 'loading' | undefined>(seed)
  const addrRef = useRef(addr)
  addrRef.current = addr
  const loadRef = useRef(load)
  loadRef.current = load

  const refresh = useCallback(async (): Promise<CardState | undefined> => {
    const target = addrRef.current
    if (target === null || cardId === undefined) return undefined
    const next = await loadRef.current(target, cardId)
    // 取数失败（网络/会话休眠）与「卡没了」在 fetchCard 里同为 undefined——
    // 有快照时不让一次失败把屏清空；卡真被删的路径由删除方显式 put(undefined)。
    if (next === undefined && cardCache.get(target, cardId) !== undefined) return cardCache.get(target, cardId)
    cardCache.put(target, cardId, next)
    return next
  }, [cardId, key])

  // Re-seed synchronously when the card changes, so the first paint of the new
  // card is its snapshot rather than the previous card or a loading flash.
  const seenKey = useRef(key)
  if (seenKey.current !== key) {
    seenKey.current = key
    const next = seed()
    if (next !== state) setLocal(next)
  }

  useEffect(() => {
    if (key === undefined) return
    const listeners = cardListeners.get(key) ?? new Set()
    cardListeners.set(key, listeners)
    const listener = (next: CardState | undefined): void => { setLocal(next) }
    listeners.add(listener)
    void refresh()
    return () => { listeners.delete(listener) }
  }, [key, refresh])

  const setState = useCallback((next: CardState | undefined) => {
    const target = addrRef.current
    if (target === null || cardId === undefined) { setLocal(next); return }
    cardCache.put(target, cardId, next)
  }, [cardId])

  return { state, setState, refresh }
}

// ── scroll memory ──────────────────────────────────────────────────────────

const scrolls = new Map<string, number>()

/**
 * Keep a scroller's offset across unmounts: restored before paint when the
 * element remounts under the same key, recorded on every scroll.
 * @param ref - the scrolling element.
 * @param key - retention key (e.g. `${sessionId}|${tabKey}`); undefined disables retention.
 * @param ready - restore only once content is there (a snapshot rendered); defaults to true.
 */
export function useRetainedScroll(ref: RefObject<HTMLElement | null>, key: string | undefined, ready = true): void {
  const restored = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null || key === undefined || !ready || restored.current === key) return
    restored.current = key
    const top = scrolls.get(key)
    if (top !== undefined) el.scrollTop = top
  }, [key, ready, ref])
  useEffect(() => {
    const el = ref.current
    if (el === null || key === undefined) return
    const record = (): void => { scrolls.set(key, el.scrollTop) }
    el.addEventListener('scroll', record, { passive: true })
    return () => { el.removeEventListener('scroll', record) }
  }, [key, ref])
}
