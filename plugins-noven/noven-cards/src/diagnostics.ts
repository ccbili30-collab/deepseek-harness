/**
 * Surface diagnostics ring — the client's console lines and runtime errors per
 * card/module, readable by the AI through `surface_diagnostics`.
 *
 * This is operational data, not card content: it lives under
 * `.noven/diagnostics/` in the project, capped per module, and never enters a
 * card document. A write merges into the ring so two open tabs cannot erase
 * each other's tail.
 * @module noven-cards/diagnostics
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Console severity the sandbox relays. */
export type DiagnosticLevel = 'log' | 'warn' | 'error'

/** One relayed console line or runtime error. */
export interface DiagnosticEntry {
  readonly level: DiagnosticLevel
  readonly text: string
  /** Client clock (ms); absent for entries posted by an older client. */
  readonly at?: number
}

/** One module's diagnostics tail. */
export interface SurfaceDiagnostics {
  readonly cardId: string
  readonly moduleId: string
  readonly entries: readonly DiagnosticEntry[]
  readonly updatedAt: number
  /** Set when the stored tail was trimmed to the cap. */
  readonly dropped: number
}

/** Entries kept per module — enough for a boot failure plus a few interactions. */
export const DIAGNOSTICS_CAP = 200
const TEXT_LIMIT = 4000

const safe = (id: string): string => id.replace(/[^A-Za-z0-9._-]/g, '_')

/** Directory holding per-module diagnostics tails. */
export function diagnosticsDir(root: string): string {
  return join(root, '.noven', 'diagnostics')
}

/** File for one card/module pair. */
export function diagnosticsPath(root: string, cardId: string, moduleId: string): string {
  return join(diagnosticsDir(root), `${safe(cardId)}--${safe(moduleId)}.json`)
}

/** Normalize one incoming entry; unknown levels become `log`, text is capped. */
function normalizeEntry(raw: unknown): DiagnosticEntry | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  if (typeof value.text !== 'string' || value.text === '') return undefined
  const level = value.level === 'error' || value.level === 'warn' ? value.level : 'log'
  return {
    level,
    text: value.text.slice(0, TEXT_LIMIT),
    ...(typeof value.at === 'number' && Number.isFinite(value.at) ? { at: value.at } : {}),
  }
}

/** Read one module's tail; absent or malformed files read as empty. */
export async function readDiagnostics(root: string, cardId: string, moduleId: string): Promise<SurfaceDiagnostics | undefined> {
  try {
    const raw = JSON.parse(await readFile(diagnosticsPath(root, cardId, moduleId), 'utf8')) as unknown
    if (typeof raw !== 'object' || raw === null) return undefined
    const value = raw as Record<string, unknown>
    const entries = Array.isArray(value.entries)
      ? value.entries.flatMap(entry => {
        const normalized = normalizeEntry(entry)
        return normalized === undefined ? [] : [normalized]
      })
      : []
    return {
      cardId,
      moduleId,
      entries,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
      dropped: typeof value.dropped === 'number' ? value.dropped : 0,
    }
  } catch {
    // Absent or unreadable: no diagnostics yet, not an error.
    return undefined
  }
}

/**
 * Merge a client batch into the module's ring.
 * @param root - project root.
 * @param cardId - owning card id.
 * @param moduleId - surface module id.
 * @param incoming - console entries posted by the sandbox host.
 * @returns the stored tail.
 */
export async function appendDiagnostics(root: string, cardId: string, moduleId: string, incoming: readonly unknown[]): Promise<SurfaceDiagnostics> {
  const previous = await readDiagnostics(root, cardId, moduleId)
  const merged = [...(previous?.entries ?? []), ...incoming.flatMap(entry => {
    const normalized = normalizeEntry(entry)
    return normalized === undefined ? [] : [normalized]
  })]
  const dropped = (previous?.dropped ?? 0) + Math.max(0, merged.length - DIAGNOSTICS_CAP)
  const entries = merged.slice(-DIAGNOSTICS_CAP)
  const stored: SurfaceDiagnostics = { cardId, moduleId, entries, updatedAt: Date.now(), dropped }
  await mkdir(diagnosticsDir(root), { recursive: true })
  await writeFile(diagnosticsPath(root, cardId, moduleId), `${JSON.stringify(stored, null, 2)}\n`)
  return stored
}
