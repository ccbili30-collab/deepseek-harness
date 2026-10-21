/**
 * Ephemeral timeline ↔ map focus. This is view state, not card data: one
 * selected map marker drives the timeline filter, and one event place opens
 * the map at that marker.
 * @module noven-shell/client/place-link
 */
import { useSyncExternalStore } from 'react'

export interface PlaceFocus {
  readonly cardId?: string
  readonly mapModuleId: string
  readonly markerId: string
  readonly label?: string
  /** Origin collection when a geography entry opens the map. */
  readonly sourceModuleId?: string
  readonly sourceModuleName?: string
  readonly sourceItemId?: string
  readonly sourceItemName?: string
}

let current: PlaceFocus | undefined
const listeners = new Set<() => void>()

/** Publish the current place focus and notify subscribers. */
export function setPlaceFocus(focus: PlaceFocus): void {
  current = focus
  for (const listener of listeners) listener()
}

/** Clear the current place focus. */
export function clearPlaceFocus(): void {
  if (current === undefined) return
  current = undefined
  for (const listener of listeners) listener()
}

/** Latest focus snapshot for imperative reads. */
export function getPlaceFocus(): PlaceFocus | undefined {
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Subscribe a component to the current place focus. */
export function usePlaceFocus(): PlaceFocus | undefined {
  return useSyncExternalStore(subscribe, getPlaceFocus, getPlaceFocus)
}
