/** Canvas page contributed by the terminal plugin: one terminal fills a canvas tab. */
import { useEffect, useMemo, useSyncExternalStore, type ComponentType } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TerminalView } from '@deepseek-ai/dsh-api-terminal-controller/client'
import type { CanvasPageProps } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { TerminalSurface, type TerminalBodyProps } from './terminal.tsx'

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
  return function TerminalCanvasPage({ sessionId, pageKey, openPage }: CanvasPageProps) {
    const model = useMemo(() => deps.view(sessionId as SessionId, pageKey), [pageKey, sessionId])
    const state = useSyncExternalStore(model.state.subscribe, model.state.getSnapshot)
    const theme = useSyncExternalStore(deps.theme.subscribe, deps.theme.getSnapshot)
    useEffect(() => model.mount(), [model])
    useEffect(() => () => { deps.close(sessionId as SessionId, pageKey) }, [pageKey, sessionId])
    return <TerminalSurface state={state} model={model} theme={theme} t={deps.t} visible
      label={deps.t('title')} onNew={() => openPage('terminal')} />
  }
}
