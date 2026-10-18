/**
 * Normal column geometry: the right column shrinks, then loses its track,
 * before the center drops below its minimum. The sidebar never concedes here;
 * AppFrame supplies its effective preference after responsive collapse.
 */

/** Resolved widths for one frame. */
export interface Columns { sidebar: number; center: number; rightbar: number }

/** Center width protected while the normal right column is open. */
export const CENTER_MIN = 320
/** Sidebar drag clamp floor. */
export const SIDEBAR_MIN = 264
/** Sidebar drag clamp ceiling. */
export const SIDEBAR_MAX = 420
/** Sidebar width before any user drag. */
export const SIDEBAR_DEFAULT = 280
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
export const SIDEBAR_COLLAPSED = 56
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
export const SIDEBAR_AUTO_COLLAPSE = 1024
/** Right column drag clamp floor; a drag below it arms the collapse preview, releasing there folds the panel to its rail. */
export const RIGHTBAR_MIN = 96
/** Maximum normal right panel width as a fraction of the frame. */
export const RIGHTBAR_MAX_RATIO = 0.7
/** Right column width before any user drag — a tools column, sized like the sidebar, not a second work surface. */
export const RIGHTBAR_DEFAULT = 320
/** Collapsed right column: an icon rail, matching the closed sidebar's width. */
export const RIGHTBAR_RAIL = 56
/** Canvas page floor inside the unit column while a canvas claims it — the unit seam stops shrinking once the page drops to this. */
export const CANVAS_MIN = 280

/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

/**
 * Resolve a canvas/conversation preset after reserving the navigation and drawer.
 * @param workWidth - frame width excluding the rendered navigation column.
 * @param drawerWidth - drawer track reserved inside the canvas unit.
 * @param share - canvas fraction of the remaining canvas/conversation space.
 * @returns combined drawer and canvas width, constrained by the conversation minimum.
 */
export function canvasShareWidth(workWidth: number, drawerWidth: number, share: number): number {
  const ceiling = Math.max(0, workWidth - CENTER_MIN)
  const floor = Math.min(drawerWidth + CANVAS_MIN, ceiling)
  return clampWidth(drawerWidth + Math.max(0, workWidth - drawerWidth) * share, floor, ceiling)
}

/**
 * Solve the three column widths for one viewport frame.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param rightbar - requested right panel width in px (0 = no track).
 * @param collapsedWidth - track width of the closed sidebar; the default keeps
 *   the icon rail, 0 hides the column entirely (macOS desktop).
 * @returns actual widths after shrinking or removing the right track; only
 *   without that track may the center fall below its minimum, down to zero.
 */
export function computeColumns(viewport: number, sidebar: number, rightbar: number, collapsedWidth = SIDEBAR_COLLAPSED): Columns {
  const s = sidebar === 0 ? collapsedWidth : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const available = viewport - s - CENTER_MIN
  const r = rightbar === 0 || available < RIGHTBAR_MIN
    ? 0
    : Math.min(available, clampWidth(rightbar, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { sidebar: s, center: Math.max(0, viewport - s - r), rightbar: r }
}
