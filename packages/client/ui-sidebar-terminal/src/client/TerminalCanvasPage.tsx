/** Canvas page contributed by the terminal plugin: one terminal fills a canvas tab. */
import { Suspense, useEffect, useMemo, useSyncExternalStore, type ComponentType } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { CanvasPageProps } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { TerminalBodyProps } from './terminal.tsx'
import { LoadedTerminalSurface } from './terminal-lazy.ts'

/** Services the host shell injects into the terminal page factory. */
export interface TerminalCanvasDeps {
  readonly view: (sessionId: SessionId, key: string) => TerminalView
  readonly close: (sessionId: SessionId, key: string) => void
  readonly theme: {
    getSnapshot(): ThemeSnapshot
    subscribe(listener: () => void): () => void
  }
  readonly t: TerminalBodyProps['t']
}

/**
 * Create the canvas page component for one host shell.
 * @param deps - terminal model, theme, copy, and close hook.
 * @returns a component receiving session identity and page navigation from the canvas.
 */
export function createTerminalCanvasPage(deps: TerminalCanvasDeps): ComponentType<CanvasPageProps> {
  return function TerminalCanvasPage({ sessionId, pageKey, active, openPage }: CanvasPageProps) {
    const model = useMemo(() => deps.view(sessionId as SessionId, pageKey), [pageKey, sessionId, deps])
    const state = useSyncExternalStore(
      listener => model.state.subscribe(listener),
      () => model.state.getSnapshot(),
    )
    const theme = useSyncExternalStore(
      listener => deps.theme.subscribe(listener),
      () => deps.theme.getSnapshot(),
    )
    useEffect(() => model.mount(), [model])
    useEffect(() => () => { deps.close(sessionId as SessionId, pageKey) }, [pageKey, sessionId, deps])
    return (
      <Suspense fallback={null}>
        <LoadedTerminalSurface state={state} model={model} theme={theme} t={deps.t} visible={active}
          label={deps.t('title')} onNew={() => { openPage('terminal') }} />
      </Suspense>
    )
  }
}
