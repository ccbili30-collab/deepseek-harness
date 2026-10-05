/**
 * The gallery's asynchronous face: directory listings ride the standard
 * `workspaceFiles` Remote namespace (read-only, workspace-fenced); the
 * registry and annotations ride this plugin's own `/api/noven-workbenches`
 * and `/api/noven-annotations` routes, since both live in the app ledger
 * outside the workspace fence.
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
  /** Per-file frame bindings: workspace-relative source → frame HTML. */
  readonly views?: Readonly<Record<string, string>>
  /** Latest one-shot presentation; the drawer stages it once per timestamp. */
  readonly present?: { readonly path: string; readonly at: string }
  /** Visibility rules over workbench-relative paths (V3 port). */
  readonly visibility?: {
    readonly include: readonly string[]
    readonly exclude: readonly string[]
    readonly autoIncludeNewFiles: boolean
    readonly files?: readonly string[]
  }
}

/**
 * The built-in workbench every workspace carries: the whole project tree,
 * always first in the switcher, never registered and never removable.
 * `folder` empty means the workspace root.
 */
export const BUILTIN_FILES: WorkbenchRecordView = {
  id: 'builtin:files',
  title: '文件',
  folder: '',
  visible: true,
}

/** Compose the nav's record list: the built-in floor plus the registered rows. */
export function withBuiltin(records: readonly WorkbenchRecordView[] | undefined): readonly WorkbenchRecordView[] | undefined {
  if (records === undefined) return undefined
  return [BUILTIN_FILES, ...records.filter(record => record.visible)]
}

/** Join a workbench-relative tail onto a possibly-empty root without a leading slash. */
export function joinRel(root: string, tail: string): string {
  return root === '' ? tail : `${root}/${tail}`
}

/** File extensions the gallery treats as images. */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])

/** Whether a listed name is an image the gallery can stage. */
export function isImageName(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** File extensions the stage reads as in-place documents. */
const TEXT_EXTENSIONS = new Set(['md', 'mdx', 'txt', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'log', 'ini', 'cfg'])

/** Lowercased extension of a name; `''` when it has none. */
export function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Whether the doc stage should attempt this file: a known text extension, or
 * none at all — extensionless names (card content blocks like `c1`) are probed
 * as text, and the stage falls back to the unsupported view when the read
 * reports non-text bytes.
 */
export function isTextCandidate(name: string): boolean {
  const suffix = fileExt(name)
  return TEXT_EXTENSIONS.has(suffix) || suffix === ''
}

/** Whether this file is a framed HTML page (interactive entry or bound frame host). */
export function isHtmlEntry(name: string): boolean {
  const suffix = fileExt(name)
  return suffix === 'html' || suffix === 'htm'
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
  /** Read the workbench registry through `/api/noven-workbenches`; an absent registry is an empty list. */
  readonly readRegistry: (sessionId: SessionId, signal: AbortSignal) => Promise<RemoteResult<readonly WorkbenchRecordView[]>>
  /** List one workbench folder into the gallery's split view. */
  readonly listFolder: (sessionId: SessionId, folder: string, signal: AbortSignal) => Promise<RemoteResult<FolderView>>
  /** List one directory's raw entries for the resource tree. */
  readonly listDir: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<readonly WorkspaceDirectoryEntry[]>>
  /** Read one small text file; absence reads as undefined, matching readJsonFile. */
  readonly readText: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<string | undefined>>
  /** Observe one path (a file or a directory's direct entries) for change notifications. */
  readonly watchPath: (sessionId: SessionId, path: string, signal: AbortSignal) => AsyncIterable<'ready' | 'change'>
  /** Load one image's annotation sidecar; absent reads as an empty document. */
  readonly loadAnnotations: (sessionId: SessionId, imageRel: string) => Promise<RemoteResult<readonly AnnotationRecord[]>>
  /** Replace one image's annotation sidecar. */
  readonly saveAnnotations: (sessionId: SessionId, imageRel: string, annotations: readonly AnnotationRecord[]) => Promise<RemoteResult<{ count: number }>>
  /**
   * Write a workspace text file through `/api/noven-doc`. `base` is the text
   * the editor loaded — the host refuses (conflict) when the file changed
   * since; `base: null` overwrites unconditionally.
   */
  readonly saveDoc: (sessionId: SessionId, path: string, content: string, base: string | null) => Promise<RemoteResult<{ ok: true } | { conflict: true }>>
}

/**
 * The sandboxed frame URL for a workspace file: `/api/noven-frame` serves it
 * with `Access-Control-Allow-Origin: *` so the opaque-origin iframe can still
 * fetch its siblings; `src` names the source file a view-binding frame reads.
 */
export function frameUrl(sessionId: SessionId, rel: string, src?: string): string {
  const params = new URLSearchParams({ session: sessionId, path: rel })
  if (src !== undefined) params.set('src', src)
  return new URL(`api/noven-frame?${params.toString()}`, document.baseURI).href
}

/**
 * Probe a frame URL before its iframe mounts. A missing route, a moved or
 * deleted file, and a `frame-ancestors` policy that refuses this origin would
 * each render the server's bare error text inside the iframe; a `false`
 * answer lets the caller draw its own error surface instead.
 * @param url - the frame URL from {@link frameUrl}.
 * @param signal - caller cancellation.
 * @returns whether the frame document will load.
 */
export async function probeFrame(url: string, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(url, { method: 'HEAD', signal }).catch(() => undefined)
  if (response === undefined || !response.ok) return false
  const csp = response.headers.get('content-security-policy') ?? ''
  const ancestors = /frame-ancestors\s+([^;]+)/u.exec(csp)?.[1]
  if (ancestors === undefined) return true
  return ancestors.split(/\s+/u).some(rule => rule === '*' || rule === location.origin)
}

/** Whether a Remote failure just means "nothing there yet" — an absent file or folder, not a broken read. */
function isNotFound(failure: RemoteFailure): boolean {
  return failure.code === 'workspace-file/not-found'
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
      const response = await fetch(`/api/noven-workbenches?session=${encodeURIComponent(sessionId)}`, { signal })
        .catch(() => undefined)
      if (response === undefined || !response.ok) return httpFailure(response ?? new Response('route unreachable', { status: 502 }))
      const workbenches = ((await response.json()) as { workbenches?: unknown }).workbenches
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
    async listDir(sessionId, path, signal) {
      const listing = await remote.workspaceFiles.list(sessionId, path, signal)
      if (!listing.ok) return isNotFound(listing.error) ? { ok: true, value: [] } : listing
      return { ok: true, value: listing.value.entries }
    },
    async readText(sessionId, path, signal) {
      const page = await remote.workspaceFiles.read(sessionId, path, {}, signal).catch(() => undefined)
      if (page === undefined || !page.ok) {
        return page !== undefined && !page.ok && !isNotFound(page.error)
          ? page
          : { ok: true as const, value: undefined }
      }
      return { ok: true, value: page.value.text }
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
    async saveDoc(sessionId, path, content, base) {
      const params = new URLSearchParams({ session: sessionId })
      const response = await fetch(new URL(`api/noven-doc?${params.toString()}`, document.baseURI).href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: sessionId, path, content, base }),
      })
      if (response.status === 409) return { ok: true, value: { conflict: true as const } }
      if (!response.ok) return httpFailure(response)
      return { ok: true, value: { ok: true as const } }
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
