/**
 * The work-mode stage (设计稿 06/06b/06c): the canvas's content body —
 * a top bar carrying the full-path breadcrumb (its tail opens the floating
 * tree), the bound-card chip, the 首页/展览 segment, the staged file's icon
 * actions, the drawer/canvas side toggle, and ‹ 收起. The resource tree's
 * permanent home is the drawer's upper zone (DrawerNav); the dropdown here
 * is the same shared rows for quick in-canvas picking. Positioning — the
 * canvas's inset against the drawer — belongs to the shell-overlay host.
 * @module noven-workbench/client/WorkbenchStage
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { BUILTIN_FILES, isHtmlEntry, isImageName, isTextCandidate, joinRel, pinnedFirst } from './api.ts'
import { DocStage } from './DocStage.tsx'
import { buildWorkbenchExhibition } from './exhibition.ts'
import type { ExhibitionEntry } from './exhibition.ts'
import { HtmlStage } from './HtmlStage.tsx'
import { ImageStage } from './ImageStage.tsx'
import type { ImageStageTranslate } from './ImageStage.tsx'
import { MapStage } from './MapStage.tsx'
import type { NovenWorkbenchKey } from './locales.ts'
import { stageNodes, StageTreeRows, stem, useBoundCard, useWorkbenchEntries, useWorkbenchRegistry } from './nav-tree.tsx'
import { workbenchSelection } from './selection.ts'
import { injectGalleryStyles } from './style.ts'
import { workbenchStage } from './stage.ts'
import type { StageMode } from './stage.ts'

/** Cross-plugin card-open trigger; noven-shell listens and opens the editor. */
export const CARD_OPEN_EVENT = 'noven:card-open'

/** Props the canvas body binds for the stage. */
export interface WorkbenchStageProps {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly api: WorkbenchApi
  /** The session whose workspace the stage reads; undefined renders the note. */
  readonly sessionId: SessionId | undefined
  readonly cwd: string | undefined
  /** Close this canvas surface's page (the tab itself). */
  readonly close: () => void
  /** Park the canvas: the surface hides toward the drawer while this page stays mounted. */
  readonly park: () => void
}



/**
 * Render the stage for one session: top bar, the tree's dropdown state, and
 * the routed canvas content.
 * @param props - locale copy, API face, session address, and the editor opener.
 * @returns the stage surface.
 */
