/** Ephemeral module-to-module link focus: target pages show a source backlink. */
import { useSyncExternalStore } from 'react'

export interface ModuleLinkFocus {
  readonly cardId?: string
  readonly targetModuleId: string
  readonly sourceModuleId: string
  readonly sourceModuleName: string
}

let current: ModuleLinkFocus | undefined
const listeners = new Set<() => void>()

/** Publish a module-link focus. */
export function setModuleLinkFocus(focus: ModuleLinkFocus): void {
  current = focus
  for (const listener of listeners) listener()
}

/** Clear the module-link focus. */
export function clearModuleLinkFocus(): void {
  if (current === undefined) return
  current = undefined
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Subscribe a target module to its source backlink. */
export function useModuleLinkFocus(): ModuleLinkFocus | undefined {
  return useSyncExternalStore(subscribe, () => current, () => current)
}
