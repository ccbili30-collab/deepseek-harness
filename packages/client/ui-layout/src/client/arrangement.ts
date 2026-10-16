/**
 * Shared vocabulary for the frame's structural geometry sides. The preference
 * values themselves live in the layout store's per-session records (stores.ts):
 * each visible session owns its structural arrangement, and the width
 * preferences beside them are the user's global drag memory.
 */

/** Which side of the conversation column the right-region unit (drawer + canvas) occupies. */
export type UnitSide = 'left' | 'right'

/** Which side of the drawer panel the canvas page composes on inside the unit. */
export type CanvasSide = 'left' | 'right'