export function WorkbenchStage(props: WorkbenchStageProps) {
  const { t, api, sessionId, cwd } = props
  const selectedId = useSyncExternalStore(workbenchSelection.subscribe, () => workbenchSelection.get(sessionId))
  useSyncExternalStore(workbenchStage.subscribe, workbenchStage.getSnapshot)
  const records = useWorkbenchRegistry(api, sessionId)
  const [treeOpen, setTreeOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [annotate, setAnnotate] = useState(false)
  const [docEditing, setDocEditing] = useState(false)
  const card = useBoundCard(api, sessionId)

  const record = records?.find(candidate => candidate.id === selectedId)
    ?? records?.find(candidate => candidate.visible)
  const { entries } = useWorkbenchEntries(api, sessionId, record)

  const view = record === undefined ? workbenchStage.view('') : workbenchStage.view(record.id)
  const patch = (next: Parameters<typeof workbenchStage.patch>[1]): void => {
    if (record !== undefined) workbenchStage.patch(record.id, next)
  }

  /** The staged file: an explicit pick, else the record's home inside home mode. */
  const builtin = record?.id === BUILTIN_FILES.id
  const effectiveMode = builtin && view.mode === 'home' ? 'files' : view.mode
  const stagedRel = view.selected ?? (effectiveMode === 'home' && record?.home !== undefined
    ? joinRel(record.folder, record.home) : null)
  const stagedImage = stagedRel !== null && isImageName(stagedRel)
  const stagedText = stagedRel !== null && isTextCandidate(stagedRel)
  // The tag may be gone behind a recycled module whose injection flag still
  // reads true; mount-time re-entry keeps the stage dressed.
  useEffect(() => { injectGalleryStyles() }, [])

  const close = (): void => { props.close() }
  const pick = (rel: string): void => {
    patch({ selected: rel })
    setTreeOpen(false)
    setQuery('')
    setAnnotate(false)
    setDocEditing(false)
  }
  const segment = (mode: StageMode): void => {
    patch({ mode, selected: null })
    setAnnotate(false)
    setDocEditing(false)
  }

  /** Crumbs inside the workbench: directory segments between title and tail. */
  const innerCrumbs = useMemo(() => {
    if (stagedRel === null || record === undefined) return []
    if (record.id === BUILTIN_FILES.id) return stagedRel.split('/').slice(0, -1)
    if (!stagedRel.startsWith(`${record.folder}/`)) return []
    return stagedRel.slice(record.folder.length + 1).split('/').slice(0, -1)
  }, [stagedRel, record])

  // Long chains fold their head into a … crumb; the last two dirs and the tail
  // always stay visible. A fresh file pick folds back.
  const [crumbsExpanded, setCrumbsExpanded] = useState(false)
  useEffect(() => { setCrumbsExpanded(false) }, [stagedRel])
  const crumbsFolded = !crumbsExpanded && innerCrumbs.length > 2
  const shownCrumbs = crumbsFolded ? innerCrumbs.slice(-2) : innerCrumbs

  const tailLabel = stagedRel !== null
    ? (effectiveMode === 'home' && view.selected === null ? `${t('stage.home')} · ${stem(stagedRel)}` : stem(stagedRel))
    : effectiveMode === 'exhibition' ? t('stage.exhibition') : effectiveMode === 'files' ? t('stage.allFiles') : t('stage.home')

  if (sessionId === undefined || cwd === undefined) {
    return <div className="noven-stage-main"><div className="noven-wb-stage-empty"><h1>{t('hint.selectSession')}</h1></div></div>
  }
  if (record === undefined) {
    return (
      <div className="noven-stage-main">
        <StageTopbar t={t} crumb={t('stage.emptyTitle')} onPark={() => { props.park() }} />
        <div className="noven-wb-stage-empty"><h1>{t('empty.noRegistry')}</h1></div>
      </div>
    )
  }

  const mediaUrl = (rel: string): string =>
    new URL(`api/file?path=${encodeURIComponent(`${cwd}/${rel}`)}`, document.baseURI).href

  return (
    <div className="noven-stage-main">
      <header className="noven-stage-topbar">
        <nav className="noven-stage-crumbs">
          <button type="button" className="noven-stage-crumb" onClick={close}>{t('stage.library')}</button>
          <span className="noven-stage-sep">/</span>
          <button type="button" className="noven-stage-crumb" onClick={() => { patch({ selected: null, mode: builtin ? 'files' : 'home' }) }}>{record.id === BUILTIN_FILES.id ? t('builtin.files') : record.title}</button>
          {crumbsFolded && (
            <span className="noven-stage-crumb-pair">
              <span className="noven-stage-sep">/</span>
              <button type="button" className="noven-stage-crumb noven-stage-crumb-more"
                title={innerCrumbs.slice(0, -2).join(' / ')}
                onClick={() => { setCrumbsExpanded(true) }}>…</button>
            </span>
          )}
          {shownCrumbs.map(crumb => (
            <span key={crumb} className="noven-stage-crumb-pair">
              <span className="noven-stage-sep">/</span>
              <span className="noven-stage-crumb noven-stage-crumb-dir">{crumb}</span>
            </span>
          ))}
          <span className="noven-stage-sep">/</span>
          <button type="button" className="noven-stage-crumb noven-stage-crumb-tail"
            aria-expanded={treeOpen} onClick={() => { setTreeOpen(o => !o) }}>
            {tailLabel} <span className="noven-wb-tree-chevron" data-open={treeOpen}>▾</span>
          </button>
        </nav>
        {card !== undefined && (
          <button type="button" className="noven-stage-card-chip"
            title={card.id}
            onClick={() => { window.dispatchEvent(new CustomEvent(CARD_OPEN_EVENT, { detail: { cardId: card.id } })) }}>
            {card.kind === 'world' ? t('chip.kind.world')
              : card.kind === 'character' ? t('chip.kind.character') : t('chip.kind.other')}
            {' · '}{card.name} ↗
          </button>
        )}
        {view.selected === null && !builtin && (
          <div className="noven-stage-segment" role="tablist">
            {(['home', 'exhibition'] as const).map(mode => (
              <button key={mode} type="button" role="tab" data-active={effectiveMode === mode}
                aria-selected={effectiveMode === mode}
                onClick={() => { segment(mode) }}>
                {mode === 'home' ? t('stage.home') : t('stage.exhibition')}
              </button>
            ))}
          </div>
        )}
        <div className="noven-stage-actions">
          {stagedImage && (
            <button type="button" className="noven-stage-iconbtn" data-active={annotate}
              title={t('mode.annotate')} aria-label={t('mode.annotate')}
              onClick={() => { setAnnotate(a => !a) }}>{brushIcon()}</button>
          )}
          {stagedText && (
            <button type="button" className="noven-stage-iconbtn" data-active={docEditing || undefined}
              title={docEditing ? t('doc.view') : t('stage.edit')}
              aria-label={docEditing ? t('doc.view') : t('stage.edit')}
              onClick={() => { setDocEditing(e => !e) }}>{pencilIcon()}</button>
          )}
          <button type="button" className="noven-stage-iconbtn" title={t('stage.collapse')}
            aria-label={t('stage.collapse')}
            onClick={() => { props.park() }}>{collapseIcon()}</button>
        </div>
      </header>
      {treeOpen && (
        <div className="noven-stage-tree-pop">
          <div className="noven-stage-tree-tools">
            <input value={query} placeholder={t('stage.treeSearch')}
              onChange={e => { setQuery(e.target.value) }} />
          </div>
          <StageTreeRows t={t} record={record}
            nodes={stageNodes(entries, record.folder, record.home === undefined ? undefined : joinRel(record.folder, record.home))} view={view}
            query={query} onPick={pick} onHome={() => { patch({ mode: 'home', selected: null }); setTreeOpen(false) }}
            onAllFiles={() => { segment('files'); setTreeOpen(false) }} />
        </div>
      )}
      <div className="noven-stage-canvas" data-bleed={stagedRel !== null && isHtmlEntry(stagedRel) || undefined}>
        <StageBody key={`${record.id}:${stagedRel ?? effectiveMode}`}
          t={t} api={api} sessionId={sessionId} cwd={cwd} record={record}
          stagedRel={stagedRel} mode={effectiveMode} annotate={annotate}
          docEditing={docEditing}
          entries={entries} mediaUrl={mediaUrl} onPick={pick} />
      </div>
    </div>
  )
}

/** The bare top bar for the no-record/no-session states. */
function StageTopbar({ t, crumb, onPark }: { readonly t: WorkbenchStageProps['t']; readonly crumb: string; readonly onPark: () => void }) {
  return (
    <header className="noven-stage-topbar">
      <nav className="noven-stage-crumbs">
        <span className="noven-stage-crumb">{t('stage.library')}</span>
        <span className="noven-stage-sep">/</span>
        <span className="noven-stage-crumb noven-stage-crumb-tail">{crumb}</span>
      </nav>
      <div className="noven-stage-actions">
        <button type="button" className="noven-stage-iconbtn" aria-label={t('stage.collapse')}
          onClick={onPark}>{collapseIcon()}</button>
      </div>
    </header>
  )
}

/** The routed canvas: staged file → its renderer; else the active segment. */
function StageBody(props: {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly api: WorkbenchApi
  readonly sessionId: SessionId
  readonly cwd: string
  readonly record: WorkbenchRecordView
  readonly stagedRel: string | null
  readonly mode: StageMode
  readonly annotate: boolean
  readonly docEditing: boolean
  readonly entries: readonly ExhibitionEntry[] | undefined
  readonly mediaUrl: (rel: string) => string
  readonly onPick: (rel: string) => void
}) {
  const { t, api, sessionId, cwd, record, stagedRel, mediaUrl } = props

  if (stagedRel !== null) {
    // A bound frame takes over the staged file's rendering entirely.
    const frameRel = record.views?.[stagedRel]
    if (frameRel !== undefined) {
      return <HtmlStage t={t} sessionId={sessionId} rel={frameRel} src={stagedRel} />
    }
    if (isImageName(stagedRel)) {
      return (
        <ImageStage
          t={t as ImageStageTranslate}
          sessionId={sessionId}
          imageRel={stagedRel}
          url={mediaUrl(stagedRel)}
          api={api}
          initialMode={props.annotate ? 'annotate' : 'view'}
        />
      )
    }
    if (isHtmlEntry(stagedRel)) {
      const dir = stagedRel.slice(0, Math.max(0, stagedRel.lastIndexOf('/')))
      return <HtmlOrMap t={t} api={api} sessionId={sessionId} rel={stagedRel} dir={dir} mediaUrl={mediaUrl} />
    }
    if (isTextCandidate(stagedRel)) {
      return <DocStage t={t} sessionId={sessionId} cwd={cwd} rel={stagedRel} api={api} mediaUrl={mediaUrl}
        mode={props.docEditing ? 'edit' : 'view'} />
    }
    return (
      <div className="noven-wb-stage-empty">
        <h1>{stem(stagedRel)}</h1>
        <p>{stagedRel}</p>
        <p>{t('stage.unsupportedHint')}</p>
      </div>
    )
  }

  if (props.mode === 'files') {
    return (
      <div className="noven-stage-files">
        <StageTreeRows t={t} record={record}
          nodes={stageNodes(props.entries, record.folder, record.home === undefined ? undefined : joinRel(record.folder, record.home))}
          view={{ mode: 'files', selected: null }} query=""
          onPick={props.onPick} onHome={() => { props.onPick(record.home === undefined ? '' : joinRel(record.folder, record.home)) }}
          onAllFiles={() => { /* already here */ }} />
      </div>
    )
  }

  return <StageExhibition {...props} />
}

/**
 * One HTML file's renderer pick: a map-manifest sibling means the draw-map
 * stage, anything else stages the page itself in the sandboxed frame.
 */
function HtmlOrMap(props: {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly api: WorkbenchApi
  readonly sessionId: SessionId
  readonly rel: string
  readonly dir: string
  readonly mediaUrl: (rel: string) => string
}) {
  const { t, api, sessionId, dir, rel, mediaUrl } = props
  const [isMap, setIsMap] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    const controller = new AbortController()
    void api.readText(sessionId, joinRel(dir, 'map-manifest.json'), controller.signal).then(result => {
      if (controller.signal.aborted) return
      setIsMap(result.ok && result.value !== undefined)
    }, () => {
      if (!controller.signal.aborted) setIsMap(false)
    })
    return () => { controller.abort() }
  }, [api, sessionId, dir])
  if (isMap === undefined) return <div className="noven-wb-stage-empty"><h1>…</h1></div>
  if (isMap) return <MapStage t={t} sessionId={sessionId} dir={dir} mediaUrl={mediaUrl} api={api} />
  return <HtmlStage t={t} sessionId={sessionId} rel={rel} />
}

