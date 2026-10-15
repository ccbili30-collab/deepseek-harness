/** Validated, disposable browser copies of Host-owned Session history windows. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionAddress, SessionWireEvent } from '../../types.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionEventWindow, SessionLiveEventEntry } from '../contract/events.ts'
import { assertSessionWireEvent } from '../session-wire-event.ts'

/** Complete durable window; transient chunks and control projections are never stored. */
export interface CachedHistory {
  readonly entries: readonly SessionLiveEventEntry[]
  readonly hasMore: boolean
}

/** Session-owned cache I/O; a successful read does not grant transport authority. */
export interface HistoryCache {
  /** @param address - exact history route. @returns a validated copy, or no usable copy. */
  read(address: SessionAddress): Promise<CachedHistory | undefined>
  /** @param address - exact history route. @param window - latest Host-derived window. */
  write(address: SessionAddress, window: SessionEventWindow): Promise<void>
  /** @param sessionId - deleted ordinary Session; in-flight copies must not recreate it. */
  remove(sessionId: SessionId): Promise<void>
}

/** Browser cache retention limits supplied by the Client plugin configuration. */
export interface HistoryCacheLimits {
  readonly maxBytes: number
  readonly maxEntries: number
}

interface RecordValue extends CachedHistory {
  readonly version: 1
  readonly key: string
  readonly sessionId: SessionId
  readonly savedAt: number
}

const STORE = 'history'

function addressKey(address: SessionAddress): string {
  return address.kind === 'session'
    ? JSON.stringify(['session', address.sessionId])
    : JSON.stringify(['subagent', address.parentSessionId, address.childSessionId])
}

function identity(address: SessionAddress): SessionId {
  return address.kind === 'session' ? address.sessionId : address.childSessionId
}

function decode(value: unknown, key: string, sessionId: SessionId): CachedHistory | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const row = value as Partial<RecordValue>
  if (row.version !== 1 || row.key !== key || row.sessionId !== sessionId
    || !Number.isSafeInteger(row.savedAt) || typeof row.hasMore !== 'boolean' || !Array.isArray(row.entries)) return undefined
  let previous = -1
  const entries: SessionLiveEventEntry[] = []
  const candidates: readonly unknown[] = row.entries
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null || !('type' in candidate)
      || candidate.type !== 'event' || !('event' in candidate)) return undefined
    try { assertSessionWireEvent(candidate.event) } catch (_error) { return undefined /* Invalid disk record is not a history baseline. */ }
    const event: SessionWireEvent = candidate.event
    if (event.seq <= previous) return undefined
    previous = event.seq
    entries.push({ type: 'event', event: event as SessionEvent })
  }
  return { entries, hasMore: row.hasMore }
}

/** IndexedDB-only history store. Transactions serialize writes and persistent deletion tombstones. */
export class BrowserHistoryCache implements HistoryCache {
  private database: Promise<IDBDatabase> | undefined
  private readonly removed = new Set<SessionId>()
  private closed = false

  /**
   * @param factory - current browser's IndexedDB, absent when storage is unavailable.
   * @param limits - per-window UTF-8 bytes and maximum retained windows.
   * @param name - database namespace belonging to this application origin.
   */
  constructor(
    private readonly factory: IDBFactory | undefined,
    private readonly limits: HistoryCacheLimits,
    private readonly name = 'dsh-session-history-v1',
  ) {}

  async read(address: SessionAddress): Promise<CachedHistory | undefined> {
    const id = identity(address)
    if (this.unavailable(id)) return undefined
    try {
      const db = await this.open()
      if (db === undefined || this.unavailable(id)) return undefined
      const key = addressKey(address)
      const value = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const request = tx.objectStore(STORE).get(key)
        tx.oncomplete = () => { resolve(request.result) }
        tx.onabort = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
        tx.onerror = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
      })
      if (this.unavailable(id)) return undefined
      return decode(value, key, id)
    } catch (error) {
      console.warn('[session-controller] history cache read unavailable', error)
      return undefined
    }
  }

  async write(address: SessionAddress, window: SessionEventWindow): Promise<void> {
    const id = identity(address)
    if (this.unavailable(id)) return
    const key = addressKey(address)
    const row: RecordValue = {
      version: 1, key, sessionId: id, savedAt: Date.now(), hasMore: window.hasMore,
      entries: window.entries.filter((entry): entry is SessionLiveEventEntry => entry.type === 'event'),
    }
    try {
      // An oversized replacement removes the old copy rather than silently keeping stale history.
      const oversized = new TextEncoder().encode(JSON.stringify(row)).byteLength > this.limits.maxBytes
      const db = await this.open()
      if (db === undefined || this.unavailable(id)) return
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const tombstone = store.get(`removed:${id}`)
        tombstone.onsuccess = () => {
          if (tombstone.result !== undefined) return
          if (oversized || row.entries.length === 0) store.delete(key)
          else store.put(row, key)
          // The index returns keys only, never clones other sessions' transcript payloads.
          let retained = oversized || row.entries.length === 0 ? 0 : 1
          const cursor = store.index('savedAt').openKeyCursor(null, 'prev')
          cursor.onsuccess = () => {
            const item = cursor.result
            if (item === null) return
            if (item.primaryKey !== key && ++retained > this.limits.maxEntries) store.delete(item.primaryKey)
            item.continue()
          }
        }
        tx.oncomplete = () => { resolve() }
        tx.onabort = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
        tx.onerror = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
      })
    } catch (error) {
      console.warn('[session-controller] history cache write unavailable', error)
    }
  }

  async remove(sessionId: SessionId): Promise<void> {
    this.removed.add(sessionId)
    try {
      const db = await this.open()
      if (db === undefined || this.closed) return
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        store.put({ removed: true }, `removed:${sessionId}`)
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          const item = cursor.result
          if (item === null) return
          const value = item.value as Partial<RecordValue>
          if (value.sessionId === sessionId) item.delete()
          item.continue()
        }
        tx.oncomplete = () => { resolve() }
        tx.onabort = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
        tx.onerror = () => { reject(tx.error ?? new Error('History cache transaction failed')) }
      })
    } catch (error) {
      console.warn('[session-controller] history cache deletion unavailable', error)
    }
  }

  /** Stop new work and close the connection after its current transactions finish. */
  async dispose(): Promise<void> {
    this.closed = true
    const db = await this.database
    db?.close()
  }

  private unavailable(id: SessionId): boolean {
    return this.closed || this.removed.has(id)
  }

  private open(): Promise<IDBDatabase | undefined> {
    if (this.factory === undefined || this.closed) return Promise.resolve(undefined)
    if (this.database === undefined) {
      const factory = this.factory
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(this.name, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE).createIndex('savedAt', 'savedAt')
        }
        request.onsuccess = () => {
          const db = request.result
          if (this.closed) { db.close(); resolve(db); return }
          db.onversionchange = () => { db.close(); this.database = undefined }
          resolve(db)
        }
        request.onerror = () => { this.database = undefined; reject(request.error ?? new Error('History cache open failed')) }
        request.onblocked = () => { this.database = undefined; reject(new Error('History cache upgrade blocked')) }
      })
    }
    return this.database
  }
}
