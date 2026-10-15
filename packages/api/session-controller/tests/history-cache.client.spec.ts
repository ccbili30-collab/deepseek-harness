/** Browser history persistence and Session-owned preview races. */
import { describe, expect, it, vi, onTestFinished } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session/types'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import { BrowserHistoryCache, type CachedHistory, type HistoryCache } from '../src/client/sessions/history-cache.ts'
import { MutableSessionEventSource } from '../src/client/contract/events.ts'
import type { SessionPage } from '../src/types.ts'
import { plainTurn, historyValue } from './event-script.client.ts'
import { sessionBench } from './remote/bench.client.ts'
import { FOLLOW, followScript, history, err } from './remote/session.client.ts'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

const SID = 'cache-test' as SessionId
const address = { kind: 'session', sessionId: SID } as const
function windowOf(body = 'cached answer') {
  const source = new MutableSessionEventSource()
  source.replace(plainTurn(SessionSeq(0), 0, 'cached question', body).map(event => ({ type: 'event', event })), false)
  return source.getSnapshot()
}
function cache(factory = new IDBFactory(), maxBytes = 4 * 1024 * 1024, maxEntries = 5) {
  const store = new BrowserHistoryCache(factory, { maxBytes, maxEntries })
  onTestFinished(() => store.dispose())
  return store
}

describe('browser history cache', () => {
  it('reads a window larger than the old localStorage mirror after reopening the database', async () => {
    const factory = new IDBFactory()
    const first = cache(factory)
    const window = windowOf('大记录'.repeat(40000))
    await first.write(address, window)
    await first.dispose()
    const reopened = cache(factory)
    expect(await reopened.read(address)).toEqual({ entries: window.entries, hasMore: false })
  })

  it('preserves more than 600 events and the exact older-history flag', async () => {
    const source = new MutableSessionEventSource()
    const events = Array.from({ length: 120 }, (_, index) => plainTurn(SessionSeq(index * 6), index, 'q', 'a')).flat()
    source.replace(events.map(event => ({ type: 'event', event })), true)
    const store = cache()
    await store.write(address, source.getSnapshot())
    expect((await store.read(address))?.entries).toHaveLength(720)
    expect((await store.read(address))?.hasMore).toBe(true)
  })

  it('removes old history on an empty authoritative replacement', async () => {
    const store = cache()
    await store.write(address, windowOf())
    await store.write(address, new MutableSessionEventSource().getSnapshot())
    expect(await store.read(address)).toBeUndefined()
  })

  it('enforces bytes, not character count, and never retains an older oversized replacement', async () => {
    const store = cache(undefined, 2500)
    await store.write(address, windowOf('a'))
    expect(await store.read(address)).toBeDefined()
    await store.write(address, windowOf('大'.repeat(2000)))
    expect(await store.read(address)).toBeUndefined()
  })

  it('deletion defeats queued writes and writes from another existing connection', async () => {
    const factory = new IDBFactory()
    const first = cache(factory)
    const second = cache(factory)
    await second.write(address, windowOf())
    await Promise.all([first.write(address, windowOf('late')), first.remove(SID)])
    await second.write(address, windowOf('resurrection'))
    expect(await second.read(address)).toBeUndefined()
  })

  it('isolates a subagent by its direct parent', async () => {
    const store = cache()
    const child = { kind: 'subagent', childSessionId: SID, parentSessionId: 'parent-a' as SessionId, mode: 'unknown' } as const
    await store.write(child, windowOf())
    expect(await store.read({ ...child, parentSessionId: 'parent-b' as SessionId })).toBeUndefined()
    expect(await store.read(address)).toBeUndefined()
    expect(await store.read(child)).toBeDefined()
  })

  it('evicts older copies without scanning their event payloads', async () => {
    const store = cache(undefined, 4 * 1024 * 1024, 1)
    await store.write(address, windowOf())
    await store.write({ kind: 'session', sessionId: 'other' as SessionId }, windowOf())
    expect(await store.read(address)).toBeUndefined()
  })

  it('rejects corrupted envelopes without exposing them to conversation assembly', async () => {
    const factory = new IDBFactory()
    const store = cache(factory)
    await store.write(address, windowOf())
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open('dsh-session-history-v1', 1)
      request.onsuccess = () => { resolve(request.result) }
      request.onerror = () => { reject(request.error ?? new Error('open failed')) }
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite')
      const key = JSON.stringify(['session', SID])
      tx.objectStore('history').put({ version: 1, key, sessionId: SID, savedAt: 1, hasMore: false, entries: [{ type: 'event', event: { seq: 0 } }] }, key)
      tx.oncomplete = () => { resolve() }
      tx.onabort = () => { reject(tx.error ?? new Error('transaction failed')) }
    })
    db.close()
    expect(await store.read(address)).toBeUndefined()
  })

  it('continues without a browser storage provider', async () => {
    const store = new BrowserHistoryCache(undefined, { maxBytes: 1000, maxEntries: 1 })
    await store.write(address, windowOf())
    await store.remove(SID)
    expect(await store.read(address)).toBeUndefined()
    await store.dispose()
  })
})

