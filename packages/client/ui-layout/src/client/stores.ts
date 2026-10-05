/**
 * Root-owned frame measurement, panel preferences, and presentation reports.
 * The registration supplies a fresh store and binds its actions to ctx.layout.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from './service.ts'
import {
  CANVAS_MIN, CENTER_MIN, clampWidth, RIGHTBAR_DEFAULT, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'
import { readLayoutInfo, writeLayoutInfo } from './persistence.ts'

/**
 * Transient layout preferences. Responsive concessions never rewrite widths;
 * the right panel's expanded state belongs to its occupant.
 */
type LayoutState = {
  panelInfo: {
    /** Null selects the Conversation; global panels keep the current Session intact. */
    activePanelId: MainPanelId | null
  }
  layoutInfo: LayoutInfo
}

type LayoutInfo = {
  sidebar: number
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
   * Which side of the panel the canvas page occupies inside the right region;
   * null when no canvas is open. A non-null value claims the flexible track
   * between the center column and the panel's own width.
   */
  rightbarCanvas: 'left' | 'right' | null
  /**
   * Whether the shown panel stands collapsed to its icon rail. Reported by
   * the occupant; the track then holds the rail width instead of the saved
   * panel preference.
   */
  rightbarRail: boolean
  /** Reported fullscreen presentation; hides the outer resize handle. */
  rightbarFullscreen: boolean
  /** Suppress transitions for a fullscreen exit until another geometry action. */
  rightbarInstant: boolean
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
  setViewportWidth: (draft: LayoutState, width: number) => void
  setRightbar: (draft: LayoutState, px: number) => void
  settleRightbar: (draft: LayoutState) => void
  setUnit: (draft: LayoutState, px: number) => void
  openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean, canvas: 'left' | 'right' | null, rail: boolean) => void
  closeRightbar: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. For the sidebar the preference IS the
 * width, so closing it forgets its drag width — reopening restores the contract
 * default. The right panel initializes at the contract width on first opening
 * and keeps that px preference across resizes and close. Drag writes clamp to
 * the current frame's range. Narrow sidebar toggles change only the expansion
 * override; opening the right panel clears that override.
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
        rightbarCollapsed: false,
        rightbarCollapsePreview: false,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarCanvas: null,
        rightbarRail: false,
        rightbarFullscreen: false,
        rightbarInstant: false,
      },
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
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded
        else d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setViewportWidth: (d, width: number) => {
        if (d.layoutInfo.viewportWidth === width) return
        d.layoutInfo.rightbarInstant = false
        if ((d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) !== (width < SIDEBAR_AUTO_COLLAPSE)) {
          d.layoutInfo.narrowExpanded = false
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
        d.layoutInfo.rightbarCollapsed = false
        d.layoutInfo.rightbar = clampWidth(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      settleRightbar: (d) => {
        if (d.layoutInfo.rightbarCollapsePreview) d.layoutInfo.rightbarCollapsed = true
        d.layoutInfo.rightbarCollapsePreview = false
      },
      setUnit: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.unit = clampWidth(px, CANVAS_MIN, Math.max(CANVAS_MIN, d.layoutInfo.viewportWidth - CENTER_MIN))
      },
      openRightbar: (d, track: boolean, fullscreen: boolean, canvas: 'left' | 'right' | null, rail: boolean) => {
        const presentationMoved = !d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track
          || d.layoutInfo.rightbarFullscreen !== fullscreen || d.layoutInfo.rightbarCanvas !== canvas || d.layoutInfo.rightbarRail !== rail
        if (presentationMoved) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen
        if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = false
        if (!rail) d.layoutInfo.rightbarCollapsed = false
        d.layoutInfo.rightbarCollapsePreview = false
        d.layoutInfo.rightbar ??= clampWidth(RIGHTBAR_DEFAULT, RIGHTBAR_MIN,
          Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
        d.layoutInfo.rightbarShown = true
        d.layoutInfo.rightbarTrack = track
        d.layoutInfo.rightbarCanvas = canvas
        d.layoutInfo.rightbarRail = rail
        d.layoutInfo.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d) => {
        if (d.layoutInfo.rightbarShown) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen
        d.layoutInfo.rightbarCollapsed = false
        d.layoutInfo.rightbarCollapsePreview = false
        d.layoutInfo.rightbarShown = false
        d.layoutInfo.rightbarTrack = false
        d.layoutInfo.rightbarCanvas = null
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
        instance.store.set({ ...fresh, layoutInfo: { ...fresh.layoutInfo, ...saved } })
      }
      instance.subscribe(() => { writeLayoutInfo(instance.getSnapshot().layoutInfo) })
      return instance
    },
  }
}
