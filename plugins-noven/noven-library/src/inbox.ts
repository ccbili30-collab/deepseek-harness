/**
 * Inbox scan — workspace files that are neither registered in the manifest nor
 * ignored. Bounded depth and entry counts keep the scan cheap on large trees.
 * @module noven-library/inbox
 */
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Library, WorkKind } from './model.ts'
import { normalizeRel } from './model.ts'
import { inferKind } from './kind.ts'

const MAX_DEPTH = 4
const MAX_ENTRIES = 800
const SKIP_DIRS = new Set(['.noven', '卡', 'node_modules', '.git'])

/** One unregistered file offered for claiming. */
export interface InboxItem {
  readonly path: string
  readonly kind: WorkKind
  readonly bytes?: number
}

/** Every path the manifest already accounts for. */
function registeredPaths(library: Library): Set<string> {
  const registered = new Set<string>(library.ignored.map(normalizeRel))
  for (const work of library.works) {
    registered.add(work.primary.path)
    if (work.cover !== undefined) registered.add(work.cover.path)
    for (const revision of work.revisions) registered.add(revision.ref.path)
  }
  return registered
}

/**
 * Walk the project root and return files outside `.noven/` that are neither
 * registered nor ignored. Sorted by path; truncated past the entry cap.
 */
export async function scanInbox(projectRoot: string, library: Library): Promise<InboxItem[]> {
  const registered = registeredPaths(library)
  const items: InboxItem[] = []
  let seen = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || seen >= MAX_ENTRIES) return
    let names: string[] = []
    try {
      names = await readdir(dir)
    } catch { /* unreadable directory — skip */ }
    names.sort()
    for (const name of names) {
      if (seen >= MAX_ENTRIES) return
      if (depth === 0 && (SKIP_DIRS.has(name) || name.startsWith('.'))) continue
      const abs = join(dir, name)
      const info = await stat(abs).catch(() => undefined)
      if (info === undefined) continue
      seen += 1
      if (info.isDirectory()) {
        await walk(abs, depth + 1)
      } else if (info.isFile()) {
        const rel = normalizeRel(abs.slice(projectRoot.length).replace(/^\/+/, ''))
        if (registered.has(rel) || rel.length === 0) continue
        items.push({ path: rel, kind: inferKind(rel), bytes: info.size })
      }
    }
  }
  await walk(projectRoot, 0)
  return items
}
