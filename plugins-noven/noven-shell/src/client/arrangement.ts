/** Noven's single workbench subject and its derived mode/frame projection. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { FrameLayoutPolicy } from '@deepseek-ai/dsh-client-ui-layout/client'

/** Labels for the subject currently occupying the centre region. */
export type NovenMode = 'agent' | 'ide'

/** The centre is always exactly one of the two workbench subjects. */
export type NovenSubject = 'conversation' | 'canvas'

const AGENT_POLICY: FrameLayoutPolicy = { primary: 'main', canvasSide: 'right', drawer: false, foldMode: 'shared' }
const IDE_POLICY: FrameLayoutPolicy = { primary: 'rightbar', canvasSide: 'right', drawer: false, foldMode: 'shared' }

/**
 * Project the subject into the user-facing mode label.
 * @param subject - which workbench subject currently owns the centre region.
 * @returns The Agent/IDE label.
 */
export function modeOfSubject(subject: NovenSubject): NovenMode {
  return subject === 'canvas' ? 'ide' : 'agent'
}

/**
 * Map a requested mode label back to the subject it names.
 * @param mode - the Agent/IDE label.
 * @returns The corresponding workbench subject.
 */
export function subjectOfMode(mode: NovenMode): NovenSubject {
  return mode === 'ide' ? 'canvas' : 'conversation'
}

/**
 * Project the workbench subject into geometry without giving the frame a second writable mode.
 * @param subject - which workbench subject currently owns the centre region.
 * @returns Stable read-only geometry for the frame.
 */
export function frameLayoutPolicy(subject: NovenSubject): FrameLayoutPolicy {
  return subject === 'canvas' ? IDE_POLICY : AGENT_POLICY
}

/**
 * Create the application-wide workbench subject store; the topbar switch is its
 * only writer. There is no independent mode store to drift from it.
 * @returns The global subject store with validated persistence.
 */
export function createNovenSubjectStore() {
  const handle = defineStore({
    persist: 'noven.shell.subject.v1',
    init: () => ({ subject: 'conversation' as NovenSubject }),
    actions: {
      setSubject: (draft, subject: NovenSubject) => {
        if (draft.subject !== subject) draft.subject = subject
      },
    },
  })
  return {
    ...handle,
    create() {
      const instance = handle.create()
      const persisted = instance.getSnapshot().subject
      if (persisted !== 'conversation' && persisted !== 'canvas') {
        instance.actions.setSubject('conversation')
      }
      return instance
    },
  }
}
