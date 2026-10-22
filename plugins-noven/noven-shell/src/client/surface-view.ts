/**
 * Canvas-scoped view state for free surfaces.
 *
 * A surface is a page, not a widget: the canvas can give it the whole page
 * (`immersive`) and can itself cover the window (`canvasFullscreen`). Both
 * are presentation states of the canvas tab, not overlays, so the surface
 * never opens a second shell. The canvas owns the Escape chain; a surface
 * only asks for the next state.
 * @module noven-shell/client/surface-view
 */
import { createContext, useContext } from 'react'

/** The canvas's live fullscreen state, shared with the page being drawn. */
export interface SurfaceView {
  /** The rendered page is in module fullscreen (surface fills the canvas). */
  readonly immersive: boolean
  /** The canvas covers the window: navigation, drawer, conversation hidden. */
  readonly canvasFullscreen: boolean
  /** Enter or leave module fullscreen for the active page. */
  readonly toggleImmersive: () => void
  /** Enter or leave canvas fullscreen. */
  readonly toggleCanvasFullscreen: () => void
}

/** Undefined outside a canvas host; pages then render their inline form. */
export const SurfaceViewContext = createContext<SurfaceView | undefined>(undefined)

/** Read the enclosing canvas's surface view state. */
export function useSurfaceView(): SurfaceView | undefined {
  return useContext(SurfaceViewContext)
}
