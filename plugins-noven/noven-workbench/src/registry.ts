/**
 * Workbench registry persistence — one JSON document under the project's
 * `.noven/` internal state directory. Tool calls are the only writer; the
 * model is told not to hand-edit this file.
 * @module noven-workbench/registry
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/** One registered workbench. */
export interface WorkbenchRecord {
  readonly id: string
  title: string
  folder: string
  home?: string
  visible: boolean
  pinned?: readonly string[]
}

/** The whole registry document. */
export interface WorkbenchRegistry {
  version: 1
  workbenches: WorkbenchRecord[]
}

function registryPath(projectRoot: string): string {
  return join(projectRoot, '.noven', 'workbenches.json')
}

/** Load the registry, tolerating absence and malformed documents. */
export async function loadRegistry(projectRoot: string): Promise<WorkbenchRegistry> {
  try {
    const raw = await readFile(registryPath(projectRoot), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkbenchRegistry>
    if (Array.isArray(parsed.workbenches)) {
      return { version: 1, workbenches: parsed.workbenches.filter((w): w is WorkbenchRecord => typeof w?.id === 'string') }
    }
  } catch { /* absent or unreadable — start fresh */ }
  return { version: 1, workbenches: [] }
}

/** Persist the registry through a temp file + rename. */
export async function saveRegistry(projectRoot: string, registry: WorkbenchRegistry): Promise<void> {
  const target = registryPath(projectRoot)
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
