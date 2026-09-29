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
  /** Directory, document, or image. */
  readonly kind: 'directory' | 'document' | 'image'
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
 * Walk a workbench folder recursively (bounded), collecting exhibition entries.
 * `.noven` internal state is never exhibited.
 * @param api - the workbench API face.
 * @param sessionId - the session whose workspace holds the folder.
 * @param root - the workbench folder, workspace-relative.
 * @param signal - caller cancellation.
 * @param depth - remaining recursion budget.
 * @returns the walked entries, best effort (unreadable branches are skipped).
 */
export async function walkExhibition(
  api: WorkbenchApi,
  sessionId: SessionId,
  root: string,
  signal: AbortSignal,
  depth = 4,
): Promise<readonly ExhibitionEntry[]> {
  const listing = await api.listDir(sessionId, root, signal)
  if (!listing.ok || signal.aborted) return []
  const entries: ExhibitionEntry[] = []
  for (const entry of listing.value as readonly WorkspaceDirectoryEntry[]) {
    if (entry.name === '.noven') continue
    const rel = `${root}/${entry.name}`
    if (entry.type === 'directory') {
      entries.push({ rel, name: entry.name, kind: 'directory' })
      if (depth > 1) entries.push(...await walkExhibition(api, sessionId, rel, signal, depth - 1))
    }
    else if (entry.type === 'file') {
      entries.push({ rel, name: entry.name, kind: isImageName(entry.name) ? 'image' : isDocumentName(entry.name) ? 'document' : 'directory' })
    }
  }
  return entries
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
