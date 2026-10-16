/**
 * Root-owned frame measurement, panel preferences, and per-session structural
 * geometry. The registration supplies a fresh store and binds its actions to
 * ctx.layout.
 *
 * Widths (sidebar, right panel, unit column) are the user's drag memory and
 * stay global. Structural fields — nav collapse, the narrow-viewport override,
 * the unit side, the drawer's rail fold — belong to the visible session:
 * writes land in the live layoutInfo and stamp the active session's record,
 * and `enterSession` swaps the live fields when the visible session changes so
 * no session's structure leaks into another. The canvas's own composition side
 * lives with its session's surface (ui-sidebar-right), not here.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from './service.ts'
import type { UnitSide } from './arrangement.ts'
import {
  CANVAS_MIN, CENTER_MIN, clampWidth, RIGHTBAR_DEFAULT, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'
import { readLayoutInfo, writeLayoutInfo } from './persistence.ts'

/** Structural geometry one session owns; width preferences stay global beside it. */
export interface SessionGeometry {
  /** Nav column folded to its rail. */
  sidebarCollapsed: boolean
  /** Narrow-viewport expansion override over the auto-collapse. */
  narrowExpanded: boolean
  /** Which side of the conversation the unit (drawer + canvas) occupies. */
  unitSide: UnitSide
  /** Drawer folded to its icon rail by a below-floor width drag. */
  rightbarCollapsed: boolean
}

/** A persisted session record: its geometry plus the recency stamp pruning reads. */
export interface SessionGeometryRecord extends SessionGeometry {
  /** Last structural write or visit time; the newest records survive a save. */
  updatedAt: number
}

/** Fresh-session geometry: expanded nav, unit at the frame's far edge. */
export const DEFAULT_GEOMETRY: SessionGeometry = {
  sidebarCollapsed: false,
  narrowExpanded: false,
  unitSide: 'right',
  rightbarCollapsed: false,
}

/**
 * Transient layout preferences. Responsive concessions never rewrite widths;
 * the right panel's expanded state belongs to its occupant.
 */
export type LayoutState = {
  panelInfo: {
    /** Null selects the Conversation; global panels keep the current Session intact. */
    activePanelId: MainPanelId | null
  }
  layoutInfo: LayoutInfo
  geometry: {
    /** Session id whose structural geometry is live in layoutInfo; null before the first session lands. */
    active: string | null
    byId: Record<string, SessionGeometryRecord>
  }
}

type LayoutInfo = {
  /** Nav width preference in px; collapse is the structural flag, never a width. */
  sidebar: number
  /** Live structural nav fold of the visible session (geometry.active). */
  sidebarCollapsed: boolean
  /** Last positive frame measurement; window width bootstraps the first render. */
  viewportWidth: number
  narrowExpanded: boolean
  /**
   * Saved right panel width in px, or null before its first opening. Resizing
   * the frame and closing the panel preserve this preference.
   */
  rightbar: number | null
  /**
   * Saved unit column width (canvas page + panel) in px, or null for the
   * computed share. Only meaningful while a canvas claims the column; the
   * panel's own drag stays inside it through `rightbar`.
   */
  unit: number | null
  /** Pending explicit canvas/conversation ratio; resolved against rendered columns, never persisted. */
  unitCanvasShare: number | null
  /**
   * A width drag pushed below RIGHTBAR_MIN: the occupant stands collapsed to
   * its rail until it reports itself expanded again. The `rightbar` preference
   * survives untouched so re-expansion restores the dragged width.
   */
  rightbarCollapsed: boolean
  /**
   * A width drag below RIGHTBAR_MIN that has not released yet: the occupant
   * draws its collapse preview while the pointer is down. `settleRightbar`
   * commits the fold on release.
   */
  rightbarCollapsePreview: boolean
  /**
   * Whether the right panel is drawn at all, in either presentation.
   *
   * Derived chrome, not a source of truth: whether the right surface is
   * expanded is a recorded fact owned by that surface, reported here so the
   * frame can place the panel's resize handle. The occupant reports it; nothing
   * else writes it.
   */
  rightbarShown: boolean
  /**
   * Whether the normal panel width reserves a grid track, including beneath
   * fullscreen. Reported by the occupant; always false while hidden.
   */
  rightbarTrack: boolean
  /**
   * Whether the shown panel stands collapsed to its icon rail. Reported by the
   * occupant; the track then holds the rail width instead of the saved
   * panel preference.
   */
  rightbarRail: boolean
  /** Reported fullscreen presentation; hides the outer resize handle. */
  rightbarFullscreen: boolean
  /** Suppress transitions for a fullscreen exit until another geometry action. */
  rightbarInstant: boolean
  /** Live structural unit side of the visible session (geometry.active). */
  unitSide: UnitSide
}

/** Live structural fields of layoutInfo that mirror the active session's record. */
type Structural = Pick<LayoutInfo, 'sidebarCollapsed' | 'narrowExpanded' | 'unitSide' | 'rightbarCollapsed'>

