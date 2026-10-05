/**
 * noven-library data model — the app-ledger `library.json` manifest is the
 * single source of truth for what the creative library shows. Files may live
 * anywhere under the project root; only registered paths render in the UI.
 * @module noven-library/model
 */

/** Visual type of a registered work — drives the section it lands in. */
export type WorkKind = 'image' | 'text' | 'map' | 'comic' | 'card' | 'other'

/** Lifecycle stage rendered as a badge and a filter, never as a board lane. */
export type WorkStage = 'draft' | 'final' | 'published'

/** A file inside the project root; always a normalized relative path. */
export interface FileRef {
  readonly path: string
}

/** Where a registration or revision came from. */
export type WorkSource = { readonly type: 'session'; readonly sessionId: string } | { readonly type: 'manual' }

/** One historical version of a work, folded under its primary file. */
export interface WorkRevision {
  readonly ref: FileRef
  readonly label: string
  readonly at: string
  readonly source: WorkSource
}

/** One registered work: a current file plus its folded history chain. */
export interface Work {
  readonly id: string
  title: string
  kind: WorkKind
  stage: WorkStage
  archived: boolean
  primary: FileRef
  revisions: WorkRevision[]
  cover?: FileRef
  cardIds: string[]
  source: WorkSource
  createdAt: string
  updatedAt: string
}

/** Stage and archive flags for a card already stored under `卡/`. */
export interface CardMeta {
  stage: WorkStage
  archived: boolean
  /** Free-form role inside the project, e.g. `world`, `character`. */
  role?: string
}

/** The manifest document — `library.json` inside the project's ledger dir. */
export interface Library {
  readonly version: 1
  /** Optimistic-lock counter; bumped on every committed write. */
  revision: number
  works: Work[]
  cardMeta: Record<string, CardMeta>
  /** Workspace-relative paths the user or the model chose to leave unshown. */
  ignored: string[]
}

/** Identity of the project itself — registry row plus the `.noven/project.json` marker. */
export interface ProjectMeta {
  readonly version: 1
  id: string
  title: string
  description?: string
  createdAt: string
}

export const WORK_KINDS: readonly WorkKind[] = ['image', 'text', 'map', 'comic', 'card', 'other']
export const WORK_STAGES: readonly WorkStage[] = ['draft', 'final', 'published']

/** Reject absolute paths, escapes, and `.noven` internals. */
export function validRelPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
  if (normalized.startsWith('/') || normalized.startsWith('..') || normalized.includes('/../')) return false
  if (normalized === '.noven' || normalized.startsWith('.noven/')) return false
  return true
}

/** Normalize a caller-supplied relative path into the stored form. */
export function normalizeRel(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

/** Parse a persisted library document, tolerating absence and malformed fields. */
export function parseLibrary(raw: unknown): Library {
  const doc = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const works = Array.isArray(doc.works)
    ? doc.works.filter((w): w is Work => typeof w === 'object' && w !== null && typeof (w as { id?: unknown }).id === 'string' && typeof (w as { primary?: { path?: unknown } }).primary?.path === 'string')
    : []
  const cardMeta: Record<string, CardMeta> = {}
  if (typeof doc.cardMeta === 'object' && doc.cardMeta !== null) {
    for (const [cardId, meta] of Object.entries(doc.cardMeta)) {
      if (typeof meta === 'object' && meta !== null && WORK_STAGES.includes((meta as CardMeta).stage)) {
        cardMeta[cardId] = meta as CardMeta
      }
    }
  }
  const ignored = Array.isArray(doc.ignored) ? doc.ignored.filter((p): p is string => typeof p === 'string') : []
  return {
    version: 1,
    revision: typeof doc.revision === 'number' ? doc.revision : 0,
    works,
    cardMeta,
    ignored,
  }
}

/** Parse a persisted project identity, tolerating absence. */
export function parseProject(raw: unknown): ProjectMeta | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const doc = raw as Record<string, unknown>
  if (typeof doc.id !== 'string' || typeof doc.title !== 'string') return undefined
  return {
    version: 1,
    id: doc.id,
    title: doc.title,
    ...(typeof doc.description === 'string' ? { description: doc.description } : {}),
    createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : new Date(0).toISOString(),
  }
}
