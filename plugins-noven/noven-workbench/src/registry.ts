/**
 * Workbench registry persistence — one JSON document under the project's
 * app-ledger directory (`~/.noven/ledger/<id>/`). Tool calls are the only
 * writer; the model is told not to hand-edit this file.
 * @module noven-workbench/registry
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { ledgerDir, liftTree } from 'noven-ledger'

/**
 * Visibility scope over a workbench's file listing (CreatX V3 port): include
 * and exclude glob patterns over workbench-relative paths, plus
 * `autoIncludeNewFiles`. When auto-inclusion is off, `files` freezes the
 * matched file set at the moment the rule was saved.
 */
export interface WorkbenchVisibility {
  include: readonly string[]
  exclude: readonly string[]
  autoIncludeNewFiles: boolean
  files?: readonly string[]
}

/** A one-shot presentation request left by `show_in_workbench` for the client to stage once. */
export interface WorkbenchPresent {
  readonly path: string
  readonly at: string
}

/** One registered workbench. */
export interface WorkbenchRecord {
  readonly id: string
  title: string
  folder: string
  home?: string
  visible: boolean
  pinned?: readonly string[]
  /** Per-file view bindings: workspace-relative source → workspace-relative frame HTML. */
  views?: Record<string, string>
  /** Latest presentation request; the drawer stages it once and remembers the timestamp. */
  present?: WorkbenchPresent
  visibility?: WorkbenchVisibility
}

/** The whole registry document. */
export interface WorkbenchRegistry {
  version: 1
  workbenches: WorkbenchRecord[]
}

/** Registry file in the app-side ledger; the legacy `.noven/` copy is lifted on first read. */
async function registryPath(projectRoot: string): Promise<string> {
  const target = join(await ledgerDir(projectRoot), 'workbenches.json')
  await liftTree(join(projectRoot, '.noven', 'workbenches.json'), target)
  return target
}

/** Load the registry, tolerating absence and malformed documents. */
export async function loadRegistry(projectRoot: string): Promise<WorkbenchRegistry> {
  try {
    const raw = await readFile(await registryPath(projectRoot), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkbenchRegistry>
    if (Array.isArray(parsed.workbenches)) {
      return { version: 1, workbenches: parsed.workbenches.filter((w): w is WorkbenchRecord => typeof w?.id === 'string') }
    }
  } catch { /* absent or unreadable — start fresh */ }
  return { version: 1, workbenches: [] }
}

/** Persist the registry through a temp file + rename. */
export async function saveRegistry(projectRoot: string, registry: WorkbenchRegistry): Promise<void> {
  const target = await registryPath(projectRoot)
  const temp = `${target}.creatx-tmp`.replace('creatx-tmp', 'noven-tmp')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temp, `${JSON.stringify(registry, null, 2)}\n`)
  await rename(temp, target)
}

/** Stable short id for a new workbench. */
export function mintId(title: string): string {
  const compact = title.trim().replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_\-]/gu, '').slice(0, 16)
  const base = compact.length > 0 ? compact.toLowerCase() : 'workbench'
  return `${base}-${Date.now().toString(36)}`
}

/** Resolve a user-supplied path against the project root. */
export function underRoot(projectRoot: string, path: string): string {
  return resolve(projectRoot, path)
}
