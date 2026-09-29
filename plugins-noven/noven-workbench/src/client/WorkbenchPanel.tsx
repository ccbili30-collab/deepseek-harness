/**
 * The 工作台 main panel — the ported shape of the original desktop's sidebar
 * workbench mode: a launcher rail (one row per registered workbench, each
 * expandable into its resource tree) beside the selected workbench's content
 * (the gallery grid, and the staged image with annotation and color picking).
 *
 * The panel is root-scoped like the Plugins page; the workbenches it shows are
 * the current Session's — the session whose workspace the tools registered
 * folders into.
 * @module noven-workbench/client/WorkbenchPanel
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ImageStage } from './ImageStage.tsx'
import { pinnedFirst } from './api.ts'
import type { FolderView, WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { ResourceTree } from './ResourceTree.tsx'

/** One folder's load state, kept per workbench id. */
type FolderState = FolderView | 'loading' | 'failed'

/** What the panel's registration injects beside the standard props. */
export interface WorkbenchPanelInjected {
  readonly api: WorkbenchApi
  /** Open a document in the right sidebar's standard file viewer. */
  readonly openDocument: (sessionId: SessionId, rel: string) => void
}

/** Props the framework and the registration bind for the panel. */
export type WorkbenchPanelProps =
  & PropsRuntime<'main'>
  & PropsLocale<'novenWorkbench'>
  & WorkbenchPanelInjected

/** The session currently holding the main view, per the layout's own rule. */
function currentSessionOf(byId: Record<string, { retainedBy?: { mainView?: number } } | undefined>): SessionId | undefined {
  return (Object.entries(byId).find(([, row]) => (row?.retainedBy?.mainView ?? 0) > 0)?.[0] as SessionId | undefined)
}

/**
 * Render the workbench panel.
 * @param props - locale copy, the API face, and the document opener.
 * @returns the panel.
 */
