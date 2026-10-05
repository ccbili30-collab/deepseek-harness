/**
 * Library manifest persistence — the manifest lives in the app-side ledger
 * (`~/.noven/ledger/<id>/library.json`), never inside the project folder where
 * a cleanup can wipe it. A legacy `.noven/library.json` is lifted on first
 * read. Project identity lives in the registry with `.noven/project.json`
 * (the marker) as its in-folder backup. Writes go through a temp file +
 * rename; `revision` is the optimistic-lock counter.
 * @module noven-library/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  ledgerDir,
  liftTree,
  readMarker,
  registryRow,
  renameProject,
  writeMarker,
} from 'noven-ledger'
import type { Library, ProjectMeta } from './model.ts'
import { parseLibrary } from './model.ts'

/** The manifest's ledger location for one project root. */
async function manifestPath(projectRoot: string): Promise<string> {
  return join(await ledgerDir(projectRoot), 'library.json')
}

/** The empty manifest a project without one starts from. */
export function emptyLibrary(): Library {
  return { version: 1, revision: 0, works: [], cardMeta: {}, ignored: [] }
}

/** Lift a legacy `.noven/library.json` into the ledger once. */
async function liftLegacy(projectRoot: string): Promise<void> {
  await liftTree(join(projectRoot, '.noven', 'library.json'), await manifestPath(projectRoot))
}

/** Load the manifest; absence or malformed JSON yields the empty document. */
export async function loadLibrary(projectRoot: string): Promise<Library> {
  await liftLegacy(projectRoot)
  try {
    return parseLibrary(JSON.parse(await readFile(await manifestPath(projectRoot), 'utf8')))
  } catch { /* absent or unreadable — start fresh */ }
  return emptyLibrary()
}

/**
 * Load the project identity: the registry row is the authority for id/title;
 * the marker carries the backup copy (and `description`, which the registry
 * does not track). Returns undefined when neither knows the project.
 */
export async function loadProject(projectRoot: string): Promise<ProjectMeta | undefined> {
  const row = await registryRow(projectRoot)
  const marker = await readMarker(projectRoot)
  const id = row?.id ?? marker?.id
  const title = row?.title ?? marker?.title
  if (id === undefined || title === undefined) return undefined
  return {
    version: 1,
    id,
    title,
    ...(marker?.description !== undefined ? { description: marker.description } : {}),
    createdAt: marker?.createdAt ?? row?.addedAt ?? new Date(0).toISOString(),
  }
}

/** Persist the manifest atomically. */
export async function saveLibrary(projectRoot: string, library: Library): Promise<void> {
  const target = await manifestPath(projectRoot)
  const temp = `${target}.noven-tmp`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temp, `${JSON.stringify(library, null, 2)}\n`)
  await rename(temp, target)
}

/**
 * Persist the project identity: the registry is the single display authority
 * for the title; the marker gets a backup copy so the folder still knows its
 * own id (and the name to reseed from) after transport.
 */
export async function saveProject(projectRoot: string, project: ProjectMeta): Promise<void> {
  const row = await registryRow(projectRoot)
  const marker = await readMarker(projectRoot)
  await writeMarker(projectRoot, {
    version: 2,
    id: row?.id ?? marker?.id ?? project.id,
    title: project.title,
    ...(project.description !== undefined ? { description: project.description } : {}),
    createdAt: project.createdAt,
  })
  if (row !== undefined) await renameProject(projectRoot, project.title)
}

/** Thrown when a caller's expected revision no longer matches the document. */
export class LibraryConflictError extends Error {
  constructor(readonly current: number) {
    super(`library revision conflict (current ${current})`)
  }
}

/** Thrown for a missing work id. */
export class LibraryNotFoundError extends Error {
  constructor(readonly workId: string) {
    super(`unknown work id: ${workId}`)
  }
}

/**
 * Read-modify-write one manifest mutation. `baseRevision`, when supplied,
 * must match the loaded revision or the call fails with a conflict.
 */
export async function mutateLibrary(
  projectRoot: string,
  fn: (library: Library) => void,
  baseRevision?: number,
): Promise<Library> {
  const library = await loadLibrary(projectRoot)
  if (baseRevision !== undefined && baseRevision !== library.revision) {
    throw new LibraryConflictError(library.revision)
  }
  fn(library)
  library.revision += 1
  await saveLibrary(projectRoot, library)
  return library
}

/** Look up one work or throw a stable error. */
export function workById(library: Library, workId: string): import('./model.ts').Work {
  const work = library.works.find(w => w.id === workId)
  if (work === undefined) throw new LibraryNotFoundError(workId)
  return work
}

/** Stable short id for a new work. */
export function mintWorkId(title: string): string {
  const compact = title.trim().replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_\-]/gu, '').slice(0, 16)
  const base = compact.length > 0 ? compact.toLowerCase() : 'work'
  return `${base}-${Date.now().toString(36)}`
}
