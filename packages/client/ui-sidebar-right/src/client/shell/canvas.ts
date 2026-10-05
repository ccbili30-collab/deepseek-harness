/**
 * The canvas: the presentation surface that renders floating panes beside the
 * panel. The panel carries navigation only; every opened surface is a floating
 * pane, and the canvas draws the topmost one's active tab.
 *
 * Which side of the panel the canvas parks on is window furniture, not
 * session data — one preference, remembered across launches. `left` keeps the
 * panel at the frame's right edge (conversation | canvas | panel); `right`
 * parks the canvas at the edge and the panel stands off it, which is the
 * arrangement the product's reference layout draws.
 */
export type CanvasSide = 'left' | 'right'

/** Where the side preference survives reloads. */
const SIDE_KEY = 'dsh.rightbar.canvas-side.v1'

let side: CanvasSide = typeof localStorage !== 'undefined' && localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left'
let version = 0
const listeners = new Set<() => void>()

/** The canvas-side preference, shared by the seat's canvas and cross-package readers. */
export const canvasSide = {
  /** Which side of the panel the canvas parks on. */
  get(): CanvasSide {
    return side
  },
  /** Flip which side of the panel the canvas parks on; persists. */
  toggle(): void {
    side = side === 'left' ? 'right' : 'left'
    try { localStorage.setItem(SIDE_KEY, side) } catch { /* private-mode storage — the session toggle still applies */ }
    version += 1
    for (const listener of listeners) listener()
  },
  /** Monotonic change counter — the external-store snapshot. */
  getSnapshot(): number {
    return version
  },
  /** Subscribe to side changes; returns the disposer. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
