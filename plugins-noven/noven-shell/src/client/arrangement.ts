/** Noven's single product mode and its read-only frame projection. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { FrameLayoutPolicy } from '@deepseek-ai/dsh-client-ui-layout/client'

/** The only two outer layouts; Session and Canvas state never select one. */
export type NovenMode = 'agent' | 'ide'

const AGENT_POLICY: FrameLayoutPolicy = { primary: 'main', canvasSide: 'right' }
const IDE_POLICY: FrameLayoutPolicy = { primary: 'rightbar', canvasSide: 'right' }

/**
 * Project the product mode into geometry without giving the frame a second writable mode.
 * @param mode - Noven's only outer page mode.
 * @returns Stable read-only geometry for the frame.
 */
export function frameLayoutPolicy(mode: NovenMode): FrameLayoutPolicy {
  return mode === 'ide' ? IDE_POLICY : AGENT_POLICY
}

/**
 * Create the application-wide mode store; the fixed mode button is its only writer.
 * @returns The global mode store with validated persistence.
 */
export function createNovenModeStore() {
  const handle = defineStore({
    persist: 'noven.shell.mode.v1',
    init: () => ({ mode: 'agent' as NovenMode }),
    actions: {
      setMode: (draft, mode: NovenMode) => {
        if (draft.mode !== mode) draft.mode = mode
      },
    },
  })
  return {
    ...handle,
    create() {
      const instance = handle.create()
      const persisted = instance.getSnapshot().mode
      if (persisted !== 'agent' && persisted !== 'ide') instance.actions.setMode('agent')
      return instance
    },
  }
}
