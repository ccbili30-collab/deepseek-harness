/**
 * The gallery's asynchronous face: registry and directory listings ride the
 * standard `workspaceFiles` Remote namespace (read-only, workspace-fenced);
 * annotations ride this plugin's own `/api/noven-annotations` route, the one
 * writer the sidecars have.
 *
 * Every method reports failures as values, never throws, so the components
 * render whatever came back.
 * @module noven-workbench/client/api
 */
import type { ClientRemote, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceDirectoryEntry, WorkspaceFileWatchFrame } from '@deepseek-ai/dsh-api-workspace-files/types'
import { RemoteError, type RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { AnnotationDoc, AnnotationRecord } from '../annotations.ts'

/** Client-side mirror of the host registry record (see src/registry.ts). */
export interface WorkbenchRecordView {
  readonly id: string
  readonly title: string
  readonly folder: string
  readonly home?: string
  readonly visible: boolean
  readonly pinned?: readonly string[]
}

/** File extensions the gallery treats as images. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

/** Whether a listed name is an image the gallery can stage. */
export function isImageName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** One folder listing, split the way the gallery shows it. */
export interface FolderView {
  /** Image rel-paths, pinned first, then by name. */
  readonly images: readonly string[]
  /** Non-image document rel-paths, by name. */
  readonly docs: readonly string[]
}

/** The face the body drives the gallery with. */
export interface WorkbenchApi {
  /** Read `.noven/workbenches.json`; an absent or malformed registry is an empty list. */
  readonly readRegistry: (sessionId: SessionId, signal: AbortSignal) => Promise<RemoteResult<readonly WorkbenchRecordView[]>>
  /** List one workbench folder into the gallery's split view. */
  readonly listFolder: (sessionId: SessionId, folder: string, signal: AbortSignal) => Promise<RemoteResult<FolderView>>
  /** Observe one path (a file or a directory's direct entries) for change notifications. */
  readonly watchPath: (sessionId: SessionId, path: string, signal: AbortSignal) => AsyncIterable<'ready' | 'change'>
  /** Load one image's annotation sidecar; absent reads as an empty document. */
  readonly loadAnnotations: (sessionId: SessionId, imageRel: string) => Promise<RemoteResult<readonly AnnotationRecord[]>>
  /** Replace one image's annotation sidecar. */
  readonly saveAnnotations: (sessionId: SessionId, imageRel: string, annotations: readonly AnnotationRecord[]) => Promise<RemoteResult<{ count: number }>>
}

/** Whether a Remote failure just means "nothing there yet" — an absent file or folder, not a broken read. */
function isNotFound(failure: RemoteFailure): boolean {
  return failure.code === 'workspace-file/not-found'
}

/** Accumulate a small JSON file through the byte-window RPC; absence reads as no value. */
async function readJsonFile(
  remote: ClientRemote,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): Promise<RemoteResult<unknown>> {
  const text = new TextDecoder()
  let body = ''
  for (let page = 0; page < 8; page++) {
    const window = await remote.workspaceFiles.readBytes(sessionId, path, { range: { offset: body.length } }, signal)
    // No registry yet is the first-run state, not a failure — the empty state guides the user to register one.
    if (!window.ok) return isNotFound(window.error) ? { ok: true as const, value: undefined } : window
    body += text.decode(window.value.data, { stream: !window.value.eof })
    if (window.value.eof) break
  }
  try {
    return { ok: true as const, value: JSON.parse(body) as unknown }
  } catch {
    return { ok: true as const, value: undefined }
  }
}

/** Sort pinned paths ahead, keeping listing order otherwise. */
export function pinnedFirst(names: readonly string[], pinned: readonly string[] | undefined): string[] {
  if (pinned === undefined || pinned.length === 0) return [...names]
  const rank = new Map(pinned.map((path, index) => [path, index]))
  return [...names].sort((a, b) => (rank.get(a) ?? pinned.length) - (rank.get(b) ?? pinned.length))
}

/**
 * Bind the gallery's face to one Remote carrier.
 * @param remote - the Client Remote, whose `workspaceFiles` namespace the bundle graph supplies.
 * @returns the face the body calls.
 */
export function createWorkbenchApi(remote: ClientRemote): WorkbenchApi {
  return {
    async readRegistry(sessionId, signal) {
      const raw = await readJsonFile(remote, sessionId, '.noven/workbenches.json', signal)
      if (!raw.ok) return raw
      const workbenches = (raw.value as { workbenches?: unknown } | undefined)?.workbenches
      const records = Array.isArray(workbenches)
        ? workbenches.filter((w): w is WorkbenchRecordView => typeof w?.id === 'string' && typeof w?.title === 'string' && typeof w?.folder === 'string')
        : []
      return { ok: true, value: records }
    },
    async listFolder(sessionId, folder, signal) {
      const listing = await remote.workspaceFiles.list(sessionId, folder, signal)
      // A registered folder that is gone reads as empty, matching the owner's empty state.
      if (!listing.ok) return isNotFound(listing.error) ? { ok: true, value: { images: [], docs: [] } } : listing
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      const names = listing.value.entries
        .filter((entry: WorkspaceDirectoryEntry) => entry.type === 'file')
        .map(entry => entry.name)
        .sort(collator.compare)
      const images = names.filter(isImageName).map(name => `${folder}/${name}`)
      const docs = names.filter(name => !isImageName(name)).map(name => `${folder}/${name}`)
      return { ok: true, value: { images, docs } }
    },
    watchPath(sessionId, path, signal) {
      return watchPath(remote, sessionId, path, signal)
    },
    async loadAnnotations(sessionId, imageRel) {
      const response = await fetch(annotationUrl(sessionId, imageRel), { method: 'GET' })
      if (!response.ok) return httpFailure(response)
      const doc = await response.json() as AnnotationDoc
      return { ok: true, value: Array.isArray(doc.annotations) ? doc.annotations : [] }
    },
    async saveAnnotations(sessionId, imageRel, annotations) {
      const response = await fetch(annotationUrl(sessionId, imageRel), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, image: imageRel, annotations }),
      })
      if (!response.ok) return httpFailure(response)
      return { ok: true, value: await response.json() as { count: number } }
    },
  }
}

