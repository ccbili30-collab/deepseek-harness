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
import type { SessionGeometry, SessionGeometryRecord, createLayoutStore } from './stores.ts'

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
export type MainPanelId = Branded<'MainPanelId'>

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
   * @returns the side, or null while the session has no open canvas.
   */
  claim(sessionId: string | null): CanvasSide | null
  /** Notify that claims may have changed; listeners re-read `claim`. */
  subscribe(listener: () => void): () => void
}

/** The frame's canvas-claim seam: the occupant provides the source, the frame pulls. */
export interface CanvasClaims {
  /** Attach (or replace) the claim source; returns the detach disposer. */
  provide(source: CanvasClaimSource): () => void
  /** The session's current claim, or null with no source attached or no claim. */
  claim(sessionId: string | null): CanvasSide | null
  /** Subscribe to claim changes. */
  subscribe(listener: () => void): () => void
}

/** Panel navigation and geometry actions exposed through ctx.layout. */
export interface ILayout {
  /** Selected central panel from the same root store used by `usePanelInfo`. */
  readonly panelInfo: HostObservable<PanelInfo>
  /** Live structural geometry of the visible session (nav fold and unit side). */
  readonly sessionGeometry: HostObservable<LiveSessionGeometry>
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
   * Stamp a structural seed onto one session's geometry record — the entry-path
   * write for named arrangements. A session that is already visible takes the
   * patch on screen; one that is not keeps its geometry until it loads.
   * @param sessionId - session the seed targets.
   * @param geometry - structural fields to stamp over the session's record.
   */
  seedSessionGeometry(sessionId: string, geometry: Partial<SessionGeometry>): void
  /**
   * Seed the unit column width as a share of the work layer, once.
   * @param share - fraction of the frame beside the nav column the unit takes.
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
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  private navigation = new AbortController()
  private claimSource: CanvasClaimSource | undefined
  private readonly claimListeners = new Set<() => void>()

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
    claim: (sessionId: string | null): CanvasSide | null => this.claimSource?.claim(sessionId) ?? null,
    subscribe: (listener: () => void): (() => void) => {
      this.claimListeners.add(listener)
      return () => { this.claimListeners.delete(listener) }
    },
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

  /** Stamp a structural seed onto one session's record; visible sessions take it live. */
  seedSessionGeometry(sessionId: string, geometry: Partial<SessionGeometry>): void {
    this.panels.seedSessionGeometry(sessionId, geometry)
  }

  /** Seed the unit width as a work-layer share; a drag preference wins over it. */
  seedUnitShare(share: number): void {
    this.panels.seedUnitShare(share)
  }

  /** Compare two sessions' nav-visible structural geometry. */
  navGeometryDiffers(from: string, to: string): boolean {
    return this.navDiffers(from, to)
  }
}
