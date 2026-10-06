/**
 * The workbench's navigation tree, shared by the canvas's two tree surfaces
 * (the breadcrumb dropdown and the pinned right-edge column in
 * WorkbenchStage): one grouped, counted model over the workbench folder's
 * walked entries, one set of rows. Also owns the small data hooks both
 * surfaces need — the registry feed (`/api/noven-workbenches` + its poll),
 * the folder walk, and the bound-card chip.
 * @module noven-workbench/client/nav-tree
 */
import { useCallback, useEffect, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchApi, WorkbenchRecordView } from './api.ts'
import { joinRel, withBuiltin } from './api.ts'
import { bookGlyph } from './book-glyph.tsx'
import { applyVisibility, walkExhibition } from './exhibition.ts'
import type { ExhibitionEntry } from './exhibition.ts'
import { visibilityMatcher } from '../visibility.ts'
import type { NovenWorkbenchKey } from './locales.ts'
import type { StageMode } from './stage.ts'

/** Basename without extension; a bare `index` entry names its parent folder. */
export function stem(rel: string): string {
  const name = rel.split('/').pop() ?? rel
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  if (base === 'index') {
    const dir = rel.split('/').slice(0, -1).pop()
    if (dir !== undefined && dir !== '') return dir
  }
  return base
}

/** The binding route's payload (noven-cards /api/noven-bindings GET). */
export interface BindingState {
  readonly binding: {
    readonly identityCardId?: string
    readonly backgroundCardIds: readonly string[]
    readonly managed?: { readonly cardId: string; readonly permission: string }
  } | null
  readonly cards: Readonly<Record<string, { readonly name: string; readonly kind: string }>>
}

/** The card the workbench header and canvas chip report as their subject. */
export interface BoundCard {
  readonly id: string
  readonly name: string
  readonly kind: string
}

/** The nav's workbench list — the built-in files floor plus the registered rows — refreshed on a poll; the registry lives in the app ledger, outside any watchable workspace path. */
const POLL_MS = 4000
/** Folder trees re-walk slower than the registry polls — the walk is the expensive call. */
const WALK_MS = 15000
export function useWorkbenchRegistry(api: WorkbenchApi, sessionId: SessionId | undefined): readonly WorkbenchRecordView[] | undefined {
  const [records, setRecords] = useState<readonly WorkbenchRecordView[] | undefined>(undefined)

  const reloadRegistry = useCallback((signal: AbortSignal): void => {
    if (sessionId === undefined) return
    void api.readRegistry(sessionId, signal).then(result => {
      // Even a failed registry read still shows the files floor — the zone
      // never goes blank just because the ledger is unreachable.
      if (!signal.aborted) setRecords(withBuiltin(result.ok ? result.value : []))
    }, () => {
      setRecords(previous => previous ?? withBuiltin([]))
    })
  }, [api, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    setRecords(undefined)
    reloadRegistry(controller.signal)
    return () => { controller.abort() }
  }, [reloadRegistry])

  useEffect(() => {
    if (sessionId === undefined) return
    const timer = setInterval(() => reloadRegistry(new AbortController().signal), POLL_MS)
    return () => { clearInterval(timer) }
  }, [sessionId, reloadRegistry])

  return records
}

/** The walked folder entries of one record, visibility-filtered, plus the walk's failure detail. */
export interface WorkbenchEntries {
  /** undefined while the first walk runs. */
  readonly entries: readonly ExhibitionEntry[] | undefined
  /** The first listing failure's detail — the drawer shows it instead of a blank tree. */
  readonly failure: string | undefined
}

export function useWorkbenchEntries(api: WorkbenchApi, sessionId: SessionId | undefined, record: WorkbenchRecordView | undefined): WorkbenchEntries {
  const [walked, setWalked] = useState<WorkbenchEntries>({ entries: undefined, failure: undefined })
  // The registry poll mints fresh record objects, so the walk keys on the
  // record's stable fields — a re-poll alone never re-walks the tree.
  const folder = record?.folder
  const visibilityKey = JSON.stringify(record?.visibility ?? null)
  useEffect(() => {
    if (sessionId === undefined || record === undefined || folder === undefined) return
    const visibility = JSON.parse(visibilityKey) as WorkbenchRecordView['visibility'] | null
    const controller = new AbortController()
    const walk = (): void => {
      // The built-in files floor shows the whole project, so it walks deeper
      // than a curated workbench folder needs to.
      void walkExhibition(api, sessionId, folder, controller.signal, folder === '' ? 8 : 4).then(result => {
        if (!controller.signal.aborted) {
          const filtered = visibility == null
            ? result.entries
            : applyVisibility(result.entries, folder, visibilityMatcher(visibility))
          if (result.failure !== undefined) console.warn('[noven-workbench] tree walk failed:', result.failure)
          setWalked({ entries: filtered, failure: result.failure })
        }
      }, (error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('[noven-workbench] tree walk threw:', error)
          setWalked({ entries: [], failure: String(error) })
        }
      })
    }
    walk()
    // The tree still refreshes on its own cadence so new files appear without
    // re-keying the walk on every registry poll.
    const timer = setInterval(walk, WALK_MS)
    return () => { controller.abort(); clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- folder + visibilityKey are the record's stable identity
  }, [api, sessionId, folder, visibilityKey, record === undefined])
  return walked
}

