/**
 * Retained document, directory and tab snapshots.
 * @module noven-shell/client/ui/keyed-cache
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** @returns Snapshot source with reads fenced against later operations. */
export function keyedCache<T>(): {
  readonly snapshot: ObservableSnapshot<Readonly<Record<string, T>>>
  readonly get: (key: string) => T | undefined
  readonly put: (key: string, value: T) => void
  readonly refresh: (key: string, load: () => Promise<T>) => Promise<void>
} {
  let state: Readonly<Record<string, T>> = {}
  const generations = new Map<string, number>()
  const listeners = new Set<() => void>()
  const publish = (key: string, value: T): void => {
    if (state[key] === value) return
    state = { ...state, [key]: value }
    for (const listener of listeners) listener()
  }
  return {
    snapshot: {
      getSnapshot: () => state,
      subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    get: key => state[key],
    put: (key, value) => {
      generations.set(key, (generations.get(key) ?? 0) + 1)
      publish(key, value)
    },
    refresh: async (key, load) => {
      const generation = (generations.get(key) ?? 0) + 1
      generations.set(key, generation)
      const value = await load()
      if (generations.get(key) === generation) publish(key, value)
    },
  }
}
