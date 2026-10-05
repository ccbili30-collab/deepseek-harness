/**
 * Sandboxed HTML stage: one workspace HTML file rendered in an opaque-origin
 * iframe through `/api/noven-frame` — the ported interactive-presentation
 * surface (legacy `creatx-workbench://`). The route injects the `NOVEN_FRAME`
 * prelude (sibling `fetch`, `url`, `loadSource`) and locks the document down
 * with CSP; the iframe carries `allow-scripts` only, so the page cannot touch
 * the app's own APIs. `src` names the bound source file when the page renders
 * as a frame over another document.
 * @module noven-workbench/client/HtmlStage
 */
import { useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { frameUrl, probeFrame } from './api.ts'
import type { NovenWorkbenchKey } from './locales.ts'

/** Props the stage binds for the HTML renderer. */
export interface HtmlStageProps {
  readonly sessionId: SessionId
  /** Workspace-relative HTML file to render. */
  readonly rel: string
  /** Workspace-relative source file the frame reads (view bindings). */
  readonly src?: string
  /** Extra iframe sandbox tokens (e.g. forms for interactive pages). */
  readonly sandboxExtra?: string
  readonly t: (key: NovenWorkbenchKey) => string
}

/**
 * Probe one frame URL before its iframe mounts: 'ok' only once the route
 * answers a renderable document. A retry bumps `attempt` and re-probes.
 * @param url - the frame URL.
 * @returns 'loading' | 'ok' | 'failed' and a retry trigger.
 */
export function useFrameProbe(url: string): { state: 'loading' | 'ok' | 'failed', retry: () => void } {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    void probeFrame(url, controller.signal).then(ok => {
      if (!controller.signal.aborted) setState(ok ? 'ok' : 'failed')
    })
    return () => { controller.abort() }
  }, [url, attempt])
  return { state, retry: () => { setAttempt(n => n + 1) } }
}

/**
 * Render one workspace HTML document in the sandboxed frame. The iframe only
 * mounts after the route answers a renderable document — a missing file, a
 * dead route, or a refusing CSP draws the stage's own error surface with a
 * retry instead of the server's bare 404 text.
 * @param props - session address, the file, an optional bound source, and copy.
 * @returns the frame surface.
 */
export function HtmlStage(props: HtmlStageProps) {
  const sandbox = `allow-scripts${props.sandboxExtra === undefined ? '' : ` ${props.sandboxExtra}`}`
  const url = frameUrl(props.sessionId, props.rel, props.src)
  const probe = useFrameProbe(url)
  if (probe.state === 'failed') {
    return (
      <div className="noven-wb-stage-empty">
        <h1>{props.t('loadFailed')}</h1>
        <p>{props.rel}</p>
        <p>{props.t('stage.frameHint')}</p>
        <button type="button" className="noven-wb-retry" onClick={probe.retry}>{props.t('stage.retry')}</button>
      </div>
    )
  }
  if (probe.state === 'loading') {
    return <div className="noven-wb-stage-empty"><h1>…</h1></div>
  }
  return (
    <iframe
      className="noven-wb-html"
      sandbox={sandbox}
      src={url}
      title={props.rel.split('/').pop() ?? props.rel}
    />
  )
}
