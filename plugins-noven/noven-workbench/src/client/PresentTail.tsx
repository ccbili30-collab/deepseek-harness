/**
 * The in-conversation frame block: each `present_artifact` result settled in
 * a Turn renders as one live framed block beneath the closing prose — the
 * same sandboxed iframe the canvas uses, so the artifact is a first-class
 * object in the transcript, not a quoted file.
 * @module noven-workbench/client/PresentTail
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { frameUrl } from './api.ts'
import { useFrameProbe } from './HtmlStage.tsx'
import type { NovenWorkbenchKey } from './locales.ts'
import { selectPresented } from './present-receipt.ts'
import type { PresentedResult } from './present-receipt.ts'

/** Injected business face for the tail's canvas action. */
export interface PresentTailInjected {
  readonly sessionId: SessionId | undefined
  /** Raise the workbench canvas beside the conversation. */
  readonly openCanvas: () => void
}

/** One presented artifact as a framed block. */
function PresentBlock({ result, sessionId, t, openCanvas }: {
  readonly result: PresentedResult
  readonly sessionId: SessionId
  readonly t: (key: NovenWorkbenchKey) => string
  readonly openCanvas: () => void
}) {
  const { meta } = result
  const label = meta.title ?? meta.source.split('/').pop() ?? meta.source
  const url = frameUrl(sessionId, meta.frame, meta.source)
  const probe = useFrameProbe(url)
  return (
    <div className="noven-wb-present">
      <header className="noven-wb-present-head">
        <span className="noven-wb-present-title">{label}</span>
        <button type="button" className="noven-wb-present-open" onClick={openCanvas}>
          {t('frame.openCanvas')}
        </button>
      </header>
      {probe.state === 'ok' && (
        <iframe
          className="noven-wb-present-frame"
          sandbox="allow-scripts"
          src={url}
          title={label}
        />
      )}
      {probe.state === 'failed' && (
        <p className="noven-wb-present-failed">
          {t('stage.frameHint')}
          <button type="button" className="noven-wb-retry" onClick={probe.retry}>{t('stage.retry')}</button>
        </p>
      )}
    </div>
  )
}

/**
 * Render the artifacts one Turn presented as standalone framed blocks. The
 * tail seat is a list independent of the process disclosure, so the blocks
 * stay visible while the tool group is collapsed.
 */
export function PresentTail(props: PropsRuntime<'conversation.chat.turnTail'>
  & InjectFace<PresentTailInjected>
  & PropsLocale<'novenWorkbench'>) {
  const matched = selectPresented(props)
  const sessionId = props.sessionId
  if (matched === null || sessionId === undefined) return null
  return (
    <div className="noven-wb-present-list">
      {matched.presented.map(result => (
        <PresentBlock key={result.callId} result={result} sessionId={sessionId}
          t={props.t} openCanvas={props.openCanvas} />
      ))}
    </div>
  )
}
