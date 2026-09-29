/**
 * The 工作台 sidebar view — the ported ProjectNavigation launcher: one row per
 * registered workbench (book glyph, title, 进入创作空间), each expanding into
 * its resource tree. Clicking a row enters the 创作空间 (the main canvas);
 * tree files open in the sidebar editor. The registry is live: what the AI
 * tools write appears without a manual refresh.
 * @module noven-workbench/client/WorkbenchTab
 */
import { useCallback, useEffect, useState } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { cutTerminalOnce, PANEL_ID } from './index.tsx'
import type { WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { ResourceTree } from './ResourceTree.tsx'
import type { ImageStageTranslate } from './ImageStage.tsx'

/** What the tab component binds beyond the sidebar's own props. */
export interface WorkbenchTabProps extends TabComponentProps {
  readonly api: WorkbenchApi
  readonly t: ImageStageTranslate
  /** Enter the 创作空间 for a workbench id (select + open the canvas panel). */
  readonly enterStudio: (workbenchId: string) => void
}

/**
 * Render the workbench navigation view.
 * @param props - the sidebar's tab props, plus this plugin's API face and copy.
 * @returns the view.
 */
export function WorkbenchTab(props: WorkbenchTabProps) {
  const { t, api, scope, onOpenFile, enterStudio } = props
  const sessionId = scope.sessionId as SessionId
  const [records, setRecords] = useState<readonly WorkbenchRecordView[] | undefined>(undefined)
  const [registryFailed, setRegistryFailed] = useState(false)
  const [expandedTreeId, setExpandedTreeId] = useState<string | null>(null)

  useEffect(() => {
    cutTerminalOnce(props.store)
  }, [props.store])

  const reloadRegistry = useCallback((signal: AbortSignal): void => {
    void api.readRegistry(sessionId, signal).then(result => {
      if (signal.aborted) return
      if (result.ok) { setRecords(result.value); setRegistryFailed(false) }
      else setRegistryFailed(true)
    }, () => {
      if (!signal.aborted) setRegistryFailed(true)
    })
  }, [api, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    setRecords(undefined)
    reloadRegistry(controller.signal)
    return () => { controller.abort() }
  }, [reloadRegistry])

  // Live registry: what the tools register appears without a manual refresh.
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        for await (const kind of api.watchPath(sessionId, '.noven', controller.signal)) {
          if (kind === 'change') reloadRegistry(controller.signal)
        }
      } catch { /* watch unavailable — the view lists what it already has */ }
    })()
    return () => { controller.abort() }
  }, [api, sessionId, reloadRegistry])

  const visible = (records ?? []).filter(record => record.visible)

  /** A tree row's open: absolute path, as the sidebar editor expects. */
  const openFile = (rel: string): void => {
    const root = scope.cwd
    if (root === undefined || onOpenFile === undefined) return
    onOpenFile(`${root}/${rel}`)
  }

  /** Launcher click: expand this workbench's tree and enter the 创作空间. */
  const launch = (id: string): void => {
    setExpandedTreeId(current => current === id ? current : id)
    enterStudio(id)
  }

  return (
    <div className="noven-wb-sidebar">
      <div className="noven-wb-sidebar-heading">
        <span>{t('tab.title')}</span>
        <button
          type="button"
          className="noven-wb-btn"
          onClick={() => {
            const controller = new AbortController()
            setExpandedTreeId(null)
            reloadRegistry(controller.signal)
          }}
        >
          {t('refresh')}
        </button>
      </div>
      {registryFailed && <span className="noven-wb-error">{t('loadFailed')}</span>}
      {records !== undefined && visible.length === 0 && !registryFailed && (
        <span className="noven-wb-note">{t('empty.noRegistry')}</span>
      )}
      <div className="noven-wb-launcher-list" role="list">
        {visible.map(record => (
          <div className="noven-wb-launcher" role="listitem" key={record.id} data-panel={PANEL_ID}>
            <button
              type="button"
              className="noven-wb-launcher-main"
              data-active={expandedTreeId === record.id}
              aria-expanded={expandedTreeId === record.id}
              onClick={() => { launch(record.id) }}
            >
              {bookGlyphInline()}
              <span><strong>{record.title}</strong><small>{t('launcher.enter')}</small></span>
              <span className="noven-wb-tree-chevron" data-open={expandedTreeId === record.id}>›</span>
            </button>
            {expandedTreeId === record.id && (
              <ResourceTree sessionId={sessionId} api={api} root={record.folder} selectedPath={undefined} onOpenFile={(rel, _image) => { openFile(rel) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The launcher row's glyph at its fixed inline size. */
function bookGlyphInline() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="noven-wb-launcher-book">
      <path d="M12 6.5C10.4 4.9 8.2 4.2 5 4.2c-.6 0-1 .4-1 1v11.3c0 .6.4 1 1 1 3.2 0 5.4.7 7 2.3 1.6-1.6 3.8-2.3 7-2.3.6 0 1-.4 1-1V5.2c0-.6-.4-1-1-1-3.2 0-5.4.7-7 2.3Z" />
      <path d="M12 6.5v13.3" />
    </svg>
  )
}
