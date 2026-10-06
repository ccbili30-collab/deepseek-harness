/**
 * Work-mode stage state: each workbench's in-canvas view (segment, staged
 * file), kept per workbench so collapsing and reopening restores it. The
 * canvas itself is the sidebar's floating-pane surface — opening, closing,
 * and parking live there; this store holds only what the stage renders.
 * Like selection.ts this is session UI state and never touches `.noven/`.
 * @module noven-workbench/client/stage
 */

/** The canvas's three top segments (设计稿 06b: 首页 / 展览 / 文件). */
export type StageMode = 'home' | 'exhibition' | 'files'

/** One workbench's in-canvas view, kept per workbench so 收起/重进 restores it. */
export interface StageView {
  /** Which top segment is active. */
  readonly mode: StageMode
  /** The staged workspace-relative file; null renders the workbench's home. */
  readonly selected: string | null
  /** 设计稿 06d：资源树钉住时收成画布右缘的窄列，否则只从面包屑尾巴展开浮层。 */
  readonly pinned: boolean
}

/** Cross-plugin open trigger: noven-shell dispatches it, this plugin listens. */
export const STAGE_OPEN_EVENT = 'noven:workbench-stage'

/** The workbench's canvas kind on the sidebar's surface stack. */
export const WORKBENCH_KIND = 'noven.workbench'

const EMPTY_VIEW: StageView = { mode: 'home', selected: null, pinned: false }
const views = new Map<string, StageView>()
let version = 0
const listeners = new Set<() => void>()

const notify = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

/** The stage's shared store; `getSnapshot` feeds useSyncExternalStore. */
export const workbenchStage = {
  /** Monotonic change counter — the external-store snapshot. */
  getSnapshot: (): number => version,
  /** One workbench's in-canvas view; the default row is stable and cached. */
  view(workbenchId: string): StageView {
    let view = views.get(workbenchId)
    if (view === undefined) { view = EMPTY_VIEW; views.set(workbenchId, view) }
    return view
  },
  /** Merge one workbench's in-canvas view; listeners re-render. */
  patch(workbenchId: string, next: Partial<StageView>): void {
    views.set(workbenchId, { ...workbenchStage.view(workbenchId), ...next })
    notify()
  },
  /** Subscribe to every state change; returns the disposer. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
