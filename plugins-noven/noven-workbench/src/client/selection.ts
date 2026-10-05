/**
 * The workbench selection shared by the drawer navigation and the 创作空间
 * main panel. Module-level on purpose: the two live in different slot
 * components with no common owner. Keyed by session — sessions in different
 * workspaces hold unrelated registries, so a global selection would stage
 * one session's workbench onto another's navigation. The selection is
 * session-scoped UI state, not project data — it never touches `.noven/`.
 * @module noven-workbench/client/selection
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

const bySession = new Map<string, string>()
const listeners = new Set<() => void>()

const notify = (): void => {
  for (const listener of listeners) listener()
}

/** The launcher/panel shared selection, per session. */
export const workbenchSelection = {
  /** The session's selected workbench id, or null when nothing is selected yet. */
  get: (sessionId: SessionId | undefined): string | null =>
    sessionId === undefined ? null : bySession.get(sessionId) ?? null,
  /** Select a workbench for a session and notify both ends. */
  set(sessionId: SessionId, id: string): void {
    if (bySession.get(sessionId) === id) return
    bySession.set(sessionId, id)
    notify()
  },
  /** Subscribe to selection changes; returns the disposer. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
