/**
 * Settings developer mode: an explicit, persisted unlock for product-internal
 * sections. It has no visible affordance; the settings title enables it after
 * ten rapid clicks.
 */

/** Persisted flag; separate from the configuration document on purpose. */
export const DEVELOPER_MODE_STORAGE_KEY = 'dsh.settings.developer-mode.v1'

/** Observable unlock state. */
export interface SettingsDeveloperMode {
  getSnapshot(): boolean
  subscribe(listener: () => void): () => void
  /** Persist and publish the unlock; repeated calls are no-ops. */
  enable(): void
}

/**
 * Create the developer-mode store.
 * @param storage - local storage to persist the flag; absent for a throwaway store.
 * @returns the observable store.
 */
export function createSettingsDeveloperMode(storage?: Pick<Storage, 'getItem' | 'setItem'>): SettingsDeveloperMode {
  let enabled = false
  try {
    enabled = storage?.getItem(DEVELOPER_MODE_STORAGE_KEY) === '1'
  } catch { /* private mode / disabled storage: the unlock lives for this page only */ }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => enabled,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    enable: () => {
      if (enabled) return
      enabled = true
      try {
        storage?.setItem(DEVELOPER_MODE_STORAGE_KEY, '1')
      } catch { /* the in-memory unlock still holds for this page */ }
      for (const listener of listeners) listener()
    },
  }
}

/** Hidden-section policy a host may provide to the settings shell. */
export interface SettingsSectionPolicy {
  /** Section ids the nav must omit. */
  getHidden(): ReadonlySet<string>
  subscribe(listener: () => void): () => void
}
