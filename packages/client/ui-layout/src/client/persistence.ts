/**
 * Frame geometry persistence: the column preferences a drag leaves behind —
 * sidebar width, right panel width and collapse request, and the unit column
 * width — survive a reload under one record. Reported chrome (shown/track/
 * canvas/rail/fullscreen/instant/preview) is the occupant's live report and is
 * never written.
 */
import { SIDEBAR_DEFAULT } from './columns.ts'
import type { LayoutState } from './stores.ts'

/** localStorage key; bump the version when the record stops reading back. */
export const layoutPersistence = 'dsh.layout.v1'

interface SavedRecord {
  sidebar?: number
  rightbar?: number | null
  unit?: number | null
  rightbarCollapsed?: boolean
}

type LayoutInfo = LayoutState['layoutInfo']

/** @param value - raw JSON.parse output. @returns the record, or undefined when it is not one. */
function toRecord(value: unknown): SavedRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Record<string, unknown>
  const number = (field: 'sidebar'): number | undefined => typeof raw[field] === 'number' ? raw[field] as number : undefined
  const nullable = (field: 'rightbar' | 'unit'): number | null | undefined =>
    typeof raw[field] === 'number' ? raw[field] as number : raw[field] === null ? null : undefined
  return {
    sidebar: number('sidebar'),
    rightbar: nullable('rightbar'),
    unit: nullable('unit'),
    rightbarCollapsed: typeof raw['rightbarCollapsed'] === 'boolean' ? raw['rightbarCollapsed'] : undefined,
  }
}

/**
 * Read the saved frame geometry.
 * @returns the persisted preferences, or undefined for absent or unreadable records.
 */
export function readLayoutInfo(): Pick<LayoutInfo, 'sidebar' | 'rightbar' | 'unit' | 'rightbarCollapsed'> | undefined {
  try {
    const raw = localStorage.getItem(layoutPersistence)
    if (raw === null) return undefined
    const saved = toRecord(JSON.parse(raw))
    if (saved === undefined) return undefined
    return {
      sidebar: saved.sidebar ?? SIDEBAR_DEFAULT,
      rightbar: saved.rightbar ?? null,
      unit: saved.unit ?? null,
      rightbarCollapsed: saved.rightbarCollapsed ?? false,
    }
  } catch {
    return undefined
  }
}

/**
 * Persist the frame geometry.
 * @param info - the layout info whose preference fields are written.
 */
export function writeLayoutInfo(info: LayoutInfo): void {
  try {
    localStorage.setItem(layoutPersistence, JSON.stringify({
      sidebar: info.sidebar,
      rightbar: info.rightbar,
      unit: info.unit,
      rightbarCollapsed: info.rightbarCollapsed,
    } satisfies SavedRecord))
  } catch {
    // Private-mode storage — the in-session preferences still apply.
  }
}
