/**
 * Workspace and application appearance persistence. Each document owns an
 * independent revision and per-path write queue; global writes never rewrite
 * project ledgers.
 * @module noven-shell/appearance/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { APP_HOME, ledgerDir } from 'noven-ledger'
import {
  emptyAppearanceDocument, emptyGlobalAppearanceDocument, parseAppearanceDocument, parseGlobalAppearanceDocument, resolveAppearance,
  type AppearanceDocument, type AppearanceView, type GlobalAppearanceDocument,
} from './model.ts'

/** Thrown when stored appearance JSON is unreadable but present. */
export class AppearanceStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AppearanceStoreError'
  }
}

/** Thrown when a caller's expected revision no longer matches the document. */
export class AppearanceConflictError extends Error {
  constructor(readonly revision: number) {
    super(`appearance revision ${String(revision)} is stale`)
    this.name = 'AppearanceConflictError'
  }
}

const queues = new Map<string, Promise<unknown>>()

async function documentPath(root: string): Promise<string> {
  return join(await ledgerDir(root), 'appearance.json')
}

function globalDocumentPath(): string {
  return join(APP_HOME, 'appearance', 'global.json')
}

async function load<T>(path: string, empty: () => T, parse: (value: unknown) => T | undefined): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty()
    throw new AppearanceStoreError('appearance document cannot be read', { cause: error })
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error: unknown) {
    throw new AppearanceStoreError('appearance document is not valid JSON', { cause: error })
  }
  const document = parse(value)
  if (document === undefined) throw new AppearanceStoreError('appearance document contains unsupported fields')
  return document
}

async function save(path: string, document: AppearanceDocument | GlobalAppearanceDocument): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.noven-tmp`
  await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`)
  await rename(temp, path)
}

function serialize<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve()
  const run = previous.then(task, task)
  const settled = run.then(() => undefined, () => undefined)
  queues.set(path, settled)
  void settled.then(() => {
    if (queues.get(path) === settled) queues.delete(path)
  })
  return run
}

async function readDocument(root: string): Promise<AppearanceDocument> {
  return load(await documentPath(root), emptyAppearanceDocument, parseAppearanceDocument)
}

async function readGlobalDocument(): Promise<GlobalAppearanceDocument> {
  return load(globalDocumentPath(), emptyGlobalAppearanceDocument, parseGlobalAppearanceDocument)
}

async function resolveWithGlobal(document: AppearanceDocument, sessionId: string, filePath?: string): Promise<AppearanceView> {
  return resolveAppearance(document, sessionId, filePath, await readGlobalDocument())
}

/**
 * Read one Session's resolved appearance and sparse overrides.
 * @param root - Project workspace root.
 * @param sessionId - Session whose conversation and avatar resolve.
 * @param filePath - Canonical workspace-relative file path, if any.
 * @returns The resolved view including the global default and its revision.
 */
export async function readAppearance(root: string, sessionId: string, filePath?: string): Promise<AppearanceView> {
  const [document, global] = await Promise.all([readDocument(root), readGlobalDocument()])
  return resolveAppearance(document, sessionId, filePath, global)
}

/**
 * Apply one workspace mutation with revision checking and serialized writes.
 * @param root - Project workspace root.
 * @param expectedRevision - Optimistic workspace revision supplied by a user surface.
 * @param change - Pure document transition; undefined means no write.
 * @param sessionId - Session whose view is returned after the write.
 * @param filePath - File whose view is returned after the write.
 * @returns The persisted document and resolved view.
 */
export async function updateAppearance(
  root: string,
  expectedRevision: number | undefined,
  change: (document: AppearanceDocument) => AppearanceDocument | undefined,
  sessionId: string,
  filePath?: string,
): Promise<AppearanceView> {
  const path = await documentPath(root)
  return serialize(path, async () => {
    const current = await load(path, emptyAppearanceDocument, parseAppearanceDocument)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new AppearanceConflictError(current.revision)
    const next = change(current)
    if (next === undefined || JSON.stringify(next) === JSON.stringify(current)) return resolveWithGlobal(current, sessionId, filePath)
    const document: AppearanceDocument = { ...next, version: 1, revision: current.revision + 1 }
    await save(path, document)
    return resolveWithGlobal(document, sessionId, filePath)
  })
}

/**
 * Apply one application-wide default mutation without changing any workspace revision.
 * @param root - Workspace whose resolved view is returned after the global write.
 * @param sessionId - Session whose view is returned.
 * @param expectedRevision - Optimistic global revision supplied by a user surface.
 * @param change - Pure global document transition; undefined means no write.
 * @param filePath - Optional file whose view is returned.
 * @returns The current workspace view with the new global layer.
 */
export async function updateGlobalAppearance(
  root: string,
  sessionId: string,
  expectedRevision: number | undefined,
  change: (document: GlobalAppearanceDocument) => GlobalAppearanceDocument | undefined,
  filePath?: string,
): Promise<AppearanceView> {
  const path = globalDocumentPath()
  return serialize(path, async () => {
    const current = await load(path, emptyGlobalAppearanceDocument, parseGlobalAppearanceDocument)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new AppearanceConflictError(current.revision)
    const next = change(current)
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(current)) {
      await save(path, { ...next, version: 1, revision: current.revision + 1 })
    }
    return readAppearance(root, sessionId, filePath)
  })
}
