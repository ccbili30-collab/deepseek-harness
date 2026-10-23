/** Load xterm only after a terminal body is mounted. */
import { Suspense, type ReactNode } from 'react'
import type { TerminalBodyProps } from './terminal.tsx'
import { LoadedTerminalBody } from './terminal-lazy.ts'

/**
 * Suspend while the package-local terminal chunk arrives.
 * @param props - Terminal body props supplied by the sidebar slot.
 * @returns the deferred terminal renderer.
 */
export function LazyTerminalBody(props: TerminalBodyProps): ReactNode {
  return <Suspense fallback={null}><LoadedTerminalBody {...props} /></Suspense>
}
