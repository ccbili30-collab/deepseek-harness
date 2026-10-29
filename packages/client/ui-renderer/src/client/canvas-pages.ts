/** Host-owned canvas page kinds contributed by feature plugins. */
import type { ComponentType } from 'react'

/** Props every canvas page component receives from the shell that renders it. */
export interface CanvasPageProps {
  /** Session whose work surface hosts the page. */
  readonly sessionId: string
  /** Stable identity of this page occurrence (survives a reload). */
  readonly pageKey: string
  /** Whether this page's tab is the one shown in its leaf; inactive pages stay mounted. */
  readonly active: boolean
  /** Close this page's canvas tab. */
  readonly close: () => void
  /** Open another page of the named kind beside this one. */
  readonly openPage: (kind: string) => void
}

/** One page kind a feature plugin contributes to every canvas surface. */
export interface CanvasPageDefinition {
  /** Stable kind, also the sidebar tab kind when the feature has one. */
  readonly kind: string
  /** Title shown on the canvas tab. */
  readonly title: () => string
  /** Page body; the shell supplies session identity and navigation. */
  readonly component: ComponentType<CanvasPageProps>
}

/** Host seam for canvas page contributions. */
export interface CanvasPages {
  /**
   * Register one page kind.
   * @param definition - page kind, title, and component.
   * @returns disposer removing the registration.
   */
  register(definition: CanvasPageDefinition): () => void
  /**
   * Look up one registered page kind.
   * @param kind - page kind.
   * @returns the definition, when registered.
   */
  get(kind: string): CanvasPageDefinition | undefined
  /**
   * Snapshot of registered page kinds.
   * @returns definitions in registration order.
   */
  list(): readonly CanvasPageDefinition[]
  /**
   * Subscribe to registration changes.
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void
}

/** Create one host-owned page registry.
 * @returns the empty page registry with registration and subscription actions.
 */
export function createCanvasPages(): CanvasPages {
  const entries = new Map<string, CanvasPageDefinition>()
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  return {
    register(definition) {
      entries.set(definition.kind, definition)
      notify()
      return () => {
        if (entries.get(definition.kind) !== definition) return
        entries.delete(definition.kind)
        notify()
      }
    },
    get: kind => entries.get(kind),
    list: () => [...entries.values()],
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
