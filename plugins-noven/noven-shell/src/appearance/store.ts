/**
 * Workspace-scoped appearance persistence. Each project owns one JSON document
 * in its app ledger; every read-modify-write is serialized per document and
 * published with an atomic rename.
 * @module noven-shell/appearance/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ledgerDir } from 'noven-ledger'
import { emptyAppearanceDocument, parseAppearanceDocument, resolveAppearance, type AppearanceDocument, type AppearanceView } from './model.ts'

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

async function load(path: string): Promise<AppearanceDocument> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyAppearanceDocument()
    throw new AppearanceStoreError('appearance document cannot be read', { cause: error })
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error: unknown) {
    throw new AppearanceStoreError('appearance document is not valid JSON', { cause: error })
  }
  const document = parseAppearanceDocument(value)
  if (document === undefined) throw new AppearanceStoreError('appearance document contains unsupported fields')
  return document
}

async function save(path: string, document: AppearanceDocument): Promise<void> {
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
  return load(await documentPath(root))
}

/**
 * Read one Session's resolved appearance and sparse overrides.
 * @param root - Project workspace root.
 * @param sessionId - Session whose conversation and avatar resolve.
 * @param filePath - Canonical workspace-relative file path, if any.
 * @returns The resolved view.
 */
export async function readAppearance(root: string, sessionId: string, filePath?: string): Promise<AppearanceView> {
  const document = await readDocument(root)
  return resolveAppearance(document, sessionId, filePath)
}

/**
 * Apply one mutation with revision checking and serialized writes.
 * @param root - Project workspace root.
 * @param expectedRevision - Optimistic revision supplied by a user surface.
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
    const current = await load(path)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) throw new AppearanceConflictError(current.revision)
    const next = change(current)
    if (next === undefined || JSON.stringify(next) === JSON.stringify(current)) {
      return resolveAppearance(current, sessionId, filePath)
    }
    const document: AppearanceDocument = { ...next, version: 1, revision: current.revision + 1 }
    await save(path, document)
    return resolveAppearance(document, sessionId, filePath)
  })
}
