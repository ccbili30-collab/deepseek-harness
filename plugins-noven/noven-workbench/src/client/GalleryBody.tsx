/**
 * The gallery tab's body: one chip per visible workbench, the selected one's
 * images as a grid (pinned first), its documents as chips, and one staged
 * image at a time through {@link ImageStage}. Registry and listings come
 * through the API face; document chips open in the standard file viewers.
 * @module noven-workbench/client/GalleryBody
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { ImageStage } from './ImageStage.tsx'
import { pinnedFirst } from './api.ts'
import type { FolderView, WorkbenchApi, WorkbenchRecordView } from './api.ts'

/** One folder's load state, kept per workbench id. */
type FolderState = FolderView | 'loading' | 'failed'

/** Props the framework and the registration bind for the body. */
export type GalleryBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'novenWorkbench'>
  & { readonly api: WorkbenchApi }

/**
 * Render the workbench gallery.
 * @param props - the seat's runtime props, locale copy, and the API face.
 * @returns the gallery.
 */
export function GalleryBody(props: GalleryBodyProps) {
  const { t, api, sessionId, useSessions, useTabInfo } = props
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const [records, setRecords] = useState<readonly WorkbenchRecordView[] | undefined>(undefined)
  const [registryFailed, setRegistryFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [folders, setFolders] = useState<Record<string, FolderState>>({})
  const [stage, setStage] = useState<string | null>(null)

  const reloadRegistry = useCallback((signal: AbortSignal): void => {
    void api.readRegistry(sessionId, signal).then(result => {
      if (signal.aborted) return
      if (result.ok) { setRecords(result.value); setRegistryFailed(false) }
      else setRegistryFailed(true)
    })
  }, [api, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    reloadRegistry(controller.signal)
    return () => { controller.abort() }
  }, [reloadRegistry])

  const visible = (records ?? []).filter(record => record.visible)
  const selected = visible.find(record => record.id === selectedId) ?? visible[0]

  useEffect(() => {
    if (selected === undefined) return
    if (folders[selected.id] !== undefined) return
    const controller = new AbortController()
    setFolders(current => ({ ...current, [selected.id]: 'loading' }))
    void api.listFolder(sessionId, selected.folder, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setFolders(current => ({ ...current, [selected.id]: result.ok ? result.value : 'failed' }))
    })
    return () => { controller.abort() }
  }, [selected, api, sessionId, folders])

  /** The authenticated file URL for one workspace-relative image. */
  const mediaUrlOf = (rel: string): string | undefined =>
    cwd === undefined ? undefined : new URL(`api/file?path=${encodeURIComponent(`${cwd}/${rel}`)}`, document.baseURI).href

  /** Open one document through the standard `dsh-resource://file` viewers. */
  const openDoc = (rel: string): void => {
    const encoded = rel.replaceAll('\\', '/').split('/').filter(part => part.length > 0).map(encodeURIComponent).join('/')
    useTabInfo().tab.actions.openResource(`dsh-resource://file/session/${encodeURIComponent(sessionId)}/${encoded}`)
  }

  if (stage !== null && selected !== undefined) {
    const url = mediaUrlOf(stage)
    if (url !== undefined) {
      return (
        <ImageStage
          t={t}
          sessionId={sessionId}
          imageRel={stage}
          url={url}
          api={api}
          onClose={() => { setStage(null) }}
        />
      )
    }
  }

  return (
    <div className="noven-wb-root">
      <div className="noven-wb-toolbar">
        {visible.length > 1 && (
          <div className="noven-wb-chips">
            {visible.map(record => (
              <button
                key={record.id}
                type="button"
                className="noven-wb-chip"
                data-active={selected?.id === record.id}
                onClick={() => { setSelectedId(record.id); setStage(null) }}
              >
                {record.title}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="noven-wb-btn"
          onClick={() => {
            const controller = new AbortController()
            setFolders({})
            reloadRegistry(controller.signal)
          }}
        >
          {t('refresh')}
        </button>
      </div>

      {records !== undefined && visible.length === 0 && !registryFailed && (
        <span className="noven-wb-note">{t('empty.noRegistry')}</span>
      )}
      {registryFailed && <span className="noven-wb-error">{t('loadFailed')}</span>}

      {selected !== undefined && (() => {
        const folder = folders[selected.id]
        if (folder === 'loading' || folder === undefined) return <span className="noven-wb-note">…</span>
        if (folder === 'failed') return <span className="noven-wb-error">{t('loadFailed')}</span>
        const pinned = new Set(selected.pinned ?? [])
        const orderedImages = pinnedFirst(folder.images, selected.pinned)
        return (
          <>
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
                  <button key={rel} type="button" className="noven-wb-doc" title={rel} onClick={() => { openDoc(rel) }}>
                    {selected.home !== undefined && rel === `${selected.folder}/${selected.home}` ? '★ ' : ''}{rel.split('/').pop()}
                  </button>
                ))}
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