/**
 * Stamp the live structural fields into the active session's record. Every
 * structural write goes through here: a field that misses the record would
 * leak into the next session that session-switches past it.
 * @param d - store draft.
 * @param patch - structural fields to change before stamping.
 */
function structural(d: LayoutState, patch: Partial<Structural>): void {
  Object.assign(d.layoutInfo, patch)
  const active = d.geometry.active
  if (active === null) return
  d.geometry.byId[active] = {
    sidebarCollapsed: d.layoutInfo.sidebarCollapsed,
    narrowExpanded: d.layoutInfo.narrowExpanded,
    unitSide: d.layoutInfo.unitSide,
    rightbarCollapsed: d.layoutInfo.rightbarCollapsed,
    updatedAt: Date.now(),
  }
}

/**
 * Read one session's geometry, defaulting fresh sessions.
 * @param state - live layout state.
 * @param sessionId - session id to resolve.
 * @returns the session's record, or the fresh-session default.
 */
function geometryOf(state: LayoutState, sessionId: string): SessionGeometry {
  return state.geometry.byId[sessionId] ?? DEFAULT_GEOMETRY
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  selectPanel: (draft: LayoutState, panelId: MainPanelId | null) => void
  retainMainPanels: (draft: LayoutState, panelIds: readonly string[]) => void
  setSidebar: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setSidebarCollapsed: (draft: LayoutState, collapsed: boolean) => void
  setUnitSide: (draft: LayoutState, side: UnitSide) => void
  enterSession: (draft: LayoutState, sessionId: string) => void
  seedSessionGeometry: (draft: LayoutState, sessionId: string, patch: Partial<SessionGeometry>) => void
  seedUnitShare: (draft: LayoutState, share: number) => void
  setViewportWidth: (draft: LayoutState, width: number) => void
  setRightbar: (draft: LayoutState, px: number) => void
  settleRightbar: (draft: LayoutState) => void
  setUnit: (draft: LayoutState, px: number) => void
  openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean, rail: boolean) => void
  closeRightbar: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. Widths are the user's drag memory:
 * the sidebar keeps its width while collapsed (reopening restores it), the
 * right panel initializes at the contract width on first opening and keeps
 * that px preference across resizes and close. Drag writes clamp to the
 * current frame's range. Structural writes stamp the active session's record;
 * `enterSession` swaps structural state when the visible session changes.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        sidebar: SIDEBAR_DEFAULT,
        viewportWidth: window.innerWidth,
        narrowExpanded: false,
        rightbar: null,
        unit: null,
        unitCanvasShare: null,
        rightbarCollapsed: false,
        rightbarCollapsePreview: false,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarRail: false,
        rightbarFullscreen: false,
        rightbarInstant: false,
        unitSide: DEFAULT_GEOMETRY.unitSide,
        sidebarCollapsed: DEFAULT_GEOMETRY.sidebarCollapsed,
      },
      geometry: { active: null, byId: {} },
    }),
    actions: {
      selectPanel: (d, panelId: MainPanelId | null) => {
        d.panelInfo.activePanelId = panelId
      },
      retainMainPanels: (d, panelIds: readonly string[]) => {
        if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) {
          d.panelInfo.activePanelId = null
        }
      },
      setSidebar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX)
      },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        d.layoutInfo.rightbarInstant = false
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) structural(d, { narrowExpanded: !d.layoutInfo.narrowExpanded })
        else structural(d, { sidebarCollapsed: !d.layoutInfo.sidebarCollapsed })
      },
      setSidebarCollapsed: (d, collapsed: boolean) => {
        d.layoutInfo.rightbarInstant = false
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) structural(d, { narrowExpanded: !collapsed })
        else structural(d, { sidebarCollapsed: collapsed })
      },
      setUnitSide: (d, side: UnitSide) => {
        structural(d, { unitSide: side })
      },
      // Entry-path seeding: stamp a named structure onto one session's record
      // before or after it becomes visible. A session that is already live
      // takes the patch into its layoutInfo too, so the seed lands on screen;
      // a not-yet-visible session keeps its current geometry until
      // `enterSession` loads the stamped record.
      seedSessionGeometry: (d, sessionId: string, patch: Partial<SessionGeometry>) => {
        d.geometry.byId[sessionId] = { ...geometryOf(d, sessionId), ...patch, updatedAt: Date.now() }
        if (d.geometry.active === sessionId) Object.assign(d.layoutInfo, patch)
      },
      // Stamp the outgoing session's live structure, then land the incoming
      // session's record (fresh sessions take the default structure). The
      // frame suppresses transition easing for the switchover render.
      enterSession: (d, sessionId: string) => {
        if (d.geometry.active === sessionId) return
        structural(d, {})
        d.geometry.active = sessionId
        const next = geometryOf(d, sessionId)
        d.layoutInfo.sidebarCollapsed = next.sidebarCollapsed
        d.layoutInfo.narrowExpanded = next.narrowExpanded
        d.layoutInfo.unitSide = next.unitSide
        d.layoutInfo.rightbarCollapsed = next.rightbarCollapsed
      },
      // An explicit preset requests a ratio even over a saved width; the frame
      // resolves it against the rendered navigation and drawer once a canvas
      // claims the column, and any later drag (setUnit) replaces it.
      seedUnitShare: (d, share: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.unitCanvasShare = Math.min(1, Math.max(0, share))
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setViewportWidth: (d, width: number) => {
        if (d.layoutInfo.viewportWidth === width) return
        d.layoutInfo.rightbarInstant = false
        if ((d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) !== (width < SIDEBAR_AUTO_COLLAPSE)) {
          structural(d, { narrowExpanded: false })
        }
        d.layoutInfo.viewportWidth = width
      },
      // A drag below the floor arms the collapse preview instead of a narrower
      // panel: the occupant blurs into its rail announcement while the pointer
      // holds, and `settleRightbar` on release commits the fold. The `rightbar`
      // preference survives either way so re-expansion restores the drag width.
      setRightbar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        if (px < RIGHTBAR_MIN) { d.layoutInfo.rightbarCollapsePreview = true; return }
        d.layoutInfo.rightbarCollapsePreview = false
        structural(d, { rightbarCollapsed: false })
        d.layoutInfo.rightbar = clampWidth(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      settleRightbar: (d) => {
        if (d.layoutInfo.rightbarCollapsePreview) structural(d, { rightbarCollapsed: true })
        d.layoutInfo.rightbarCollapsePreview = false
      },
      setUnit: (d, px: number) => {
        d.layoutInfo.unitCanvasShare = null
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.unit = clampWidth(px, CANVAS_MIN, Math.max(CANVAS_MIN, d.layoutInfo.viewportWidth - CENTER_MIN))
      },
      openRightbar: (d, track: boolean, fullscreen: boolean, rail: boolean) => {
        const presentationMoved = !d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track
          || d.layoutInfo.rightbarFullscreen !== fullscreen || d.layoutInfo.rightbarRail !== rail
        if (presentationMoved) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen
        if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) structural(d, { narrowExpanded: false })
        if (!rail) structural(d, { rightbarCollapsed: false })
        d.layoutInfo.rightbarCollapsePreview = false
        d.layoutInfo.rightbar ??= clampWidth(RIGHTBAR_DEFAULT, RIGHTBAR_MIN,
          Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
        d.layoutInfo.rightbarShown = true
        d.layoutInfo.rightbarTrack = track
        d.layoutInfo.rightbarRail = rail
        d.layoutInfo.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d) => {
        if (d.layoutInfo.rightbarShown) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen
        d.layoutInfo.rightbarCollapsePreview = false
        d.layoutInfo.rightbarShown = false
        d.layoutInfo.rightbarTrack = false
        d.layoutInfo.rightbarRail = false
        d.layoutInfo.rightbarFullscreen = false
      },
    },
  })
  return {
    ...handle,
    create() {
      const instance = handle.create()
      // Frame geometry is a preference: hydrate the saved columns before the
      // first paint, then write back on every commit.
      const saved = readLayoutInfo()
      if (saved !== undefined) {
        const fresh = instance.getSnapshot()
        // The live structure starts on the most recently visited session's
        // record: startup restores that session, so the first paint already
        // carries its geometry instead of flashing the default until the
        // session reference lands. A different restore target swaps correctly.
        const latest = Object.values(saved.byId).reduce<SessionGeometryRecord | undefined>(
          (newest, record) => newest === undefined || record.updatedAt > newest.updatedAt ? record : newest, undefined)
        instance.store.set({ ...fresh,
          layoutInfo: latest === undefined ? { ...fresh.layoutInfo, sidebar: saved.sidebar, rightbar: saved.rightbar, unit: saved.unit } : {
            ...fresh.layoutInfo,
            sidebar: saved.sidebar,
            rightbar: saved.rightbar,
            unit: saved.unit,
            sidebarCollapsed: latest.sidebarCollapsed,
            narrowExpanded: latest.narrowExpanded,
            unitSide: latest.unitSide,
            rightbarCollapsed: latest.rightbarCollapsed,
          },
          geometry: { ...fresh.geometry, byId: saved.byId },
        })
      }
      instance.subscribe(() => {
        const snapshot = instance.getSnapshot()
        writeLayoutInfo(snapshot.layoutInfo, snapshot.geometry.byId)
      })
      return instance
    },
  }
}

/**
 * Whether two sessions' structural geometry reads differently on the frame's
 * stable furniture: a nav-collapse or unit-side difference is a scene change
 * (the page turn takes the heavier lift weight); drawer-fold and canvas-side
 * differences play out inside the work layer's own transition.
 * @param state - live layout state.
 * @param from - outgoing session id.
 * @param to - incoming session id.
 * @returns true when the resolved nav collapse or the unit side differs.
 */
export function navGeometryDiffers(state: LayoutState, from: string, to: string): boolean {
  const narrow = state.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE
  const a = geometryOf(state, from)
  const b = geometryOf(state, to)
  const collapsed = (g: SessionGeometry): boolean => narrow ? !g.narrowExpanded : g.sidebarCollapsed
  return collapsed(a) !== collapsed(b) || a.unitSide !== b.unitSide
}
