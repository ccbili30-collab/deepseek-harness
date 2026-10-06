/**
 * Creative-library client side of `/api/noven-library`: the manifest payload
 * type, the op mutations, and two observables — one per-project catalog for
 * the 创作库 overview, one per-project manifest for the project page.
 * @module noven-shell/client/library-api
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

export type WorkKind = 'image' | 'text' | 'map' | 'comic' | 'card' | 'other'
export type WorkStage = 'draft' | 'final' | 'published'

export interface FileRef { readonly path: string }
export type WorkSource = { readonly type: 'session'; readonly sessionId: string } | { readonly type: 'manual' }

export interface WorkRevision {
  readonly ref: FileRef
  readonly label: string
  readonly at: string
  readonly source: WorkSource
}

export interface LibraryWork {
  readonly id: string
  readonly title: string
  readonly kind: WorkKind
  readonly stage: WorkStage
  readonly archived: boolean
  readonly primary: FileRef
  readonly revisions: readonly WorkRevision[]
  readonly cover?: FileRef
  readonly cardIds: readonly string[]
  readonly source: WorkSource
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CardMeta { readonly stage: WorkStage; readonly archived: boolean; readonly role?: string }
export interface ProjectMeta { readonly id: string; readonly title: string; readonly description?: string }
export interface InboxItem { readonly path: string; readonly kind: WorkKind; readonly bytes?: number }

/** What `GET /api/noven-library` returns for one project workspace. */
export interface LibraryPayload {
  readonly revision: number
  readonly project: ProjectMeta | null
  readonly works: readonly LibraryWork[]
  readonly cardMeta: Record<string, CardMeta>
  readonly inbox: readonly InboxItem[]
}

/** One row on the 创作库 overview — one workspace that carries a project. */
export interface ProjectRow {
  /** A session bound to this workspace, when one exists — API calls may also go by `root`. */
  readonly sessionId: SessionId | undefined
  readonly root: string
  readonly title: string
  readonly description: string | undefined
  /** The directory moved away or was removed — the pointer stays, the row degrades. */
  readonly missing: boolean
  readonly works: number
  readonly cards: number
  readonly pending: number
  readonly kindCounts: Readonly<Partial<Record<WorkKind, number>>>
  /** Up to four workspace-relative image paths for the cover collage. */
  readonly covers: readonly string[]
  readonly updatedAt: string | undefined
}

/** A project address: the session whose cwd names it, or the workspace root itself. */
export interface ProjectAddr {
  readonly sessionId?: SessionId
  readonly root?: string
}

const api = (addr: ProjectAddr): string => addr.sessionId !== undefined
  ? `/api/noven-library?session=${encodeURIComponent(addr.sessionId)}`
  : `/api/noven-library?root=${encodeURIComponent(addr.root ?? '')}`

/** Fetch one project's manifest payload; undefined on a missing session or route. */
export async function fetchLibrary(addr: ProjectAddr): Promise<LibraryPayload | undefined> {
  const response = await fetch(api(addr)).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return (await response.json()) as LibraryPayload
}

export interface LibraryOp {
  readonly op: string
  readonly workId?: string
  readonly cardId?: string
  readonly path?: string
  readonly title?: string
  readonly kind?: string
  readonly stage?: string
  readonly label?: string
  readonly revisionIndex?: number
  readonly archived?: boolean
  readonly baseRevision?: number
}

/** Apply one manifest op; throws on conflict so callers can refetch and retry. */
export async function libraryOp(addr: ProjectAddr, op: LibraryOp): Promise<number> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `library op failed (${response.status})`)
  const parsed = JSON.parse(text) as { revision?: number }
  return parsed.revision ?? 0
}

/** Lazily-pulled manifest for one project; `refresh()` repolls after mutations. */
export function libraryFor(addr: ProjectAddr): ObservableSnapshot<LibraryPayload | undefined> & { readonly refresh: () => void } {
  let snapshot: LibraryPayload | undefined
  const listeners = new Set<() => void>()
  let started = false
  let generation = 0
  const pull = async () => {
    const gen = ++generation
    const payload = await fetchLibrary(addr)
    if (gen !== generation) return
    snapshot = payload
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    refresh: () => { void pull() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) { started = true; void pull() }
      return () => { listeners.delete(listener) }
    },
  }
}

/** Registry mutation: register / unregister / create against `/api/noven-projects`. */
export async function projectOp(op: { op: 'register' | 'unregister' | 'create' | 'rename'; root: string; title?: string; description?: string }): Promise<ProjectRow | undefined> {
  const response = await fetch('/api/noven-projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `project op failed (${response.status})`)
  return (JSON.parse(text) as { row?: ProjectRow }).row
}

/**
 * The 创作库 root grid: every registered project root, resolved server-side —
 * empty and session-less projects are rows like any other; a moved-away
 * directory flags `missing` instead of vanishing.
 */
export function projectsCatalog(sessions: ClientContext['sessions']): ObservableSnapshot<readonly ProjectRow[]> & { readonly refresh: () => void } {
  let snapshot: readonly ProjectRow[] = []
  const listeners = new Set<() => void>()
  let started = false
  let inFlight = false
  let queued = false
  const sameRows = (a: readonly ProjectRow[], b: readonly ProjectRow[]): boolean =>
    a.length === b.length && a.every((row, i) => row.root === b[i]?.root && row.title === b[i]?.title
      && row.sessionId === b[i]?.sessionId && row.missing === b[i]?.missing && row.updatedAt === b[i]?.updatedAt)
  const publish = (rows: readonly ProjectRow[]): void => {
    if (sameRows(rows, snapshot)) return
    snapshot = rows
    for (const listener of listeners) listener()
  }
  // 单飞 + 尾随：会话通知是风暴源（活动会话每次状态跳动都触发），在飞的
  // 请求被丢弃会让快照永远停在旧数据——必须让最后一次取回的结果落地。
  const compute = async (): Promise<void> => {
    if (inFlight) { queued = true; return }
    inFlight = true
    try {
      for (;;) {
        queued = false
        const response = await fetch('/api/noven-projects').catch(() => undefined)
        if (response === undefined || !response.ok) return
        const { projects } = await response.json() as { projects: readonly (Omit<ProjectRow, 'sessionId'> & { sessionId?: SessionId })[] }
        // A session bound to the root makes API calls cheap; rows without one go by root.
        const state = sessions.list.getSnapshot()
        const byRoot = new Map<string, SessionId>()
        for (const id of state.ids) {
          const cwd = state.byId[id]?.cwd
          if (cwd !== undefined && !byRoot.has(cwd)) byRoot.set(cwd, id)
        }
        const rows = projects.map(p => ({ ...p, sessionId: byRoot.get(p.root) }))
        rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
        publish(rows)
        if (!queued) return
      }
    } finally {
      inFlight = false
    }
  }
  // 注册表在服务端也会被改写（autoClaim 重新认领、别的窗口注销），
  // 会话通知覆盖不到这些——按树的节奏轮询兜底，全体订阅者共享一条。
  let timer: ReturnType<typeof setInterval> | undefined
  let disposeSessions: (() => void) | undefined
  return {
    getSnapshot: () => snapshot,
    refresh: () => { void compute() },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (!started) { started = true; void compute() }
      if (timer === undefined) {
        timer = setInterval(() => { void compute() }, 2000)
        disposeSessions = sessions.list.subscribe(() => { void compute() })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          clearInterval(timer)
          timer = undefined
          disposeSessions?.()
          disposeSessions = undefined
        }
      }
    },
  }
}
