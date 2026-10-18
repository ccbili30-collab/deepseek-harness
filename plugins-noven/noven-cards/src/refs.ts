/**
 * Reference index: collection cells of type `person` / `place` may hold a
 * card reference `{ cardId, name, itemId? }` instead of plain text. This
 * module scans every card in a project and collects those cells, producing
 * (a) the picker's target list and (b) cross-card backlinks per target card.
 * Same-card references are included too (their target is the card itself).
 * @module noven-cards/refs
 */
import type { CardStore } from './store.ts'
import type { ContentModule } from './model.ts'
import { decodeCollection } from './formats.ts'

/** One stored reference cell. `name` is denormalized for display; ids drive links. */
export interface CardRef {
  readonly cardId: string
  readonly name: string
  readonly itemId?: string
}

/** One card that references another (through a collection cell). */
export interface RefEntry {
  readonly fromCardId: string
  readonly fromCardName: string
  readonly fromKind: string
  readonly moduleId: string
  readonly moduleName: string
  readonly fieldId: string
  readonly fieldName: string
  readonly itemName: string
}

/** Picker targets plus per-card backlinks. */
export interface ReferenceIndex {
  readonly targets: readonly { readonly cardId: string, readonly name: string, readonly kind: string }[]
  readonly backlinks: Record<string, RefEntry[]>
}

const REF_FIELDS = new Set(['person', 'place'])

/** Read one collection module's decoded payload from the card store. */
async function collectionData(store: CardStore, cardId: string, module: ContentModule): Promise<ReturnType<typeof decodeCollection> | undefined> {
  if (module.widget?.type !== 'collection') return undefined
  const block = module.blocks.find(candidate => candidate.kind === 'text')
  if (block === undefined || block.kind !== 'text') return undefined
  try {
    const bytes = await store.readPayload(cardId, block.content)
    return decodeCollection(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/** True when a stored cell value is a card reference. */
export function asCardRef(value: unknown): CardRef | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.cardId !== 'string' || typeof record.name !== 'string') return undefined
  return {
    cardId: record.cardId,
    name: record.name,
    ...(typeof record.itemId === 'string' ? { itemId: record.itemId } : {}),
  }
}

const flatten = (modules: readonly ContentModule[], out: ContentModule[] = []): ContentModule[] => {
  for (const module of modules) { out.push(module); flatten(module.children, out) }
  return out
}

/**
 * Build the reference index for one project.
 * @param store - card store rooted at the project.
 * @returns picker targets (all live cards) and backlinks keyed by target card.
 */
export async function buildReferenceIndex(store: CardStore): Promise<ReferenceIndex> {
  const ids = await store.list()
  const targets: { cardId: string, name: string, kind: string }[] = []
  const backlinks: Record<string, RefEntry[]> = {}
  for (const cardId of ids) {
    const card = await store.open(cardId)
    if (card === undefined) continue
    targets.push({ cardId, name: card.document.name, kind: card.document.kind })
    for (const module of flatten(card.document.modules)) {
      const data = await collectionData(store, cardId, module)
      if (data === undefined) continue
      for (const item of data.items) {
        const values = data.values[item.id]
        if (values === undefined) continue
        for (const field of data.fields) {
          if (!REF_FIELDS.has(field.type)) continue
          const ref = asCardRef(values[field.id])
          if (ref === undefined) continue
          const list = backlinks[ref.cardId] ?? []
          list.push({
            fromCardId: cardId,
            fromCardName: card.document.name,
            fromKind: card.document.kind,
            moduleId: module.id,
            moduleName: module.name,
            fieldId: field.id,
            fieldName: field.name,
            itemName: item.name,
          })
          backlinks[ref.cardId] = list
        }
      }
    }
  }
  return { targets, backlinks }
}