const clientIt = createClientTest({ roster: webApp.closure(['@deepseek-ai/dsh-api-gateway']) })
describe('Session history preview', () => {
  clientIt('restores cached text when the history interface fails, without restoring control state', async ({ mock, start }) => {
    const store = cache()
    const window = windowOf()
    await store.write(address, window)
    const session = await sessionBench(mock, start, SID, { historyCache: store })
    mock.stream(FOLLOW, followScript(err(new RemoteError('gateway/internal', 'history blocked'))))
    await session.open()
    await vi.waitFor(() => { expect(session.getSnapshot().historyPreview).toBe(true) })
    expect(session.eventSource.getSnapshot().entries).toEqual(window.entries)
    expect(session.getSnapshot()).toMatchObject({ openState: 'error', running: false, blank: true, pendingSubmissions: [] })
    expect(session.projections.values()).toEqual({})
    expect((await session.prompt([{ type: 'text', text: 'not sent' }], 'queue')).ok).toBe(false)
    expect(mock.log.requests('session/prompt')).toHaveLength(0)
  }, 60000)

  clientIt('a later remote baseline replaces the preview rather than appending duplicates', async ({ mock, start }) => {
    const store = cache()
    await store.write(address, windowOf())
    const session = await sessionBench(mock, start, SID, { historyCache: store })
    const gate = Promise.withResolvers<SessionPage>()
    mock.stream(FOLLOW, followScript(() => gate.promise.then(value => ({ ok: true as const, value }))))
    const opening = session.open()
    await vi.waitFor(() => { expect(session.getSnapshot().historyPreview).toBe(true) })
    gate.resolve(historyValue(plainTurn(SessionSeq(0), 0, 'new q', 'new a')))
    await opening
    expect(session.getSnapshot().historyPreview).toBeUndefined()
    expect(session.eventSource.getSnapshot().entries).toHaveLength(6)
    await session.dispose()
    expect((await store.read(address))?.entries).toEqual(session.eventSource.getSnapshot().entries)
  })

  clientIt('a missing Session discards its cache instead of restoring deleted content', async ({ mock, start }) => {
    const store = cache()
    await store.write(address, windowOf())
    const session = await sessionBench(mock, start, SID, { historyCache: store })
    mock.stream(FOLLOW, followScript(err(new RemoteError('session/not-found', 'gone', { sessionId: SID }))))
    await session.open()
    await session.dispose()
    expect(session.eventSource.getSnapshot().entries).toEqual([])
    expect(session.getSnapshot().historyPreview).toBeUndefined()
    expect(await store.read(address)).toBeUndefined()
  })

  clientIt('a slow cache read cannot overwrite a newer authoritative window, including an empty one', async ({ mock, start }) => {
    const gate = Promise.withResolvers<CachedHistory | undefined>()
    const store: HistoryCache = { read: () => gate.promise, write: async () => {}, remove: async () => {} }
    const session = await sessionBench(mock, start, SID, { historyCache: store })
    mock.stream(FOLLOW, followScript(history([])))
    await session.open()
    gate.resolve(windowOf())
    await Promise.resolve()
    expect(session.eventSource.getSnapshot().entries).toEqual([])
    expect(session.getSnapshot().historyPreview).toBeUndefined()
  })

  clientIt('removal prevents a late cache read from restoring content', async ({ mock, start }) => {
    const gate = Promise.withResolvers<CachedHistory | undefined>()
    const store: HistoryCache = { read: () => gate.promise, write: async () => {}, remove: async () => {} }
    const session = await sessionBench(mock, start, SID, { historyCache: store })
    mock.stream(FOLLOW, followScript(err(new RemoteError('gateway/internal', 'history blocked'))))
    await session.open()
    session.handleRemoved()
    gate.resolve(windowOf())
    await Promise.resolve()
    expect(session.eventSource.getSnapshot().entries).toEqual([])
    expect(session.getSnapshot().historyPreview).toBeUndefined()
  })
})
