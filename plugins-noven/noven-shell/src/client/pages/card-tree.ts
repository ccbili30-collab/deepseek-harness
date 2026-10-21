/**
 * Card module-tree helpers shared by the whole-card editor and the card page.
 * @module noven-shell/client/pages/card-tree
 */
import type { CardModuleDoc } from '../card-api.ts'

/** One module row in a flattened tree, with its depth and owning parent. */
export interface FlatRow { readonly row: CardModuleDoc, readonly depth: number, readonly parentId: string | null }

/**
 * Flatten a module tree depth-first, skipping the children of collapsed rows.
 * @param modules - modules at the current level.
 * @param collapsed - module ids whose children stay hidden.
 * @param depth - current depth, starting at zero.
 * @param parentId - id of the owning module, or null at the root.
 * @param out - accumulator used by recursive calls.
 * @returns rows in display order.
 */
export function flatten(modules: readonly CardModuleDoc[], collapsed: ReadonlySet<string>, depth = 0, parentId: string | null = null, out: FlatRow[] = []): FlatRow[] {
  for (const m of modules) {
    out.push({ row: m, depth, parentId })
    if (!collapsed.has(m.id)) flatten(m.children, collapsed, depth + 1, m.id, out)
  }
  return out
}

/**
 * Find a module anywhere in the tree.
 * @param modules - modules at the current level.
 * @param id - module id to find.
 * @returns the matching module, or undefined.
 */
export function findModule(modules: readonly CardModuleDoc[], id: string): CardModuleDoc | undefined {
  for (const m of modules) {
    if (m.id === id) return m
    const nested = findModule(m.children, id)
    if (nested !== undefined) return nested
  }
  return undefined
}
