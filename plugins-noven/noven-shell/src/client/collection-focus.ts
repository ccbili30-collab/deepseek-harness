/** Ephemeral collection-item focus used by map backlinks; view state only. */
import { useSyncExternalStore } from 'react'

export interface CollectionFocus {
  readonly cardId?: string
  readonly moduleId: string
  readonly itemId: string
}

let current: CollectionFocus | undefined
const listeners = new Set<() => void>()

/** Publish an item focus and notify collection views. */
export function setCollectionFocus(focus: CollectionFocus): void {
  current = focus
  for (const listener of listeners) listener()
}

/** Consume the item focus (after opening its detail). */
export function clearCollectionFocus(): void {
  if (current === undefined) return
  current = undefined
  for (const listener of listeners) listener()
}

/** Latest focus snapshot. */
export function getCollectionFocus(): CollectionFocus | undefined {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Subscribe a collection view to the current item focus. */
export function useCollectionFocus(): CollectionFocus | undefined {
  return useSyncExternalStore(subscribe, getCollectionFocus, getCollectionFocus)
}
