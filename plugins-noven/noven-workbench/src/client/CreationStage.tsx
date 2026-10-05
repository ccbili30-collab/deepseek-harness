/**
 * The 创作空间 main panel — the ported `CreationStage`: the workbench canvas
 * the launcher opens. 展览 mode is the ported exhibition (hero, groups,
 * documents, images); an image card stages it with the annotation overlay
 * and color picker; a document card opens in the sidebar editor, which
 * white-gloves the render/edit modes the legacy canvas owned. The panel
 * reads the shared selection the sidebar launcher writes.
 * @module noven-workbench/client/CreationStage
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ImageStage } from './ImageStage.tsx'
import type { ImageStageTranslate } from './ImageStage.tsx'
import { buildWorkbenchExhibition, walkExhibition } from './exhibition.ts'
import type { ExhibitionEntry } from './exhibition.ts'
import { joinRel, pinnedFirst } from './api.ts'
import type { WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { workbenchSelection } from './selection.ts'

/** Props both hosts (main panel, fallback sidebar tab) bind for the canvas. */
export interface CreationStageProps {
  readonly t: ImageStageTranslate
  readonly api: WorkbenchApi
  /** Open a workspace-relative document in the sidebar editor (its render/edit is white-gloved there). */
  readonly openDocument: (sessionId: SessionId, cwd: string, rel: string) => void
  /** The session to read; the canvas renders the pick-a-session note without one. */
  readonly sessionId: SessionId | undefined
  readonly cwd: string | undefined
}

/**
 * Render the workbench canvas. Pure: the host resolves the session; the
 * selected workbench comes from the shared selection store.
 * @param props - locale copy, the API face, the document opener, and the session.
 * @returns the canvas.
 */
export function CreationStage(props: CreationStageProps) {
  const { t, api, sessionId, cwd } = props
  const selectedId = useSyncExternalStore(workbenchSelection.subscribe, () => workbenchSelection.get(sessionId))
  const [records, setRecords] = useState<readonly WorkbenchRecordView[]>([])
  const [staged, setStaged] = useState<string | null>(null)
  const [entries, setEntries] = useState<readonly ExhibitionEntry[] | undefined>(undefined)
  const [walkFailed, setWalkFailed] = useState(false)

  useEffect(() => {
    if (sessionId === undefined) return
    const controller = new AbortController()
    void api.readRegistry(sessionId, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setRecords(result.ok ? result.value : [])
    }, () => {
      if (!controller.signal.aborted) setRecords([])
    })
    return () => { controller.abort() }
  }, [api, sessionId])

  const record = records.find(candidate => candidate.id === selectedId) ?? records.find(candidate => candidate.visible)

  const reload = useCallback((signal: AbortSignal): void => {
    if (record === undefined || sessionId === undefined) return
    setEntries(undefined)
    setWalkFailed(false)
    void walkExhibition(api, sessionId, record.folder, signal).then(walked => {
      if (signal.aborted) return
      setEntries(walked.entries)
    }, () => {
      if (!signal.aborted) setWalkFailed(true)
    })
  }, [api, record, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
    return () => { controller.abort() }
  }, [reload])

  // Live folder: images and documents the tools drop in appear as they land.
  useEffect(() => {
    if (record === undefined || sessionId === undefined) return
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const kind of api.watchPath(sessionId, record.folder, controller.signal)) {
          if (kind === 'change') reload(controller.signal)
        }
      } catch { /* watch unavailable */ }
    })()
    return () => { controller.abort() }
  }, [api, record, sessionId, reload])

  if (record === undefined || sessionId === undefined || cwd === undefined) {
    return <div className="noven-wb-canvas"><span className="noven-wb-note">{t('hint.selectSession')}</span></div>
  }

  /** The authenticated file URL for one workspace-relative image. */
  const mediaUrlOf = (rel: string): string =>
    new URL(`api/file?path=${encodeURIComponent(`${cwd}/${rel}`)}`, document.baseURI).href

  const exhibition = entries === undefined ? undefined : buildWorkbenchExhibition(entries)
  const orderedImages = exhibition === undefined ? [] : pinnedFirst(exhibition.images.map(entry => entry.rel), record.pinned)
  const heroRel = orderedImages[0]
  const documentOf = (rel: string): ExhibitionEntry | undefined =>
    exhibition?.documents.find(entry => entry.rel === rel)

  if (staged !== null) {
    return (
      <div className="noven-wb-canvas">
        <ImageStage
          t={t as ImageStageTranslate}
          sessionId={sessionId}
          imageRel={staged}
          url={mediaUrlOf(staged)}
          api={api}
          onClose={() => { setStaged(null) }}
        />
      </div>
    )
  }

  return (
    <div className="noven-wb-canvas">
      <header className="noven-wb-canvas-header">
        <strong>{record.title}</strong>
        <div className="noven-wb-canvas-actions">
          <button type="button" className="noven-wb-btn" onClick={() => { const controller = new AbortController(); reload(controller.signal) }}>{t('refresh')}</button>
        </div>
      </header>
      {exhibition === undefined && !walkFailed && <span className="noven-wb-note">…</span>}
      {walkFailed && <span className="noven-wb-error">{t('loadFailed')}</span>}
      {exhibition !== undefined && (
        <div className="noven-wb-exhibition">
          <header><span>{t('stage.exhibitionHeader')}</span><small>{t('stage.exhibitionCount')
            .replace('{groups}', String(exhibition.groups.length))
            .replace('{documents}', String(exhibition.documents.length))
            .replace('{images}', String(orderedImages.length))}</small></header>
          {heroRel !== undefined && (
            <button type="button" className="noven-wb-exhibition-hero" onClick={() => { setStaged(heroRel) }}>
              <img src={mediaUrlOf(heroRel)} alt={heroRel} />
              <strong>{heroRel.split('/').pop()}</strong>
            </button>
          )}
          {exhibition.groups.length > 0 && (
            <section><h2>{t('stage.groups')}</h2><div className="noven-wb-exhibition-groups">
              {exhibition.groups.map(name => <span key={name}>{name}</span>)}
            </div></section>
          )}
          {exhibition.documents.length > 0 && (
            <section><h2>{t('stage.documents')}</h2><div className="noven-wb-exhibition-cards">
              {exhibition.documents.map(entry => (
                <button key={entry.rel} type="button" title={entry.rel} onClick={() => { props.openDocument(sessionId, cwd, entry.rel) }}>
                  <strong>{entry.name}</strong>
                  <small>{entry.rel}</small>
                </button>
              ))}
            </div></section>
          )}
          {orderedImages.length > 0 && (
            <section><h2>{t('stage.images')}</h2><div className="noven-wb-exhibition-cards">
              {orderedImages.map(rel => {
                const homeMark = record.home !== undefined && rel === joinRel(record.folder, record.home)
                return (
                  <button key={rel} type="button" title={documentOf(rel)?.name ?? rel} onClick={() => { setStaged(rel) }}>
                    <img src={mediaUrlOf(rel)} alt={rel} loading="lazy" />
                    <strong>{(homeMark ? '★ ' : '')}{rel.split('/').pop()}</strong>
                    <small>{rel}</small>
                  </button>
                )
              })}
            </div></section>
          )}
          {exhibition.documents.length === 0 && orderedImages.length === 0 && (
            <div className="noven-wb-stage-empty">
              <h1>{t('stage.empty')}</h1>
              <p>{t('stage.emptyHint')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
