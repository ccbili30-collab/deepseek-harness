/**
 * Which side of the conversation column the right-region unit (navigation
 * panel + canvas) occupies. Window furniture, not session data — one
 * preference, remembered across launches. `right` is the shipping order
 * (conversation | unit); `left` parks the unit against the sidebar and the
 * conversation at the frame's right edge.
 */
export type UnitSide = 'left' | 'right'

/** Where the unit-side preference survives reloads. */
const SIDE_KEY = 'dsh.layout.unit-side.v1'

let side: UnitSide = typeof localStorage !== 'undefined' && localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'
let version = 0
const listeners = new Set<() => void>()

/** The unit-side preference, read by the frame and toggled by region-sort gestures. */
export const unitSide = {
  /** Which side of the conversation the canvas+panel unit sits on. */
  get(): UnitSide {
    return side
  },
  /** Move the unit to the named side; persists. */
  set(next: UnitSide): void {
    if (side === next) return
    side = next
    try { localStorage.setItem(SIDE_KEY, side) } catch { /* private-mode storage — the in-session move still applies */ }
    version += 1
    for (const listener of listeners) listener()
  },
  /** Swap which side of the conversation the unit occupies; persists. */
  toggle(): void {
    unitSide.set(side === 'left' ? 'right' : 'left')
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
