/**
 * Frame geometry persistence in two slices. Width preferences (sidebar, right
 * panel, unit column) are the user's global drag memory and survive reloads
 * under one record. Structural geometry (nav collapse, narrow override, unit
 * side, drawer fold) belongs to sessions: one record per session id under
 * `bySession`, pruned to the newest few, restored when the visible session
 * changes. Reported chrome (shown/track/rail/fullscreen/instant/preview) is
 * the occupant's live report and is never written; the canvas claim is pulled
 * from the occupant's registered source, so it is not written either.
 */
import { SIDEBAR_DEFAULT } from './columns.ts'
import type { UnitSide } from './arrangement.ts'
import type { LayoutState, SessionGeometry, SessionGeometryRecord } from './stores.ts'

/** localStorage key; bump the version when the record stops reading back. */
export const layoutPersistence = 'dsh.layout.v2'
/** Pre-structural record; read once for width migration, never written. */
const LEGACY_PERSISTENCE = 'dsh.layout.v1'
/** How many session geometry records survive a save. */
const GEOMETRY_CAPACITY = 50

interface SavedRecord {
  sidebar?: number | undefined
  rightbar?: number | null | undefined
  unit?: number | null | undefined
  bySession?: Record<string, SavedGeometry> | undefined
}

interface SavedGeometry {
  sidebarCollapsed?: boolean | undefined
  narrowExpanded?: boolean | undefined
  unitSide?: UnitSide | undefined
  rightbarCollapsed?: boolean | undefined
  updatedAt?: number | undefined
}

/** Persisted state: global width preferences plus the per-session structural records. */
export interface PersistedLayout {
  sidebar: number
  rightbar: number | null
  unit: number | null
  byId: Record<string, SessionGeometryRecord>
}

type LayoutInfo = LayoutState['layoutInfo']

/** @param value - raw JSON.parse output. @returns the record, or undefined when it is not one. */
function toRecord(value: unknown): SavedRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const number = (field: 'sidebar'): number | undefined => typeof raw[field] === 'number' ? raw[field] : undefined
  const nullable = (field: 'rightbar' | 'unit'): number | null | undefined =>
    typeof raw[field] === 'number' ? raw[field] : raw[field] === null ? null : undefined
  const side = (value: unknown): UnitSide | undefined =>
    value === 'left' || value === 'right' ? value : undefined
  const sessions = raw['bySession']
  const bySession = typeof sessions === 'object' && sessions !== null
    ? Object.fromEntries(Object.entries(sessions as Record<string, unknown>).flatMap(([id, entry]) => {
      if (typeof entry !== 'object' || entry === null) return []
      const fields = entry as Record<string, unknown>
      return [[id, {
        sidebarCollapsed: fields['sidebarCollapsed'] === true ? true : undefined,
        narrowExpanded: fields['narrowExpanded'] === true ? true : undefined,
        unitSide: side(fields['unitSide']),
        rightbarCollapsed: fields['rightbarCollapsed'] === true ? true : undefined,
        updatedAt: typeof fields['updatedAt'] === 'number' ? fields['updatedAt'] : undefined,
      } satisfies SavedGeometry]] as [string, SavedGeometry][]
    }))
    : undefined
  return { sidebar: number('sidebar'), rightbar: nullable('rightbar'), unit: nullable('unit'), bySession }
}

/**
 * Read the saved frame geometry.
 * @returns the persisted preferences, or undefined for absent or unreadable records.
 */
export function readLayoutInfo(): PersistedLayout | undefined {
  try {
    let saved: SavedRecord | undefined
    const raw = localStorage.getItem(layoutPersistence)
    if (raw !== null) saved = toRecord(JSON.parse(raw))
    // v1 carried widths only, and encoded a collapsed nav as width 0; the
    // structural fold has no session to attach to, so migration keeps the
    // width and lets the first session enter expanded.
    if (saved === undefined) {
      const legacy = localStorage.getItem(LEGACY_PERSISTENCE)
      if (legacy !== null) saved = toRecord(JSON.parse(legacy))
    }
    if (saved === undefined) return undefined
    return {
      sidebar: saved.sidebar === 0 || saved.sidebar === undefined ? SIDEBAR_DEFAULT : saved.sidebar,
      rightbar: saved.rightbar ?? null,
      unit: saved.unit ?? null,
      byId: Object.fromEntries(Object.entries(saved.bySession ?? {}).map(([id, record]) => [id, {
        sidebarCollapsed: record.sidebarCollapsed ?? false,
        narrowExpanded: record.narrowExpanded ?? false,
        unitSide: record.unitSide ?? 'right',
        rightbarCollapsed: record.rightbarCollapsed ?? false,
        updatedAt: record.updatedAt ?? 0,
      } satisfies SessionGeometryRecord])),
    }
  } catch {
    return undefined
  }
}

/**
 * Persist the frame geometry: global widths plus the newest session records.
 * @param info - the layout info whose preference fields are written.
 * @param byId - the session geometry records to save.
 */
export function writeLayoutInfo(info: LayoutInfo, byId: Record<string, SessionGeometryRecord>): void {
  try {
    const kept = Object.entries(byId)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, GEOMETRY_CAPACITY)
    localStorage.setItem(layoutPersistence, JSON.stringify({
      sidebar: info.sidebar,
      rightbar: info.rightbar,
      unit: info.unit,
      bySession: Object.fromEntries(kept.map(([id, record]) => [id, {
        sidebarCollapsed: record.sidebarCollapsed,
        narrowExpanded: record.narrowExpanded,
        unitSide: record.unitSide,
        rightbarCollapsed: record.rightbarCollapsed,
        updatedAt: record.updatedAt,
      } satisfies SessionGeometryRecord & SessionGeometry])),
    } satisfies SavedRecord))
  } catch {
    // Private-mode storage — the in-session preferences still apply.
  }
}