/** The session's bound card: the managed card, else the first background. Watched — card saves rebind server-side. */
export function useBoundCard(api: WorkbenchApi, sessionId: SessionId | undefined): BoundCard | undefined {
  const [binding, setBinding] = useState<BindingState | undefined>(undefined)
  const reload = useCallback((signal: AbortSignal): void => {
    if (sessionId === undefined) return
    void fetch(`/api/noven-bindings?session=${encodeURIComponent(sessionId)}`, { signal }).then(async response => {
      if (!signal.aborted && response.ok) setBinding(await response.json() as BindingState)
    }, () => { /* binding route absent — the chip simply stays hidden */ })
  }, [sessionId])

  useEffect(() => {
    const controller = new AbortController()
    setBinding(undefined)
    reload(controller.signal)
    return () => { controller.abort() }
  }, [reload])

  useEffect(() => {
    if (sessionId === undefined) return
    const timer = setInterval(() => reload(new AbortController().signal), POLL_MS)
    return () => { clearInterval(timer) }
  }, [sessionId, reload])
  const bound = binding?.binding
  const id = bound?.managed?.cardId ?? bound?.backgroundCardIds[0] ?? bound?.identityCardId
  if (id === undefined) return undefined
  const card = binding?.cards[id]
  return card === undefined ? undefined : { id, ...card }
}

/** One node of the stage's grouped resource tree. */
export interface StageTreeNode {
  readonly rel: string
  readonly name: string
  readonly kind: ExhibitionEntry['kind']
  /** Recursive non-directory descendant count (directories only). */
  readonly count: number
  readonly children: readonly StageTreeNode[]
}

/**
 * Fold the flat exhibition walk into the reference tree: directories become
 * expandable group rows carrying their recursive file count, other entries
 * become leaf rows. Ordering follows the walk (directories first within a
 * folder is the walker's own order). `exclude` drops a rel from every level —
 * the home file skips the file rows because its own row already names it.
 * @param entries - walked entries under the workbench folder.
 * @param root - the workbench folder, workspace-relative.
 * @param exclude - a rel to leave out of the tree.
 * @returns top-level nodes.
 */
export function buildStageTree(entries: readonly ExhibitionEntry[], root: string, exclude?: string): readonly StageTreeNode[] {
  const childrenOf = new Map<string, ExhibitionEntry[]>()
  for (const entry of entries) {
    if (entry.rel === exclude) continue
    const slash = entry.rel.lastIndexOf('/')
    const parent = slash < 0 ? '' : entry.rel.slice(0, slash)
    const list = childrenOf.get(parent) ?? []
    list.push(entry)
    childrenOf.set(parent, list)
  }
  const fold = (dirRel: string): StageTreeNode[] =>
    (childrenOf.get(dirRel) ?? []).map(entry => {
      if (entry.kind !== 'directory') {
        return { rel: entry.rel, name: entry.name, kind: entry.kind, count: 0, children: [] }
      }
      const children = fold(entry.rel)
      const count = children.reduce((sum, node) => sum + (node.kind === 'directory' ? node.count : 1), 0)
      return { rel: entry.rel, name: entry.name, kind: entry.kind, count, children }
    })
  return fold(root)
}

/** The walked entries under this record, or none while loading. */
export function stageNodes(entries: readonly ExhibitionEntry[] | undefined, root: string, exclude?: string): readonly StageTreeNode[] {
  return entries === undefined ? [] : buildStageTree(entries, root, exclude)
}

/** The slice of stage view the tree rows highlight on. */
export interface TreeView {
  readonly mode: StageMode
  readonly selected: string | null
}

