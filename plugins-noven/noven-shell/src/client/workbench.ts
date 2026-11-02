/** Shared editor and canvas preferences used by the global settings surface and workbench hosts. */
import { defineStore } from '@deepseek-ai/dsh-client-store'

/** Persisted workbench preferences shared by every workspace and mode. */
export interface NovenWorkbenchSettings {
  autoSave: boolean
  restoreCanvas: boolean
  lineNumbers: boolean
}

/**
 * Create the application-wide workbench preference store with validated persistence.
 * @returns The store shared by settings, editors, and canvas restoration.
 */
export function createNovenWorkbenchStore() {
  const handle = defineStore({
    persist: 'noven.shell.workbench.v1',
    init: (): NovenWorkbenchSettings => ({ autoSave: true, restoreCanvas: true, lineNumbers: false }),
    actions: {
      setAutoSave: (draft, value: boolean) => { draft.autoSave = value },
      setRestoreCanvas: (draft, value: boolean) => { draft.restoreCanvas = value },
      setLineNumbers: (draft, value: boolean) => { draft.lineNumbers = value },
    },
  })
  return {
    ...handle,
    create() {
      const instance = handle.create()
      const persisted = instance.getSnapshot()
      if (typeof persisted.autoSave !== 'boolean') instance.actions.setAutoSave(true)
      if (typeof persisted.restoreCanvas !== 'boolean') instance.actions.setRestoreCanvas(true)
      if (typeof persisted.lineNumbers !== 'boolean') instance.actions.setLineNumbers(false)
      return instance
    },
  }
}
