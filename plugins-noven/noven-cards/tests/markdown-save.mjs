/** Whole-module optimistic writes through the actual card HTTP handler. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CardStore } from '../lib/store.js'
import { readModuleMarkdown } from '../lib/markdown.js'
import { registerCardRoutes } from '../lib/routes.js'

test('stale or malformed Markdown expectations leave committed content unchanged', async t => {
  const root = await mkdtemp(join(tmpdir(), 'noven-markdown-save-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new CardStore(root)
  const saved = await store.create('Card', 'HUMAN', async receive => ({
    id: 'card', kind: 'WORLD', name: 'Card', resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
    modules: [{ id: 'module', name: 'Text', tags: [], children: [], characterIds: [], layout: 'VERTICAL', blocks: [{ kind: 'text', id: 'block', content: await receive(new TextEncoder().encode('opened')) }] }],
  }))
  const routes = new Map()
  registerCardRoutes({
    effect: fn => fn(), sessions: { get: () => undefined }, get: () => undefined,
    connection: { fetch: { register: def => routes.set(def.path, def) } },
  })
  const post = expectedText => routes.get('/api/noven-cards').fetch(new Request(`http://test/api/noven-cards?root=${encodeURIComponent(root)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'apply', cardId: saved.cardId, command: { kind: 'write_markdown', moduleId: 'module', name: 'Text', text: 'accepted', ...(expectedText === undefined ? {} : { expectedText }) } }),
  }))
  const accepted = await post('opened')
  assert.equal(accepted.status, 200)
  assert.equal((await accepted.json()).savedText, 'accepted')
  const revision = (await store.open(saved.cardId)).revision
  assert.equal((await post('opened')).status, 409)
  assert.equal((await post(123)).status, 400)
  const current = await store.open(saved.cardId)
  assert.equal(current.revision, revision)
  assert.equal(await readModuleMarkdown(current.document.modules[0], async ref => new TextDecoder().decode(await store.readPayload(saved.cardId, ref))), 'accepted')
  assert.equal((await post(undefined)).status, 200)
})
