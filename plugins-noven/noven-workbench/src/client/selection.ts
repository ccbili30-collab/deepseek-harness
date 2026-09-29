/**
 * The workbench selection shared by the sidebar launcher and the 创作空间
 * main panel. Module-level on purpose: the two live in different slot
 * components with no common owner, and the selection is session-scoped UI
 * state, not project data — it never touches `.noven/`.
 * @module noven-workbench/client/selection
 */

let current: string | null = null
const listeners = new Set<() => void>()

/** The launcher/panel shared selection. */
export const workbenchSelection = {
  /** The selected workbench id, or null when nothing is selected yet. */
  get: (): string | null => current,
  /** Select a workbench and notify both ends. */
  set(id: string): void {
    current = id
    for (const listener of listeners) listener()
  },
  /** Subscribe to selection changes; returns the disposer. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
