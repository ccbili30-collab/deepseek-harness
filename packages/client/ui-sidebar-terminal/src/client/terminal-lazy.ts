/** One package-local terminal chunk shared by the sidebar body and canvas page. */
import { lazy } from 'react'

const loadTerminal = () => import('./terminal.tsx')

/** Deferred sidebar body (slot props). */
export const LoadedTerminalBody = lazy(async () => ({ default: (await loadTerminal()).TerminalBody }))

/** Deferred emulator surface (canvas page props). */
export const LoadedTerminalSurface = lazy(async () => ({ default: (await loadTerminal()).TerminalSurface }))
