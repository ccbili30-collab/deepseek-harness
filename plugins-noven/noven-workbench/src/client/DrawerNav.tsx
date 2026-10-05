/**
 * The drawer's upper half: the resident workbench directory. Every
 * workbench — the built-in files floor first, then the registered rows —
 * is a persistent selector row; below the directory sits the selected
 * workbench's file tree. Selection and folder expansion are navigation
 * and stay inside the drawer; only leaf content (documents, images, home
 * pages) stages on the canvas.
 * @module noven-workbench/client/DrawerNav
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { BUILTIN_FILES, joinRel } from './api.ts'
import { bookGlyph } from './book-glyph.tsx'
import type { NovenWorkbenchKey } from './locales.ts'
import { folderIcon, stageNodes, StageTreeRows, useWorkbenchEntries, useWorkbenchRegistry } from './nav-tree.tsx'
import { workbenchSelection } from './selection.ts'
import { WORKBENCH_KIND, workbenchStage } from './stage.ts'

/** The drawer's workbench navigation for one session. */
export interface DrawerNavProps {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly api: WorkbenchApi
  readonly sessionId: SessionId | undefined
  readonly cwd: string | undefined
  /** The canvas surface face: content rows open the workbench on it. */
  readonly sidebarRight: Pick<ISidebarRight, 'openTab'>
  /** The mounted session's canvas surface — tells live rows from remembered ones. */
  readonly canvas: ISidebarRight['canvas']
  /**
   * The drawer's collapsed presentation: the zone draws the icon-only form of
   * the same rows so the rail keeps both halves of the expanded layout. A rail
   * pick stages the workbench on the canvas without unfolding the column.
   */
  readonly rail: boolean
}

/**
 * Render the resident workbench directory.
 * @param props - locale copy, the workspace face, and the session address.
 * @returns the directory plus per-workbench trees, or nothing before a session binds.
 */
export function DrawerNav(props: DrawerNavProps) {
  const { t, api, sessionId } = props
  const records = useWorkbenchRegistry(api, sessionId)
  useSyncExternalStore(workbenchStage.subscribe, workbenchStage.getSnapshot)
  const selectedId = useSyncExternalStore(workbenchSelection.subscribe, () => workbenchSelection.get(sessionId))
  // A row is live only while the workbench surface tops the canvas stack.
  const canvas = useSyncExternalStore(props.canvas.subscribe, props.canvas.getSnapshot)
  const record = records?.find(candidate => candidate.id === selectedId)
    ?? records?.find(candidate => candidate.visible)
  // One-shot presents: seed the seen timestamps on first load so only
  // requests that arrive while the UI is up raise the canvas.
  const presentSeen = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    if (records === undefined || sessionId === undefined) return
    if (presentSeen.current === null) {
      presentSeen.current = new Map(
        records.filter(r => r.present !== undefined).map(r => [`${sessionId}:${r.id}`, r.present!.at]),
      )
      return
    }
    for (const candidate of records) {
      if (candidate.present === undefined) continue
      const key = `${sessionId}:${candidate.id}`
      if (presentSeen.current.get(key) === candidate.present.at) continue
      presentSeen.current.set(key, candidate.present.at)
      workbenchSelection.set(sessionId, candidate.id)
      workbenchStage.patch(candidate.id, { selected: candidate.present.path })
      try { props.sidebarRight.openTab(WORKBENCH_KIND) }
      catch { /* surface unavailable — the pin still shows in the tree */ }
    }
  }, [records, sessionId, props.sidebarRight])

  if (sessionId === undefined || record === undefined) return null

  /** Stage content on the canvas: select it, then raise the workbench surface. */
  const stageIt = (workbenchId: string, rel: string | null, mode: 'home' | 'files'): void => {
    workbenchSelection.set(sessionId, workbenchId)
    workbenchStage.patch(workbenchId, { selected: rel, mode })
    // A rail pick keeps the column collapsed — the staged item shows on the
    // canvas beside it, the same surface the wide rows target.
    props.sidebarRight.openTab(WORKBENCH_KIND, props.rail ? { expandColumn: false } : undefined)
  }

  if (props.rail) {
    const live = canvas?.kind === WORKBENCH_KIND
    // rail 只放入口：工作台一个图标，点开它上画布——rail 是入口清单不是内容。
    return (
      <div className="noven-wbnav-rail">
        <button type="button" className="noven-wbnav-rail-row" title={record.title} aria-label={record.title}
          data-selected={live || undefined}
          onClick={() => { stageIt(record.id, null, 'home') }}>
          <span className="noven-wbnav-glyph" aria-hidden="true">{bookGlyph(13)}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="noven-wbnav" data-zone-grip="top">
      <div className="noven-wbnav-zone">{t('nav.zone')}</div>
      <div className="noven-wbnav-list">
        {records?.map(candidate => (
          <button key={candidate.id} type="button" className="noven-wbnav-wb-row"
            data-active={candidate.id === record.id}
            onClick={() => { workbenchSelection.set(sessionId, candidate.id) }}>
            <span className="noven-wbnav-glyph" aria-hidden="true">
              {candidate.id === BUILTIN_FILES.id ? folderIcon() : bookGlyph(13)}
            </span>
            <span className="noven-wbnav-wb-title">
              {candidate.id === BUILTIN_FILES.id ? t('builtin.files') : candidate.title}
            </span>
          </button>
        ))}
      </div>
      <DrawerWorkbenchFiles t={t} api={api} sessionId={sessionId} record={record}
        live={canvas?.kind === WORKBENCH_KIND}
        onPick={rel => { stageIt(record.id, rel, 'home') }}
        onHome={() => { stageIt(record.id, null, 'home') }} />
    </div>
  )
}

/** The selected workbench's file list under the directory — navigation rows stage content. */
function DrawerWorkbenchFiles(props: {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly api: WorkbenchApi
  readonly sessionId: SessionId
  readonly record: WorkbenchRecordView
  readonly live: boolean
  readonly onPick: (rel: string) => void
  readonly onHome: () => void
}) {
  const { record } = props
  const { entries, failure } = useWorkbenchEntries(props.api, props.sessionId, record)
  const homeRel = record.home === undefined ? undefined : joinRel(record.folder, record.home)
  const nodes = stageNodes(entries, record.folder, homeRel)
  const view = workbenchStage.view(record.id)
  return (
    <div className="noven-wbnav-wb-files">
      {entries === undefined && <div className="noven-wbnav-wb-status">{props.t('nav.loading')}</div>}
      {failure !== undefined && <div className="noven-wbnav-wb-status" data-tone="warn" title={failure}>{props.t('nav.walkFailed')} · {failure}</div>}
      <StageTreeRows t={props.t} record={record} nodes={nodes} view={view}
        query="" live={props.live}
        onPick={props.onPick} onHome={props.onHome} />
    </div>
  )
}
