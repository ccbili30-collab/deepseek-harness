/**
 * Warm-layer retention (设计理念 §14): once an object has been shown, it never
 * falls back to a loading state. Entering a view renders the last snapshot
 * first, refreshes in the background, and swaps in only what changed.
 *
 * - {@link cardCache} / {@link useRetainedCard}: card states keyed by card
 *   address + id, shared by the canvas card page and the reading preview.
 * - {@link useRetainedScroll}: scroll offsets keyed by an owner-chosen key
 *   (session × tab), restored when the scroller remounts.
 *
 * Both stores are module-level and in-memory: they survive unmount, tab
 * switches, and session switches, and reset on a full page reload.
 * @module noven-shell/client/ui/retain
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { CardAddr, CardState } from '../card-api.ts'
import { cardCache, cardKey } from './card-store.ts'
export { cardCache, cardKey } from './card-store.ts'

// ── card snapshots ─────────────────────────────────────────────────────────

/** What {@link useRetainedCard} hands to a card view. */
export interface RetainedCard {
  /** Snapshot to render: last known state, `'loading'` only for a never-seen card, undefined when missing. */
  readonly state: CardState | 'loading' | undefined
  /** Read failure, distinct from confirmed absence. */
  readonly error: Error | undefined
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
  const seed = (): CardState | 'loading' | undefined => {
    if (addr === null || cardId === undefined || key === undefined) return undefined
    // Cold layer first after a reload: render the persisted document on the
    // first paint, then the background refresh silently replaces it.
    return cardCache.get(addr, cardId) ?? 'loading'
  }
  const [state, setLocal] = useState<CardState | 'loading' | undefined>(seed)
  const [error, setError] = useState<Error | undefined>(undefined)
  const seenKey = useRef(key)
  const live = useRef(false)
  const request = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const refresh = useCallback(async (): Promise<CardState | undefined> => {
    if (addr === null || cardId === undefined) return undefined
    const attempt = ++request.current
    try {
      const next = await cardCache.refresh(addr, cardId, loadRef.current)
      if (live.current && request.current === attempt && seenKey.current === key) setError(undefined)
      return next
    } catch (reason: unknown) {
      if (live.current && request.current === attempt && seenKey.current === key) {
        setError(reason instanceof Error ? reason : new Error(String(reason)))
        setLocal(cardCache.get(addr, cardId))
      }
      return cardCache.get(addr, cardId)
    }
  }, [addr?.root, addr?.sessionId, cardId, key])

  // Re-seed synchronously when the card changes, so the first paint of the new
  // card is its snapshot rather than the previous card or a loading flash.
  if (seenKey.current !== key) {
    seenKey.current = key
    const next = seed()
    if (next !== state) setLocal(next)
    setError(undefined)
  }

  useEffect(() => {
    if (key === undefined) return
    if (addr === null || cardId === undefined) return
    live.current = true
    const unsubscribe = cardCache.subscribe(addr, cardId, setLocal)
    void refresh()
    return () => { live.current = false; unsubscribe() }
  }, [key, refresh])

  const setState = useCallback((next: CardState | undefined) => {
    if (addr === null || cardId === undefined) { setLocal(next); return }
    cardCache.put(addr, cardId, next)
  }, [addr?.root, addr?.sessionId, cardId])

  return { state, error, setState, refresh }
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
