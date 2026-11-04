/** Saved revisions, shared readers and refusal through the public card API. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextSaveBuffer } from '../lib/client/text-save-buffer.js'
import { CardSnapshotStore, cardCache, cardKey } from '../lib/client/ui/card-store.js'
import { cardOp, fetchCard, CardConflict } from '../lib/client/card-api.js'
import { keyedCache } from '../lib/client/ui/keyed-cache.js'
import type { CardState } from '../src/client/card-api.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function state(revision: number): CardState {
  return {
    cardId: 'card', dir: 'Card', revision, version: `v${revision}`,
    hasDraft: false, draftSource: null, resources: [], coverResourceId: null,
    document: {
      id: 'card', kind: 'WORLD', name: 'Card', modules: [], characters: [],
      coverResourceId: null, avatarResourceId: null, logoResourceId: null, readingLayout: 'PAGED',
    },
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('text acknowledgement', () => {
  it('retains newer input across an older acknowledgement and a failed retry', async () => {
    const buffer = new TextSaveBuffer('opened')
    const first = deferred<boolean>()
    const write = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce('conflict').mockResolvedValueOnce('ok')
    buffer.stage('submitted')
    const pending = buffer.flush(write)
    buffer.stage('later')
    expect(buffer.receive('submitted')).toBe(false)
    expect(buffer.receive('external')).toBe(false)
    void buffer.flush(write)
    first.resolve(true)
    expect(await pending).toBe(false)
    expect(write.mock.calls.map(([text]) => text)).toEqual(['submitted', 'later'])
    expect(buffer.dirty).toBe(true)
    expect(await buffer.flush(write)).toBe(true)
    expect(buffer.dirty).toBe(false)
  })

  it('retains transport failures and compares the next write with stored Markdown', async () => {
    const buffer = new TextSaveBuffer('opened')
    buffer.stage('draft')
    expect(await buffer.flush(async () => { throw new Error('offline') })).toBe(false)
    const write = vi.fn().mockResolvedValueOnce({ savedText: 'stored' }).mockResolvedValueOnce('ok')
    await buffer.flush(write)
    buffer.stage('continued')
    await buffer.flush(write)
    expect(write.mock.calls[1]).toEqual(['continued', 'stored'])
  })
})

it('isolates keyed snapshots and retains accepted writes after earlier reads', async () => {
  const cache = keyedCache<string>()
  const slow = deferred<string>()
  const pending = cache.refresh('file', () => slow.promise)
  cache.put('file', 'saved')
  await cache.refresh('other', async () => 'other')
  slow.resolve('old')
  await pending
  await expect(cache.refresh('file', async () => { throw new Error('offline') })).rejects.toThrow('offline')
  expect(cache.get('file')).toBe('saved')
  expect(cache.get('other')).toBe('other')
})

describe('card requests', () => {
  it('distinguishes missing, transport, HTTP and malformed responses', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    const addr = { root: '/read-failures' }
    expect(await fetchCard(addr, 'card')).toBeUndefined()
    await expect(fetchCard(addr, 'card')).rejects.toThrow('offline')
    await expect(fetchCard(addr, 'card')).rejects.toThrow('503')
    await expect(fetchCard(addr, 'card')).rejects.toThrow('invalid')
  })

  it('notifies page and inline readers and fences reads after deletion', async () => {
    const addr = { root: '/shared-snapshots' }
    const cache = new CardSnapshotStore()
    const page = vi.fn()
    const inline = vi.fn()
    cache.subscribe(addr, 'card', page)
    const off = cache.subscribe(addr, 'card', inline)
    const slow = deferred<CardState>()
    const pending = cache.refresh(addr, 'card', () => slow.promise)
    cache.put(addr, 'card', state(2))
    slow.resolve(state(1))
    await pending
    expect(page).toHaveBeenCalledWith(state(2))
    expect(inline).toHaveBeenCalledTimes(1)
    off()
    const deleted = deferred<CardState>()
    const read = cache.refresh(addr, 'card', () => deleted.promise)
    cache.put(addr, 'card', undefined)
    deleted.resolve(state(3))
    await read
    expect(cache.get(addr, 'card')).toBeUndefined()
    expect(inline).toHaveBeenCalledTimes(1)
    expect(cardKey(addr, 'card')).not.toBe(cardKey({ root: '/other' }, 'card'))
  })

  it('retains a snapshot on failed refresh and clears confirmed absence', async () => {
    const addr = { root: '/snapshot-failures' }
    const cache = new CardSnapshotStore()
    cache.put(addr, 'card', state(3))
    await expect(cache.refresh(addr, 'card', async () => { throw new Error('offline') })).rejects.toThrow('offline')
    expect(cache.get(addr, 'card')?.version).toBe('v3')
    await cache.refresh(addr, 'card', async () => undefined)
    expect(cache.get(addr, 'card')).toBeUndefined()
  })

  it('chains only queued writes from the same revision and preserves a later stale fence', async () => {
    const addr = { root: '/queued-commands' }
    const first = deferred<Response>()
    const calls: string[] = []
    let revision = 1
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options?.method !== 'POST') return new Response(JSON.stringify(state(revision)))
      const version = JSON.parse(options.body).version
      calls.push(version)
      if (calls.length === 1) return first.promise
      if (version !== `v${revision}`) return new Response(JSON.stringify({ version: `v${revision}` }), { status: 409 })
      revision += 1
      return new Response(JSON.stringify({ ok: true, version: `v${revision}` }))
    }))
    const one = cardOp(addr, { op: 'apply', cardId: 'card', version: 'v1' })
    const two = cardOp(addr, { op: 'apply', cardId: 'card', version: 'v1' })
    await Promise.resolve()
    expect(calls).toEqual(['v1'])
    revision = 2
    first.resolve(new Response(JSON.stringify({ ok: true, version: 'v2' })))
    await one
    await two
    expect(calls).toEqual(['v1', 'v2'])
    await expect(cardOp(addr, { op: 'apply', cardId: 'card', version: 'v1' })).rejects.toBeInstanceOf(CardConflict)
    expect(calls.at(-1)).toBe('v1')
  })

  it('keeps failed deletes and acknowledges a saved write even if rereading fails', async () => {
    const addr = { root: '/command-failures' }
    cardCache.put(addr, 'card', state(1))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"ok":false}')))
    await expect(cardOp(addr, { op: 'delete', cardId: 'card' })).rejects.toThrow('refused')
    expect(cardCache.get(addr, 'card')?.version).toBe('v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"ok":true,"version":"v2"}')).mockRejectedValueOnce(new Error('offline')))
    expect(await cardOp(addr, { op: 'apply', cardId: 'card', version: 'v1' })).toEqual({ ok: true, version: 'v2' })
    expect(cardCache.get(addr, 'card')?.version).toBe('v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{"ok":true}')))
    await cardOp(addr, { op: 'delete', cardId: 'card' })
    expect(cardCache.get(addr, 'card')).toBeUndefined()
  })
})
