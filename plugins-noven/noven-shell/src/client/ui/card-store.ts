/**
 * Card snapshots shared by pages, previews and inline modules.
 * @module noven-shell/client/ui/card-store
 */
import type { CardAddr, CardState } from '../card-api.ts'
import { readColdSync, writeCold, forgetCold } from './cold-store.ts'

/** @param addr - Card home. @param cardId - Root id. @returns Workspace-owned cache key. */
export function cardKey(addr: CardAddr, cardId: string): string {
  return `${addr.root || `session:${addr.sessionId ?? ''}`}::${cardId}`
}

interface Entry {
  state: CardState | undefined
  generation: number
  readonly listeners: Set<(state: CardState | undefined) => void>
}

/** Orders authoritative reads and explicit writes by complete card address. */
export class CardSnapshotStore {
  private readonly entries = new Map<string, Entry>()

  /** @param addr - Card home. @param cardId - Root id. @returns Retained snapshot. */
  get(addr: CardAddr, cardId: string): CardState | undefined {
    return this.entry(addr, cardId).state
  }

  /** @param addr - Card home. @param cardId - Root id. @param state - Snapshot or confirmed deletion. */
  put(addr: CardAddr, cardId: string, state: CardState | undefined): void {
    const entry = this.entry(addr, cardId)
    entry.generation += 1
    this.publish(cardKey(addr, cardId), entry, state)
  }

  /** Invalidate reads started before a write. @param addr - Card home. @param cardId - Root id. */
  acceptWrite(addr: CardAddr, cardId: string): void {
    this.entry(addr, cardId).generation += 1
  }

  /** @param addr - Card home. @param cardId - Root id. @param listener - Observer. @returns Disposer. */
  subscribe(addr: CardAddr, cardId: string, listener: (state: CardState | undefined) => void): () => void {
    const entry = this.entry(addr, cardId)
    entry.listeners.add(listener)
    return () => { entry.listeners.delete(listener) }
  }

  /**
   * Publish only the latest read. Failed reads reject and retain the snapshot.
   * @param addr - Captured card home.
   * @param cardId - Root id.
   * @param load - Reader returning undefined only for confirmed absence.
   * @returns Latest retained snapshot.
   */
  async refresh(addr: CardAddr, cardId: string, load: (addr: CardAddr, cardId: string) => Promise<CardState | undefined>): Promise<CardState | undefined> {
    const entry = this.entry(addr, cardId)
    const generation = ++entry.generation
    const state = await load(addr, cardId)
    if (entry.generation === generation) this.publish(cardKey(addr, cardId), entry, state)
    return entry.state
  }

  private entry(addr: CardAddr, cardId: string): Entry {
    const key = cardKey(addr, cardId)
    let entry = this.entries.get(key)
    if (entry === undefined) {
      entry = { state: readColdSync<CardState>('card', key), generation: 0, listeners: new Set() }
      this.entries.set(key, entry)
    }
    return entry
  }

  private publish(key: string, entry: Entry, state: CardState | undefined): void {
    entry.state = state
    if (state === undefined) forgetCold('card', key)
    else writeCold('card', key, state)
    for (const listener of entry.listeners) listener(state)
  }
}

/** Shared snapshot owner. */
export const cardCache = new CardSnapshotStore()