/** The annotation route's failure, as a Remote failure value. */
async function httpFailure(response: Response): Promise<{ ok: false, error: RemoteFailure }> {
  const message = (await response.text().catch(() => response.statusText)).slice(0, 300)
  const error: RemoteFailure = new RemoteError('gateway/internal', `annotations http/${String(response.status)}: ${message}`, {})
  return { ok: false, error }
}

/**
 * Observe one path through the workspace watch stream, yielding readiness and
 * change notices until the caller's signal aborts. A watch that cannot open
 * (the path is gone, the stream is refused) simply ends — polling and manual
 * refresh remain the fallbacks.
 */
async function* watchPath(
  remote: ClientRemote,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): AsyncIterable<'ready' | 'change'> {
  if (signal.aborted) return
  const stream = remote.$stream<WorkspaceFileWatchFrame>({
    name: `noven-workbench watch ${path}`,
    open: lifetime => remote.workspaceFiles.changes(sessionId, path, lifetime),
    ended: () => new Error(`watch ended: ${path}`),
  })
  const abort = (): void => { void stream.dispose() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for await (const item of stream) {
      if (signal.aborted) return
      if (item.value.kind === 'ready') item.accept()
      yield item.value.kind
    }
  } finally {
    signal.removeEventListener('abort', abort)
    await stream.dispose()
  }
}

/** Same-origin route URL; the browser's auth cookie rides the request. */
function annotationUrl(sessionId: SessionId, imageRel: string): string {
  const params = new URLSearchParams({ session: sessionId, image: imageRel })
  return new URL(`api/noven-annotations?${params.toString()}`, document.baseURI).href
}
