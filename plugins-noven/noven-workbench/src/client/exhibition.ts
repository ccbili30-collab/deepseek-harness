/**
 * The workbench exhibition builder, ported from the legacy
 * `workbench-exhibition.ts`: the folder's entries split into groups,
 * documents, and images. The original walked the workbench's flattened
 * entry list; this port feeds it from the lazy directory walk instead, so
 * the shape (and the depth cap) is the walker's.
 * @module noven-workbench/client/exhibition
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { WorkbenchApi } from './api.ts'
import { isImageName } from './api.ts'

/** Extensions the legacy exhibition counted as documents. */
const DOCUMENT_EXTENSIONS = new Set(['md', 'mdx', 'txt'])

/** One walked entry: workspace-relative path plus the display facts. */
export interface ExhibitionEntry {
  /** Workspace-relative path (`参考图/角色.png`). */
  readonly rel: string
  /** Basename. */
  readonly name: string
  /** Directory, document, image, or any other file. */
  readonly kind: 'directory' | 'document' | 'image' | 'file'
}

/** The exhibition's split, as the legacy canvas rendered it. */
export interface Exhibition {
  /** Directory names (any depth), as the legacy groups row showed them. */
  readonly groups: readonly string[]
  /** Document entries. */
  readonly documents: readonly ExhibitionEntry[]
  /** Image entries. */
  readonly images: readonly ExhibitionEntry[]
}

/** Basename's lowercase extension, per the legacy helper. */
function extension(name: string): string {
  return name.split('.').pop()?.toLocaleLowerCase('en-US') ?? ''
}

/** Whether a file name is an exhibition document. */
function isDocumentName(name: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extension(name))
}

/**
 * Dependency/build directories the tree never descends into — thousands of
 * package files would drown a user's own work. Hidden dirs are skipped by
 * the `.`-prefix rule elsewhere.
 */
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', '__pycache__'])

/** The walk's outcome: what was collected, plus the first failure a branch hit. */
export interface WalkResult {
  readonly entries: readonly ExhibitionEntry[]
  /** The first listing failure's readable detail — a blank tree's reason, not a silent gap. */
  readonly failure?: string
}

/**
 * Walk a workbench folder recursively (bounded), collecting exhibition entries.
 * `.noven` internal state is never exhibited.
 * @param api - the workbench API face.
 * @param sessionId - the session whose workspace holds the folder.
 * @param root - the workbench folder, workspace-relative.
 * @param signal - caller cancellation.
 * @param depth - remaining recursion budget.
 * @returns the walked entries and the first failure, best effort (unreadable branches are skipped).
 */
export async function walkExhibition(
  api: WorkbenchApi,
  sessionId: SessionId,
  root: string,
  signal: AbortSignal,
  depth = 4,
): Promise<WalkResult> {
  const listing = await api.listDir(sessionId, root === '' ? '.' : root, signal)
    .catch((error: unknown) => ({ ok: false as const, error }))
  if (!listing.ok) {
    const detail = typeof listing.error === 'object' && listing.error !== null && 'message' in listing.error
      ? String(listing.error.message)
      : String(listing.error)
    return { entries: [], failure: `${root === '' ? '.' : root}: ${detail}` }
  }
  if (signal.aborted) return { entries: [] }
  const entries: ExhibitionEntry[] = []
  let failure: string | undefined
  for (const entry of listing.value as readonly WorkspaceDirectoryEntry[]) {
    if (entry.name.startsWith('.')) continue
    const rel = root === '' ? entry.name : `${root}/${entry.name}`
    if (entry.type === 'directory') {
      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue
      entries.push({ rel, name: entry.name, kind: 'directory' })
      if (depth > 1) {
        const child = await walkExhibition(api, sessionId, rel, signal, depth - 1)
        entries.push(...child.entries)
        failure ??= child.failure
      }
    }
    else if (entry.type === 'file') {
      entries.push({ rel, name: entry.name, kind: isImageName(entry.name) ? 'image' : isDocumentName(entry.name) ? 'document' : 'file' })
    }
  }
  return failure === undefined ? { entries } : { entries, failure }
}

/**
 * Apply a workbench record's visibility spec to walked entries (V3 port):
 * non-matching files drop out; directories emptied by the filter drop too,
 * while a genuinely empty directory stays (the walker still shows it).
 * @param entries - the walked entries.
 * @param root - the workbench folder (paths are matched relative to it).
 * @param visible - the record's visibility matcher (from `visibilityMatcher`).
 * @returns the filtered entries.
 */
export function applyVisibility(
  entries: readonly ExhibitionEntry[],
  root: string,
  visible: (rel: string) => boolean,
): readonly ExhibitionEntry[] {
  const prefix = root === '' ? '' : `${root}/`
  const workbenchRel = (rel: string): string => rel.startsWith(prefix) ? rel.slice(prefix.length) : rel
  const keptFiles = new Set(
    entries.filter(entry => entry.kind !== 'directory' && visible(workbenchRel(entry.rel))).map(entry => entry.rel),
  )
  const keptDirs = new Set<string>()
  for (const rel of keptFiles) {
    let dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    while (dir !== '' && dir !== root) {
      if (keptDirs.has(dir)) break
      keptDirs.add(dir)
      dir = dir.slice(0, Math.max(0, dir.lastIndexOf('/')))
    }
  }
  // Directories the walker saw as leaf-empty stay; ones emptied by filtering go.
  const sawChildren = new Map<string, number>()
  for (const entry of entries) {
    const parent = entry.rel.includes('/') ? entry.rel.slice(0, entry.rel.lastIndexOf('/')) : ''
    sawChildren.set(parent, (sawChildren.get(parent) ?? 0) + 1)
  }
  return entries.filter(entry =>
    entry.kind !== 'directory'
      ? keptFiles.has(entry.rel)
      : keptDirs.has(entry.rel) || (sawChildren.get(entry.rel) ?? 0) === 0)
}

/**
 * Split walked entries into the exhibition's three rows, per the legacy builder.
 * @param entries - the walked entries.
 * @returns groups (directory names), documents, and images.
 */
export function buildWorkbenchExhibition(entries: readonly ExhibitionEntry[]): Exhibition {
  return {
    groups: entries.filter(entry => entry.kind === 'directory').map(entry => entry.name),
    documents: entries.filter(entry => entry.kind === 'document'),
    images: entries.filter(entry => entry.kind === 'image'),
  }
}