export function WorkbenchPanel(props: WorkbenchPanelProps) {
  const { t, api } = props
  const sessionId = props.useSessions(state => currentSessionOf(state.byId))
  const cwd = props.useSessions(state => {
    const current = currentSessionOf(state.byId)
    return current === undefined ? undefined : state.byId[current]?.cwd
  })
  const [records, setRecords] = useState<readonly WorkbenchRecordView[] | undefined>(undefined)
  const [registryFailed, setRegistryFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedTreeId, setExpandedTreeId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Record<string, FolderState>>({})
  const [stage, setStage] = useState<string | null>(null)

  const reloadRegistry = useCallback((signal: AbortSignal): void => {
    if (sessionId === undefined) return
    void api.readRegistry(sessionId, signal).then(result => {
      if (signal.aborted) return
      if (result.ok) { setRecords(result.value); setRegistryFailed(false) }
      else setRegistryFailed(true)
    }, () => {
      if (!signal.aborted) setRegistryFailed(true)
    })
  }, [api, sessionId])

  useEffect(() => {
    if (sessionId === undefined) return
    const controller = new AbortController()
    setRecords(undefined)
    setFolders({})
    reloadRegistry(controller.signal)
    return () => { controller.abort() }
  }, [reloadRegistry, sessionId])

  // Live registry: what the tools register appears without a manual refresh.
  useEffect(() => {
    if (sessionId === undefined) return
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const kind of api.watchPath(sessionId, '.noven', controller.signal)) {
          if (kind === 'change') reloadRegistry(controller.signal)
        }
      } catch { /* watch unavailable — the refresh button remains */ }
    })()
    return () => { controller.abort() }
  }, [api, sessionId, reloadRegistry])

  const visible = (records ?? []).filter(record => record.visible)
  const selected = visible.find(record => record.id === selectedId) ?? visible[0]

  useEffect(() => {
    if (selected === undefined) return
    if (folders[selected.id] !== undefined) return
    const controller = new AbortController()
    setFolders(current => ({ ...current, [selected.id]: 'loading' }))
    void api.listFolder(sessionId!, selected.folder, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setFolders(current => ({ ...current, [selected.id]: result.ok ? result.value : 'failed' }))
    }, () => {
      if (controller.signal.aborted) return
      setFolders(current => ({ ...current, [selected.id]: 'failed' }))
    })
    return () => { controller.abort() }
  }, [selected, api, sessionId, folders])

  // The selected folder is live: images the tools drop in appear as they land.
  useEffect(() => {
    if (selected === undefined || sessionId === undefined) return
    const controller = new AbortController()
    const id = selected.id
    void (async () => {
      try {
        for await (const kind of api.watchPath(sessionId, selected.folder, controller.signal)) {
          if (kind === 'change') setFolders(current => {
            if (current[id] === undefined) return current
            const next = { ...current }
            delete next[id]
            return next
          })
        }
      } catch { /* folder gone or watch unavailable */ }
    })()
    return () => { controller.abort() }
  }, [selected?.id, selected?.folder, api, sessionId])

  /** The authenticated file URL for one workspace-relative image. */
  const mediaUrlOf = (rel: string): string | undefined =>
    cwd === undefined ? undefined : new URL(`api/file?path=${encodeURIComponent(`${cwd}/${rel}`)}`, document.baseURI).href

  /** A file row from the tree or the grid: images stage here, documents open in the viewer. */
  const openFile = (rel: string, image: boolean): void => {
    if (image) setStage(rel)
    else if (sessionId !== undefined) props.openDocument(sessionId, rel)
  }

  const launch = (record: WorkbenchRecordView): void => {
    setSelectedId(record.id)
    setStage(null)
    setExpandedTreeId(current => current === record.id ? null : record.id)
  }

  return (
    <div className="noven-wb-panel">
      <div className="noven-wb-rail" aria-label={t('panel')}>
        <div className="noven-wb-rail-heading">
          <span>{t('panel')}</span>
          <button
            type="button"
            className="noven-wb-btn"
            onClick={() => {
              if (sessionId === undefined) return
              const controller = new AbortController()
              setFolders({})
              setExpandedTreeId(null)
              reloadRegistry(controller.signal)
            }}
          >
            {t('refresh')}
          </button>
        </div>
        {sessionId === undefined && <span className="noven-wb-note">{t('hint.selectSession')}</span>}
        {sessionId !== undefined && records !== undefined && visible.length === 0 && !registryFailed && (
          <span className="noven-wb-note">{t('empty.noRegistry')}</span>
        )}
        {registryFailed && <span className="noven-wb-error">{t('loadFailed')}</span>}
        <div className="noven-wb-launcher-list" role="list">
          {visible.map(record => (
            <div className="noven-wb-launcher" role="listitem" key={record.id}>
              <button
                type="button"
                className="noven-wb-launcher-main"
                data-active={selected?.id === record.id}
                aria-expanded={expandedTreeId === record.id}
                onClick={() => { launch(record) }}
              >
                <svg className="noven-wb-launcher-book" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 6.5C10.4 4.9 8.2 4.2 5 4.2c-.6 0-1 .4-1 1v11.3c0 .6.4 1 1 1 3.2 0 5.4.7 7 2.3 1.6-1.6 3.8-2.3 7-2.3.6 0 1-.4 1-1V5.2c0-.6-.4-1-1-1-3.2 0-5.4.7-7 2.3Z" />
                  <path d="M12 6.5v13.3" />
                </svg>
                <span><strong>{record.title}</strong><small>{t('launcher.enter')}</small></span>
                <span className="noven-wb-tree-chevron" data-open={expandedTreeId === record.id}>›</span>
              </button>
              {expandedTreeId === record.id && sessionId !== undefined && (
                <ResourceTree sessionId={sessionId} api={api} root={record.folder} selectedPath={stage ?? undefined} onOpenFile={openFile} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="noven-wb-content">
        {stage !== null && selected !== undefined && (() => {
          const url = mediaUrlOf(stage)
          return url === undefined ? null : (
            <ImageStage
              t={t}
              sessionId={sessionId!}
              imageRel={stage}
              url={url}
              api={api}
              onClose={() => { setStage(null) }}
            />
          )
        })()}
        {stage === null && selected !== undefined && sessionId !== undefined && (() => {
          const folder = folders[selected.id]
          if (folder === 'loading' || folder === undefined) return <span className="noven-wb-note">…</span>
          if (folder === 'failed') return <span className="noven-wb-error">{t('loadFailed')}</span>
          const pinned = new Set(selected.pinned ?? [])
          const orderedImages = pinnedFirst(folder.images, selected.pinned)
          return (
            <div className="noven-wb-showroom">
              {orderedImages.length === 0
                ? <span className="noven-wb-note">{t('empty.noImages')}</span>
                : (
                  <div className="noven-wb-grid">
                    {orderedImages.map(rel => (
                      <button
                        key={rel}
                        type="button"
                        className="noven-wb-thumb"
                        data-pinned={pinned.has(rel)}
                        title={pinned.has(rel) ? `${t('pinned')} · ${rel}` : rel}
                        onClick={() => { setStage(rel) }}
                      >
                        <img src={mediaUrlOf(rel)} alt={rel} loading="lazy" draggable={false} />
                      </button>
                    ))}
                  </div>
                )}
              {folder.docs.length > 0 && (
                <div className="noven-wb-docs" aria-label={t('docs')}>
                  {folder.docs.map(rel => (
                    <button key={rel} type="button" className="noven-wb-doc" title={rel} onClick={() => { openFile(rel, false) }}>
                      {selected.home !== undefined && rel === `${selected.folder}/${selected.home}` ? '★ ' : ''}{rel.split('/').pop()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
        {stage === null && selected === undefined && records !== undefined && visible.length === 0 && (
          <div className="noven-wb-showroom"><span className="noven-wb-note">{t('empty.noRegistry')}</span></div>
        )}
      </div>
    </div>
  )
}
