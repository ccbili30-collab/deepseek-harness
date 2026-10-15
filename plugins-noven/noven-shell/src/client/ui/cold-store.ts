/**
 * Cold layer (设计理念 §14): structured snapshots that survive a full page
 * reload. The warm layer (retain.ts / in-memory sources) resets on reload;
 * this is the on-disk backing that lets the first paint after a refresh show
 * the last session's transcript and card contents instead of an empty view.
 *
 * Storage: IndexedDB (async, generous quota) with a synchronous localStorage
 * bootstrap mirror for values needed before paint. Write-through to both; the
 * bootstrap mirror only holds small keys (sizes are capped per namespace).
 *
 * This is JSON data, never screenshots:
 *  - transcript events are the durable SessionEvent entries
 *  - card snapshots are the card document JSON
 * Each key is namespaced; deleting a session/card/project drops its keys.
 */

const DB_NAME = 'noven-cold-v1'
const STORE = 'kv'
/** Bootstrap mirror holds entries at or below this size; larger values are IndexedDB-only. */
const MIRROR_MAX_BYTES = 200 * 1024
/** Hard ceiling per entry — refuse to cache absurd payloads. */
const ENTRY_MAX_BYTES = 8 * 1024 * 1024
/** Maximum tracked keys per namespace (LRU). */
const MAX_KEYS = 200

export type ColdNamespace = 'transcript' | 'card'

const MIRROR_PREFIX = 'noven.cold.'

interface MirrorEntry<T> {
  readonly v: 1
  readonly ns: ColdNamespace
  readonly key: string
  readonly at: number
  readonly value: T
}

function entryKey(ns: ColdNamespace, key: string): string {
  return `${ns}:${key}`
}

function mirrorStorageKey(fullKey: string): string {
  return `${MIRROR_PREFIX}${fullKey}`
}

function safeJsonParse<T>(raw: string | null): MirrorEntry<T> | undefined {
  if (raw === null) return undefined
  try {
    const value = JSON.parse(raw) as Partial<MirrorEntry<T>>
    if (value?.v === 1 && typeof value.ns === 'string' && typeof value.key === 'string' && 'value' in value) {
      return value as MirrorEntry<T>
    }
  } catch {
    // Corrupt mirror entry — ignored and overwritten on the next write.
  }
  return undefined
}

let dbPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> | undefined {
  if (typeof indexedDB === 'undefined') return undefined
  if (dbPromise === undefined) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

function idbGet<T>(fullKey: string): Promise<T | undefined> {
  const db = openDb()
  if (db === undefined) return Promise.resolve(undefined)
  return db.then(database => new Promise<T | undefined>(resolve => {
    const tx = database.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(fullKey)
    request.onsuccess = () => {
      const entry = request.result as MirrorEntry<T> | undefined
      resolve(entry?.value)
    }
    request.onerror = () => resolve(undefined)
  })).catch(() => undefined)
}

function idbSet<T>(fullKey: string, entry: MirrorEntry<T>): Promise<void> {
  const db = openDb()
  if (db === undefined) return Promise.resolve()
  return db.then(database => new Promise<void>(resolve => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(entry, fullKey)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })).catch(() => undefined)
}

function idbDelete(fullKey: string): Promise<void> {
  const db = openDb()
  if (db === undefined) return Promise.resolve()
  return db.then(database => new Promise<void>(resolve => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(fullKey)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })).catch(() => undefined)
}

/** Synchronous bootstrap read — only localStorage-mirrored (small) values. */
export function readColdSync<T>(ns: ColdNamespace, key: string): T | undefined {
  if (typeof localStorage === 'undefined') return undefined
  return safeJsonParse<T>(localStorage.getItem(mirrorStorageKey(entryKey(ns, key))) ?? null)?.value
}

/** Async read: bootstrap mirror first, then IndexedDB. */
export async function readCold<T>(ns: ColdNamespace, key: string): Promise<T | undefined> {
  const mirrored = readColdSync<T>(ns, key)
  if (mirrored !== undefined) return mirrored
  return idbGet<T>(entryKey(ns, key))
}

/**
 * Persist one value (write-through: IndexedDB always, localStorage when small).
 * Oversized values are skipped silently — the cold layer is a convenience.
 */
export function writeCold<T>(ns: ColdNamespace, key: string, value: T): void {
  let serialized: string
  try { serialized = JSON.stringify(value) } catch { return }
  if (serialized.length > ENTRY_MAX_BYTES) return
  const entry: MirrorEntry<T> = { v: 1, ns, key, at: Date.now(), value }
  void idbSet(entryKey(ns, key), entry)
  if (serialized.length <= MIRROR_MAX_BYTES && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(mirrorStorageKey(entryKey(ns, key)), JSON.stringify(entry)) } catch { /* quota */ }
  }
  touchIndex(ns, key)
}

/** Forget one key from both layers. */
export function forgetCold(ns: ColdNamespace, key: string): void {
  void idbDelete(entryKey(ns, key))
  if (typeof localStorage !== 'undefined') localStorage.removeItem(mirrorStorageKey(entryKey(ns, key)))
  pruneIndex(ns, index => index.filter(item => item !== key))
}

/** Forget every key in a namespace that passes the predicate (e.g. a whole project prefix). */
export function forgetColdWhere(ns: ColdNamespace, predicate: (key: string) => boolean): void {
  for (const key of indexOf(ns)) {
    if (predicate(key)) forgetCold(ns, key)
  }
}

// ── tiny LRU index, kept in localStorage so prunes survive reloads ─────────

function indexStorageKey(ns: ColdNamespace): string {
  return `${MIRROR_PREFIX}index:${ns}`
}

function indexOf(ns: ColdNamespace): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(indexStorageKey(ns)) ?? '[]') as unknown
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value as string[] : []
  } catch {
    return []
  }
}

function writeIndex(ns: ColdNamespace, keys: readonly string[]): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(indexStorageKey(ns), JSON.stringify(keys)) } catch { /* quota */ }
}

function pruneIndex(ns: ColdNamespace, mutate: (keys: string[]) => string[]): void {
  writeIndex(ns, mutate(indexOf(ns)))
}

function touchIndex(ns: ColdNamespace, key: string): void {
  if (typeof localStorage === 'undefined') return
  const keys = [key, ...indexOf(ns).filter(item => item !== key)]
  while (keys.length > MAX_KEYS) {
    const stale = keys.pop()
    if (stale === undefined) break
    void idbDelete(entryKey(ns, stale))
    localStorage.removeItem(mirrorStorageKey(entryKey(ns, stale)))
  }
  writeIndex(ns, keys)
}