/** The 展览 segment: the ported exhibition grid, cards staging inline. */
function StageExhibition(props: Parameters<typeof StageBody>[0]) {
  const { t, record, mediaUrl } = props
  const entries = props.entries
  const exhibition = entries === undefined ? undefined : buildWorkbenchExhibition(entries)
  const orderedImages = exhibition === undefined ? [] : pinnedFirst(exhibition.images.map(entry => entry.rel), record.pinned)
  const heroRel = orderedImages[0]

  if (exhibition === undefined) {
    return <div className="noven-wb-stage-empty"><h1>…</h1></div>
  }
  return (
    <div className="noven-wb-exhibition">
      {heroRel !== undefined && (
        <button type="button" className="noven-wb-exhibition-hero" onClick={() => { props.onPick(heroRel) }}>
          <img src={mediaUrl(heroRel)} alt={heroRel} />
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
            <button key={entry.rel} type="button" title={entry.rel} onClick={() => { props.onPick(entry.rel) }}>
              <strong>{entry.name}</strong>
              <small>{entry.rel}</small>
            </button>
          ))}
        </div></section>
      )}
      {orderedImages.length > 0 && (
        <section><h2>{t('stage.images')}</h2><div className="noven-wb-exhibition-cards">
          {orderedImages.map(rel => (
            <button key={rel} type="button" title={rel} onClick={() => { props.onPick(rel) }}>
              <img src={mediaUrl(rel)} alt={rel} loading="lazy" />
              <strong>{rel.split('/').pop()}</strong>
              <small>{rel}</small>
            </button>
          ))}
        </div></section>
      )}
      {exhibition.documents.length === 0 && orderedImages.length === 0 && (
        <div className="noven-wb-stage-empty">
          <h1>{t('stage.empty')}</h1>
          <p>{t('stage.emptyHint')}</p>
        </div>
      )}
    </div>
  )
}

/** Small inline icons for the stage's icon buttons. */
function collapseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  )
}
function brushIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4l6 6-9.5 9.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2L14 4Z" /><path d="M11 7l6 6" />
    </svg>
  )
}
function pencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l1.2-4.2L16.5 4.5a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20Z" /><path d="M14.5 6.5l3 3" />
    </svg>
  )
}
