/**
 * One workbench's resource tree, ported from the legacy WorkbenchResourceTree:
 * lazily listed directories expand in place, files open through the panel's
 * open-file callback. Depth rides padding, exactly as the original did.
 * @module noven-workbench/client/ResourceTree
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { WorkbenchApi } from './api.ts'
import { isImageName } from './api.ts'

/** One directory's load state, keyed by workspace-relative path. */
type DirState = readonly WorkspaceDirectoryEntry[] | 'loading' | 'failed'

/** Props the panel binds for one tree. */
export interface ResourceTreeProps {
  readonly sessionId: SessionId
  readonly api: WorkbenchApi
  /** Workbench folder, workspace-relative; the tree's root. */
  readonly root: string
  /** Workspace-relative path of the file the panel is staging, if any. */
  readonly selectedPath: string | undefined
  readonly onOpenFile: (rel: string, image: boolean) => void
}

/**
 * Render one workbench's expandable file tree.
 * @param props - session, API face, root folder, selection, and the open callback.
 * @returns the tree.
 */
export function ResourceTree(props: ResourceTreeProps): ReactNode {
  const [dirs, setDirs] = useState<Record<string, DirState>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set([props.root]))

  const load = (path: string, signal: AbortSignal): void => {
    setDirs(current => (current[path] === undefined ? { ...current, [path]: 'loading' } : current))
    void props.api.listDir(props.sessionId, path, signal).then(result => {
      if (signal.aborted) return
      setDirs(current => ({ ...current, [path]: result.ok ? result.value : 'failed' }))
    }, () => {
      if (signal.aborted) return
      setDirs(current => ({ ...current, [path]: 'failed' }))
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    load(props.root, controller.signal)
    return () => { controller.abort() }
    // The root is one tree's identity; expanding reloads through toggle.
  }, [props.root, props.sessionId])

  const toggle = (path: string): void => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    setDirs(current => {
      if (current[path] === undefined) {
        const controller = new AbortController()
        load(path, controller.signal)
      }
      return current
    })
  }

  const rows: ReactNode[] = []
  const walk = (path: string, depth: number): void => {
    const state = dirs[path]
    if (state === undefined || state === 'loading') {
      rows.push(<div className="noven-wb-tree-row noven-wb-tree-pending" key={`${path}…`} style={{ paddingLeft: `${9 + depth * 12}px` }}>…</div>)
      return
    }
    if (state === 'failed') {
      rows.push(<div className="noven-wb-tree-row noven-wb-tree-failed" key={`${path}!`} style={{ paddingLeft: `${9 + depth * 12}px` }}>!</div>)
      return
    }
    for (const entry of state) {
      const rel = `${path}/${entry.name}`
      if (entry.type === 'directory') {
        const open = expanded.has(rel)
        rows.push(
          <button
            type="button"
            key={rel}
            className="noven-wb-tree-row noven-wb-tree-dir"
            style={{ paddingLeft: `${7 + depth * 12}px` }}
            aria-expanded={open}
            onClick={() => { toggle(rel) }}
          >
            <span className="noven-wb-tree-chevron" data-open={open}>›</span>
            <span className="noven-wb-tree-glyph noven-wb-tree-glyph-dir" aria-hidden="true" />
            <span className="noven-wb-tree-label" title={entry.name}>{entry.name}</span>
          </button>,
        )
        if (open) walk(rel, depth + 1)
      }
      else if (entry.type === 'file') {
        const image = isImageName(entry.name)
        rows.push(
          <button
            type="button"
            key={rel}
            className="noven-wb-tree-row noven-wb-tree-file"
            data-selected={props.selectedPath === rel}
            style={{ paddingLeft: `${21 + depth * 12}px` }}
            onClick={() => { props.onOpenFile(rel, image) }}
          >
            <span className={`noven-wb-tree-glyph ${image ? 'noven-wb-tree-glyph-image' : 'noven-wb-tree-glyph-file'}`} aria-hidden="true" />
            <span className="noven-wb-tree-label" title={entry.name}>{entry.name}</span>
          </button>,
        )
      }
    }
  }
  walk(props.root, 0)

  return <div className="noven-wb-tree" role="tree">{rows}</div>
}
