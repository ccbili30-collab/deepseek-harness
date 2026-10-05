/**
 * Document canvas renderer: a workspace markdown/text file rendered with
 * DSH's shared MarkdownText, its local image destinations rewritten to
 * `/api/file` URLs through the renderer's pathImages vocabulary. The pen
 * toggle edits the same file in place — saves go through `/api/noven-doc`
 * optimistic-locked on the loaded text, so an external change surfaces as a
 * conflict notice with overwrite/reload choices instead of a silent stomp.
 * @module noven-workbench/client/DocStage
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchApi } from './api.ts'
import type { NovenWorkbenchKey } from './locales.ts'

/** Props the stage binds for the document renderer. */
export interface DocStageProps {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly sessionId: SessionId
  readonly cwd: string
  /** Workspace-relative file to render. */
  readonly rel: string
  readonly api: WorkbenchApi
  /** `/api/file` URL builder for a workspace-relative path. */
  readonly mediaUrl: (rel: string) => string
  /** Whether the file is being edited in place; the stage top bar's pen owns the toggle. */
  readonly mode: 'view' | 'edit'
}

/** Join a doc-relative image destination to its absolute workspace path. */
function resolveDocPath(cwd: string, docRel: string, dest: string): string {
  const base = `${cwd}/${docRel.slice(0, Math.max(0, docRel.lastIndexOf('/')))}`
  const parts = `${base}/${dest}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.' || part === '') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

type DocLoad = { readonly text: string } | 'loading' | 'failed' | 'binary'
type SaveState = 'idle' | 'saving' | 'conflict' | 'error'

/**
 * Render one workspace document, with in-canvas editing under the pen toggle.
 * @param props - locale copy, session/cwd, the file, the API, the URL builder, and the mode.
 * @returns the rendered or edited document.
 */
export function DocStage(props: DocStageProps) {
  const { t, rel, mode } = props
  const [load, setLoad] = useState<DocLoad>('loading')
  const [draft, setDraft] = useState('')
  const [save, setSave] = useState<SaveState>('idle')

  const loadFile = useCallback(() => {
    const controller = new AbortController()
    void props.api.readText(props.sessionId, rel, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (!result.ok) { setLoad(result.error.code === 'workspace-file/not-text' ? 'binary' : 'failed'); return }
      const text = result.value
      setLoad(text === undefined ? 'failed' : { text })
      if (text !== undefined) { setDraft(text); setSave('idle') }
    }, () => {
      if (!controller.signal.aborted) setLoad('failed')
    })
  }, [props.api, props.sessionId, rel])

  useEffect(() => {
    setLoad('loading')
    const controller = new AbortController()
    void props.api.readText(props.sessionId, rel, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (!result.ok) { setLoad(result.error.code === 'workspace-file/not-text' ? 'binary' : 'failed'); return }
      const text = result.value
      setLoad(text === undefined ? 'failed' : { text })
      if (text !== undefined) { setDraft(text); setSave('idle') }
    }, () => {
      if (!controller.signal.aborted) setLoad('failed')
    })
    return () => { controller.abort() }
  }, [props.api, props.sessionId, rel])

  const dirty = typeof load === 'object' && draft !== load.text

  const saveNow = useCallback((base: string | null) => {
    if (typeof load !== 'object' || save === 'saving') return
    setSave('saving')
    void props.api.saveDoc(props.sessionId, rel, draft, base).then(result => {
      if (!result.ok) { setSave('error'); return }
      if ('conflict' in result.value) { setSave('conflict'); return }
      setLoad({ text: draft })
      setSave('idle')
    }, () => { setSave('error') })
  }, [props.api, props.sessionId, rel, draft, load, save])

  const labels = useMemo(() => ({
    code: {
      copyLabel: t('doc.code.copy'),
      copiedLabel: t('doc.code.copied'),
      toolbarLabels: {
        codeLabel: t('doc.code.label'),
        wrapLabel: t('doc.code.wrap'),
        unwrapLabel: t('doc.code.unwrap'),
      },
    },
    footnotes: '',
  }), [t])

  const pathImages = useMemo(() => ({
    resolve: (value: string): string | undefined => {
      if (value.startsWith('http:') || value.startsWith('https:') || value.startsWith('data:') || value.startsWith('blob:')) return undefined
      const absolute = value.startsWith('/')
        ? `${props.cwd}${value.startsWith('/') ? value : `/${value}`}`
        : resolveDocPath(props.cwd, rel, value)
      return props.mediaUrl(absolute.slice(props.cwd.length + 1))
    },
  }), [props.cwd, props.mediaUrl, rel])

  if (load === 'binary') {
    return (
      <div className="noven-wb-stage-empty">
        <h1>{rel.split('/').pop()}</h1>
        <p>{rel}</p>
        <p>{t('stage.unsupportedHint')}</p>
      </div>
    )
  }
  if (load === 'failed') {
    return <div className="noven-wb-stage-empty"><h1>{t('loadFailed')}</h1></div>
  }
  if (load === 'loading') {
    return <div className="noven-wb-stage-empty"><h1>{t('doc.loading')}</h1></div>
  }

  return (
    <div className="noven-wb-doc">
      {mode === 'edit' && (
        <div className="noven-wb-doc-bar">
          <div className="noven-wb-doc-actions">
            {dirty && <span className="noven-wb-doc-dirty">{t('doc.dirty')}</span>}
            <button type="button" className="noven-wb-doc-save" disabled={!dirty || save === 'saving'}
              onClick={() => { saveNow(load.text) }}>
              {save === 'saving' ? t('doc.saving') : t('doc.save')}
            </button>
          </div>
        </div>
      )}
      {save === 'conflict' && (
        <div className="noven-wb-doc-conflict" role="alert">
          <span>{t('doc.conflict')}</span>
          <button type="button" onClick={() => { saveNow(null) }}>{t('doc.overwrite')}</button>
          <button type="button" onClick={loadFile}>{t('doc.reload')}</button>
        </div>
      )}
      {save === 'error' && <div className="noven-wb-doc-conflict" role="alert"><span>{t('doc.saveFailed')}</span></div>}
      {mode === 'view'
        ? (
          <div className="noven-wb-docview">
            <MarkdownText text={load.text} labels={labels} pathImages={pathImages} />
          </div>
        )
        : (
          <textarea
            className="noven-wb-docedit"
            value={draft}
            onChange={e => { setDraft(e.target.value) }}
            onBlur={() => { if (dirty && save !== 'conflict') saveNow(load.text) }}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveNow(load.text) }
            }}
            spellCheck={false}
          />
        )}
    </div>
  )
}
