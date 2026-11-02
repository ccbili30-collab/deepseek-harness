/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry and main-panel selection live in the root layout store;
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (main-panel selection and sidebar toggle,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, shared with the root registration.
 */
import type { BoundActions, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CanvasSide, UnitSide } from './arrangement.ts'
import type { FrameLayoutPolicy } from './policy.ts'
import type { SessionGeometry, SessionGeometryRecord, createLayoutStore } from './stores.ts'

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
export type MainPanelId = Branded<'MainPanelId'>

/** One atomic product-layout commit coordinated by the mounted frame. */
export type FrameTransition = (commit: () => void) => void

/** Root-scoped navigation state exposed to panel-aware components. */
export interface PanelInfo {
  /** Selected global panel; null displays the current Conversation. */
  readonly activePanelId: MainPanelId | null
}

/** Live structural geometry of the visible session, mirrored from the layout store. */
export type LiveSessionGeometry = SessionGeometry & {
  /** Session id the geometry belongs to; null before the first session lands. */
  readonly active: string | null
  /** The per-session structural records; readers judge a target session's arrangement without racing the visible-session swap. */
  readonly byId: Readonly<Record<string, SessionGeometryRecord>>
}

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The canvas-claim source the unit column's occupant provides. A claim is
 * derivable surface state — the frame pulls it, so it can never go stale the
 * way a pushed report can (a retained surface reactivating with its canvas
 * open needs no report to be counted).
 */
export interface CanvasClaimSource {
  /**
   * Which side of the drawer the session's open canvas composes on.
   * @param sessionId - the session whose surface is asked about.
   * @param includeParked - true to report a folded Canvas that still has content.
   * @returns the side, or null while the session has no open canvas.
   */
  claim(sessionId: string | null, includeParked?: boolean): CanvasSide | null
  /** Notify that claims may have changed; listeners re-read `claim`. */
  subscribe(listener: () => void): () => void
}

/** The frame's canvas-claim seam: the occupant provides the source, the frame pulls. */
export interface CanvasClaims {
  /** Attach (or replace) the claim source; returns the detach disposer. */
  provide(source: CanvasClaimSource): () => void
  /** The session's current claim, or null with no source attached or no claim. */
  claim(sessionId: string | null, includeParked?: boolean): CanvasSide | null
  /** Subscribe to claim changes. */
  subscribe(listener: () => void): () => void
}

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface ILayout {
  /** Selected central panel from the same root store used by `usePanelInfo`. */
  readonly panelInfo: HostObservable<PanelInfo>
  /** Live structural geometry of the visible session (nav fold and unit side). */
  readonly sessionGeometry: HostObservable<LiveSessionGeometry>
  /** Optional product presentation; null executes the legacy Session geometry. */
  readonly frameLayoutPolicy: HostObservable<FrameLayoutPolicy | null>
  /**
   * Replace the read-only product presentation provider; disposal restores legacy geometry.
   * @param source - Product presentation to mirror.
   * @returns Disposer for this provider.
   */
  provideFrameLayoutPolicy(source: HostObservable<FrameLayoutPolicy>): () => void
  /**
   * The unit column's canvas claims. The right column's occupant provides the
   * source; the frame derives the canvas track by pulling the current
   * session's claim on every render.
   */
  readonly canvasClaims: CanvasClaims
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /**
   * Set the sidebar's collapsed presentation without flipping an already-correct state.
   * @param collapsed - true for the rail/hidden presentation, false for the wide column.
   */
  setSidebarCollapsed(collapsed: boolean): void
  /**
   * Report the right panel's presentation without changing its expanded state.
   * The canvas claim is not part of the report: it is pulled through
   * {@link ILayout.canvasClaims}.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   * @param rail - whether the shown panel stands collapsed to its icon rail;
   *   the track then holds the rail width instead of the panel preference.
   */
  openRightbar(track: boolean, fullscreen: boolean, rail: boolean): void
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void
  /**
   * Move the navigation+canvas unit to a side of the conversation column —
   * the same structural preference the region-sort gesture flips, stamped to
   * the visible session's geometry record.
   * @param side - 'left' parks the unit against the sidebar; 'right' is the default scene.
   */
  setUnitSide(side: UnitSide): void
  /**
   * Fold or restore Conversation under an independent-fold policy. A shared-fold
   * product treats this as a compatibility alias for `setAuxiliaryCollapsed`.
   * @param collapsed - true to fold the center or shared auxiliary region, false to restore it.
   */
  setCenterCollapsed(collapsed: boolean): void
  /**
   * Fold or restore the auxiliary region without changing content or product mode.
   * @param collapsed - true to fold the auxiliary region, false to restore it.
   */
  setAuxiliaryCollapsed(collapsed: boolean): void
  /**
   * Stamp a structural seed onto one session's geometry record — the entry-path
   * write for named arrangements. A session that is already visible takes the
   * patch on screen; one that is not keeps its geometry until it loads.
   * @param sessionId - session the seed targets.
   * @param geometry - structural fields to stamp over the session's record.
   */
  seedSessionGeometry(sessionId: string, geometry: Partial<SessionGeometry>): void
  /**
   * Request an explicit canvas/conversation share; the frame resolves it once a
   * canvas claims the column and any later drag replaces it.
   * @param share - canvas fraction of the space left after the nav and drawer.
   */
  seedUnitShare(share: number): void
  /**
   * Compare two sessions' structural geometry where the stable furniture
   * reads it: a nav-fold or unit-side difference is a scene change.
   * @param from - outgoing session id.
   * @param to - incoming session id.
   * @returns true when the resolved nav collapse or the unit side differs.
   */
  navGeometryDiffers(from: string, to: string): boolean
  /**
   * Enter or leave the canvas-only presentation: the work layer collapses to
   * the right column so the canvas covers the frame. Transient view state —
   * never persisted; the product canvas owns its own Escape chain.
   * @param on - true to cover the frame, false to restore the recorded layout.
   */
  setCanvasFullscreen(on: boolean): void
  /**
   * Commit an explicit product-layout transition through the mounted frame.
   * @param commit - Synchronous state changes to coordinate.
   */
  transitionFrame(commit: () => void): void
  /**
   * Attach the mounted frame's transition runner.
   * @param runner - Measurement, commit, and animation coordinator.
   * @returns an effect-scoped unregister callback.
   */
  provideFrameTransition(runner: FrameTransition): () => void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  private navigation = new AbortController()
  private claimSource: CanvasClaimSource | undefined
  private policySource: HostObservable<FrameLayoutPolicy> | undefined
  private policyStop: (() => void) | undefined
  private policy: FrameLayoutPolicy | null = null
  private frameTransition: FrameTransition | undefined
  private readonly claimListeners = new Set<() => void>()
  private readonly policyListeners = new Set<() => void>()

  /** Always-present policy source; a product may replace its provider, never its hook identity. */
  readonly frameLayoutPolicy: HostObservable<FrameLayoutPolicy | null> = {
    getSnapshot: () => this.policy,
    subscribe: (listener) => {
      this.policyListeners.add(listener)
      return () => { this.policyListeners.delete(listener) }
    },
  }

  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   * @param panelInfo - root store's shared central-panel selection source.
   * @param sessionGeometry - root store's live session-structural source.
   * @param navGeometryDiffers - structural comparison over the shared instance's records.
   */
  constructor(
    private readonly panels: PanelActions,
    private readonly hasMainPanel: (id: MainPanelId) => boolean,
    readonly panelInfo: HostObservable<PanelInfo>,
    readonly sessionGeometry: HostObservable<LiveSessionGeometry>,
    private readonly navDiffers: (from: string, to: string) => boolean,
  ) {}

  /** Run through the mounted frame when present; otherwise preserve the plain synchronous commit. */
  transitionFrame(commit: () => void): void {
    if (this.frameTransition === undefined) { commit(); return }
    this.frameTransition(commit)
  }

  /** Attach one frame runner; a stale disposer cannot clear its replacement. */
  provideFrameTransition(runner: FrameTransition): () => void {
    this.frameTransition = runner
    return () => { if (this.frameTransition === runner) this.frameTransition = undefined }
  }

  /** The unit column's canvas-claim seam; relays the attached source's changes. */
  readonly canvasClaims: CanvasClaims = {
    provide: (source: CanvasClaimSource): (() => void) => {
      const relay = (): void => { for (const listener of this.claimListeners) listener() }
      this.claimSource = source
      const unsubscribe = source.subscribe(relay)
      relay()
      return () => {
        unsubscribe()
        if (this.claimSource === source) {
          this.claimSource = undefined
          relay()
        }
      }
    },
    claim: (sessionId: string | null, includeParked = false): CanvasSide | null =>
      this.claimSource?.claim(sessionId, includeParked) ?? null,
    subscribe: (listener: () => void): (() => void) => {
      this.claimListeners.add(listener)
      return () => { this.claimListeners.delete(listener) }
    },
  }

  /**
   * Attach a product policy without creating a second writable mode in the frame.
   * @param source - Read-only product presentation to mirror.
   * @returns Disposer that restores the legacy geometry when the provider leaves.
   */
  provideFrameLayoutPolicy(source: HostObservable<FrameLayoutPolicy>): () => void {
    const relay = (): void => {
      this.policy = source.getSnapshot()
      for (const listener of this.policyListeners) listener()
    }
    this.policyStop?.()
    this.policySource = source
    const unsubscribe = source.subscribe(relay)
    this.policyStop = unsubscribe
    relay()
    return () => {
      unsubscribe()
      if (this.policySource !== source) return
      this.policySource = undefined
      this.policyStop = undefined
      this.policy = null
      for (const listener of this.policyListeners) listener()
    }
  }

  /** Select a global panel or return to the Conversation. */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(`layout.selectPanel: main panel "${panelId}" is not registered`)
    }
    this.navigation.abort()
    this.panels.selectPanel(panelId)
  }

  /** @returns the new pending navigation's cancellation signal. */
  beginNavigation(): AbortSignal {
    this.navigation.abort()
    this.navigation = new AbortController()
    return this.navigation.signal
  }

  /** Invalidate pending navigations when the layout owner is unloaded. */
  dispose(): void {
    this.navigation.abort()
    this.frameTransition = undefined
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.panels.toggleSidebar()
  }

  /** Set the sidebar presentation idempotently. */
  setSidebarCollapsed(collapsed: boolean): void {
    this.panels.setSidebarCollapsed(collapsed)
  }

  /** Report the right panel's track, fullscreen presentation, and rail state. */
  openRightbar(track: boolean, fullscreen: boolean, rail: boolean): void {
    this.panels.openRightbar(track, fullscreen, rail)
  }

  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void {
    this.panels.closeRightbar()
  }

  /** Move the unit to the named side of the conversation; stamps the visible session. */
  setUnitSide(side: UnitSide): void {
    this.panels.setUnitSide(side)
  }

  /** Fold the center independently, or the shared auxiliary region when the product policy requests it. */
  setCenterCollapsed(collapsed: boolean): void {
    if (this.policy?.foldMode === 'shared') this.panels.setAuxiliaryCollapsed(collapsed)
    else this.panels.setCenterCollapsed(collapsed)
  }

  /** Fold or restore the auxiliary region without changing the product mode. */
  setAuxiliaryCollapsed(collapsed: boolean): void {
    this.panels.setAuxiliaryCollapsed(collapsed)
  }

  /** Stamp a structural seed onto one session's record; visible sessions take it live. */
  seedSessionGeometry(sessionId: string, geometry: Partial<SessionGeometry>): void {
    this.panels.seedSessionGeometry(sessionId, geometry)
  }

  /** Request an explicit canvas share; the frame or a later drag settles it. */
  seedUnitShare(share: number): void {
    this.panels.seedUnitShare(share)
  }

  /** Compare two sessions' nav-visible structural geometry. */
  navGeometryDiffers(from: string, to: string): boolean {
    return this.navDiffers(from, to)
  }

  /** Enter or leave the canvas-only presentation. */
  setCanvasFullscreen(on: boolean): void {
    this.panels.setCanvasFullscreen(on)
  }
}
