/** Read-only product presentation consumed by the frame instead of Session geometry. */
import type { CanvasSide } from './arrangement.ts'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { LayoutState } from './stores.ts'

/** Which stable frame column is the product's primary work area. */
export type FrameLayoutPrimary = 'main' | 'rightbar'

/** Product-owned presentation; the frame executes it without persisting a second mode. */
export interface FrameLayoutPolicy {
  /** `main` places Conversation at the center; `rightbar` places Canvas there. */
  readonly primary: FrameLayoutPrimary
  /** Effective Canvas side inside its unit, independent of the surface's saved preference. */
  readonly canvasSide: CanvasSide
  /** Mount the fixed application topbar and its composition slots; defaults to true under a policy. */
  readonly topbar?: boolean
  /** Render the legacy right-side drawer and reserve its track; defaults to true. */
  readonly drawer?: boolean
}

/** The single global auxiliary fold; it follows the auxiliary content across product modes. */
export interface FrameFoldState {
  /** @deprecated Compatibility projection of `auxiliaryCollapsed`, not independent state. */
  readonly centerCollapsed: boolean
  /** True folds the auxiliary region in either product arrangement. */
  readonly auxiliaryCollapsed: boolean
}

/**
 * Publish one stable fold snapshot and notify every subscriber on each actual change.
 * @param source - Layout store snapshot and subscription.
 * @returns the shared fold observable.
 */
export function createFrameFoldState(source: {
  getSnapshot(): LayoutState
  subscribe(listener: () => void): () => void
}): HostObservable<FrameFoldState> {
  let snapshot = {
    centerCollapsed: source.getSnapshot().layoutInfo.auxiliaryCollapsed,
    auxiliaryCollapsed: source.getSnapshot().layoutInfo.auxiliaryCollapsed,
  }
  const listeners = new Set<() => void>()
  const publish = (): void => {
    const { auxiliaryCollapsed } = source.getSnapshot().layoutInfo
    if (snapshot.auxiliaryCollapsed === auxiliaryCollapsed) return
    snapshot = { centerCollapsed: auxiliaryCollapsed, auxiliaryCollapsed }
    for (const listener of [...listeners]) listener()
  }
  source.subscribe(publish)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