/** The grouped tree body shared by the canvas's dropdown (06c) and pinned column (06d). */
export function StageTreeRows(props: {
  readonly t: (key: NovenWorkbenchKey) => string
  readonly record: WorkbenchRecordView
  readonly nodes: readonly StageTreeNode[]
  readonly view: TreeView
  readonly query: string
  /** Whether the canvas is up; a remembered pick dims rather than highlights while it is down. */
  readonly live?: boolean
  readonly onPick: (rel: string) => void
  readonly onHome: () => void
  /** The all-files tail row — a canvas mode, so drawer navigation omits it. */
  readonly onAllFiles?: () => void
}) {
  const { t, record, nodes, view, query } = props
  const live = props.live !== false
  const homeRel = record.home === undefined ? null : joinRel(record.folder, record.home)
  const homeSelected = live && view.selected === null && view.mode === 'home'
  const homeStale = !live && view.selected === null && view.mode === 'home'

  if (query !== '') {
    const needle = query.toLowerCase()
    const hits: StageTreeNode[] = []
    const collect = (list: readonly StageTreeNode[]): void => {
      for (const node of list) {
        if (node.kind === 'directory') collect(node.children)
        else if (node.name.toLowerCase().includes(needle)) hits.push(node)
      }
    }
    collect(nodes)
    return (
      <div className="noven-stage-tree-scroll">
        {hits.map(node => <StageFileRow key={node.rel} node={node}
          selected={live && view.selected === node.rel} stale={!live && view.selected === node.rel}
          onPick={props.onPick} />)}
        {nodes.length > 0 && hits.length === 0 && <div className="noven-wb-tree-row noven-wb-tree-pending">—</div>}
      </div>
    )
  }

  return (
    <div className="noven-stage-tree-scroll">
      {homeRel !== null && (
        <button type="button" className="noven-wb-tree-row noven-wb-tree-file"
          data-selected={homeSelected} data-stale={homeStale} onClick={props.onHome}>
          <span className="noven-wb-tree-glyph" aria-hidden="true">{bookGlyph(13)}</span>
          <span className="noven-wb-tree-label">{t('stage.home')} · {stem(homeRel)}</span>
        </button>
      )}
      {nodes.map(node => (
        <StageTreeNodeRow key={node.rel} node={node} depth={0} selected={view.selected} live={live} onPick={props.onPick} />
      ))}
      {props.onAllFiles !== undefined && (
        <button type="button" className="noven-wb-tree-row noven-wb-tree-file noven-stage-all"
          onClick={props.onAllFiles}>
          <span className="noven-wb-tree-label">{t('stage.allFiles')}</span>
          <span className="noven-wb-tree-chevron">›</span>
        </button>
      )}
    </div>
  )
}

/** One tree row — directories expand in place; leaves stage their file. */
function StageTreeNodeRow(props: {
  readonly node: StageTreeNode
  readonly depth: number
  readonly selected: string | null
  readonly live: boolean
  readonly onPick: (rel: string) => void
}) {
  const { node, depth, selected, live } = props
  const [open, setOpen] = useState(selected !== null && (selected === node.rel || selected.startsWith(`${node.rel}/`)))

  useEffect(() => {
    if (selected !== null && selected.startsWith(`${node.rel}/`)) setOpen(true)
  }, [selected, node.rel])

  if (node.kind === 'directory') {
    return (
      <>
        <button type="button" className="noven-wb-tree-row noven-wb-tree-dir"
          style={{ paddingLeft: `${10 + depth * 14}px` }} aria-expanded={open}
          onClick={() => { setOpen(o => !o) }}>
          <span className="noven-wb-tree-chevron" data-open={open}>›</span>
          <span className="noven-wb-tree-glyph" aria-hidden="true">{folderIcon()}</span>
          <span className="noven-wb-tree-label" title={node.name}>{node.name}</span>
          <span className="noven-stage-tree-count">{node.count}</span>
        </button>
        {open && node.children.map(child => (
          <StageTreeNodeRow key={child.rel} node={child} depth={depth + 1} selected={selected} live={live} onPick={props.onPick} />
        ))}
      </>
    )
  }
  return <StageFileRow node={node} depth={depth} selected={live && selected === node.rel} stale={!live && selected === node.rel} onPick={props.onPick} />
}

/** A leaf row: glyph by kind, mint fill while staged, muted while only remembered. */
function StageFileRow(props: {
  readonly node: StageTreeNode
  readonly depth?: number
  readonly selected: boolean
  readonly stale?: boolean
  readonly onPick: (rel: string) => void
}) {
  const { node, depth = 0 } = props
  return (
    <button type="button" className="noven-wb-tree-row noven-wb-tree-file" title={node.rel}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      data-selected={props.selected} data-stale={props.stale} onClick={() => { props.onPick(node.rel) }}>
      <span className="noven-wb-tree-glyph" aria-hidden="true">
        {node.kind === 'image' ? imageIcon() : docIcon()}
      </span>
      <span className="noven-wb-tree-label">{node.name}</span>
    </button>
  )
}

/** Small inline icons for tree glyphs; the drawer's rail rows reuse the same marks. */

/** The directory glyph the file-tree rows draw; rail rows reuse it. */
export function folderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}
/** The document glyph for ordinary file rows; rail rows reuse it. */
export function docIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1-1-1Z" /><path d="M14 3v5h4" />
    </svg>
  )
}
/** The image glyph for picture file rows; rail rows reuse it. */
export function imageIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M5 18l5-4 3 2 4-3 2 2" />
    </svg>
  )
}
