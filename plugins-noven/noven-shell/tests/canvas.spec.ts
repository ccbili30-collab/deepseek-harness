import assert from 'node:assert/strict'
import { test } from 'vitest'
import { activeKey, canvasTabs, createCanvasStore } from '../lib/client/canvas.js'

const V3_KEY = 'noven.canvas.tabs.v3'
const V4_KEY = 'noven.canvas.tabs.v4'

function storage() {
  const values = new Map()
  return {
    values,
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { values.set(key, String(value)) },
    removeItem: key => { values.delete(key) },
    clear: () => { values.clear() },
  }
}

function withStorage(run) {
  const previous = globalThis.localStorage
  const current = storage()
  globalThis.localStorage = current
  try { return run(current) } finally {
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
}

function canvasStore() {
  return createCanvasStore().create()
}

function doc(owner, path = '文稿/a.md') {
  return { key: `doc:${path}`, kind: 'doc', title: path, owner, path }
}

function work(owner, path = '视觉/a.html') {
  return { key: `work:${path}`, kind: 'work', title: path, owner, path }
}

function layouts(store) {
  return Object.values(store.getSnapshot().layout)
}

function onlyLayout(store) {
  const nodes = layouts(store)
  assert.equal(nodes.length, 1)
  return nodes[0]
}

function keys(store, session) {
  return canvasTabs(store.getSnapshot(), session).map(tab => tab.key).sort()
}

test('same-workspace Session switches retain tabs, active object, and splits', () => withStorage(() => {
  const store = canvasStore()
  store.actions.bindWorkspace('s1', 'w1', true)
  store.actions.open(doc('s1'))
  store.actions.open({ key: 'card:c1', kind: 'card', title: 'Card', owner: 's1', cardId: 'c1' })
  const leaf = onlyLayout(store)
  store.actions.moveTab('s1', 'card:c1', leaf.id, 'right')
  store.actions.select('s1', 'doc:文稿/a.md')
  const before = onlyLayout(store)
  assert.equal(activeKey(store.getSnapshot(), 's1'), 'doc:文稿/a.md')

  store.actions.bindWorkspace('s2', 'w1', true)

  assert.deepEqual(keys(store, 's2'), ['card:c1', 'doc:文稿/a.md'])
  assert.equal(activeKey(store.getSnapshot(), 's2'), 'doc:文稿/a.md')
  assert.deepEqual(onlyLayout(store), before)
  assert.ok(canvasTabs(store.getSnapshot(), 's2').every(tab => tab.owner === 's2' && tab.workspace === 'w1'))

  store.actions.bindWorkspace('s1', 'w1', true)
  assert.deepEqual(keys(store, 's1'), ['card:c1', 'doc:文稿/a.md'])
  assert.equal(activeKey(store.getSnapshot(), 's1'), 'doc:文稿/a.md')
  assert.deepEqual(onlyLayout(store), before)
}))

test('workspace switches restore independent objects, active tabs, and layouts', () => withStorage(() => {
  const store = canvasStore()
  store.actions.bindWorkspace('s1', 'w1', true)
  store.actions.open(doc('s1'))
  store.actions.open({ key: 'card:c1', kind: 'card', title: 'Card', owner: 's1', cardId: 'c1' })
  store.actions.moveTab('s1', 'card:c1', onlyLayout(store).id, 'right')
  store.actions.select('s1', 'doc:文稿/a.md')
  const first = structuredClone(onlyLayout(store))

  store.actions.bindWorkspace('s2', 'w2', true)
  store.actions.open(work('s2'))
  const second = structuredClone(layouts(store).find(node => JSON.stringify(node).includes('work:视觉/a.html')))

  store.actions.bindWorkspace('s3', 'w1', true)
  assert.deepEqual(keys(store, 's3'), ['card:c1', 'doc:文稿/a.md'])
  assert.equal(activeKey(store.getSnapshot(), 's3'), 'doc:文稿/a.md')
  assert.deepEqual(layouts(store).find(node => JSON.stringify(node).includes('doc:文稿/a.md')), first)

  store.actions.bindWorkspace('s2', 'w2', true)
  assert.deepEqual(keys(store, 's2'), ['work:视觉/a.html'])
  assert.equal(activeKey(store.getSnapshot(), 's2'), 'work:视觉/a.html')
  assert.deepEqual(layouts(store).find(node => JSON.stringify(node).includes('work:视觉/a.html')), second)
}))

test('late Session completions write their original workspace and repeated opens dedupe', () => withStorage(() => {
  const store = canvasStore()
  store.actions.bindWorkspace('s1', 'w1', true)
  store.actions.open(doc('s1'))
  store.actions.bindWorkspace('s2', 'w2', true)
  store.actions.open(work('s2'))

  store.actions.open(doc('s1', '文稿/late.md'))
  store.actions.open(doc('s1', '文稿/late.md'))
  store.actions.bindWorkspace('s1', 'w1', false)
  assert.deepEqual(keys(store, 's2'), ['work:视觉/a.html'])
  assert.equal(activeKey(store.getSnapshot(), 's2'), 'work:视觉/a.html')

  store.actions.bindWorkspace('s2', 'w2', true)
  store.actions.open(work('s2'))
  assert.deepEqual(keys(store, 's2'), ['work:视觉/a.html'])
  assert.equal(layouts(store).filter(node => JSON.stringify(node).includes('work:视觉/a.html')).length, 1)

  store.actions.bindWorkspace('s1', 'w1', true)
  assert.deepEqual(keys(store, 's1'), ['doc:文稿/a.md', 'doc:文稿/late.md'])
  store.actions.bindWorkspace('s1', 'w1', true)
  assert.deepEqual(keys(store, 's1'), ['doc:文稿/a.md', 'doc:文稿/late.md'])
}))

test('v3 Session slices copy into workspace layouts without rewriting committed v3', () => withStorage(storage => {
  const legacy = {
    tabs: [doc('s1'), work('s2'), doc('s3', '文稿/other.md')],
    layout: {
      s1: { id: 'L1', tabs: ['doc:文稿/a.md'], active: 'doc:文稿/a.md' },
      s2: { id: 'L2', tabs: ['work:视觉/a.html'], active: 'work:视觉/a.html' },
    },
    active: { s3: 'doc:文稿/other.md' },
    focus: { s1: 'L1', s2: 'L2' },
    floats: { s1: [] },
    dialog: null,
    simOpen: {}, simPick: {}, studioOn: {}, simSize: 'p390', simView: {},
  }
  const committed = JSON.stringify(legacy)
  storage.setItem(V3_KEY, committed)
  const store = canvasStore()

  store.actions.bindWorkspace('s1', 'w1', true)
  assert.deepEqual(keys(store, 's1'), ['doc:文稿/a.md'])
  assert.equal(activeKey(store.getSnapshot(), 's1'), 'doc:文稿/a.md')

  store.actions.bindWorkspace('s2', 'w1', true)
  assert.deepEqual(keys(store, 's2'), ['doc:文稿/a.md', 'work:视觉/a.html'])
  assert.equal(storage.getItem(V3_KEY), committed)
  assert.ok(storage.getItem(V4_KEY)?.includes('workspace:w1'))

  store.actions.bindWorkspace('s2', 'w1', true)
  store.actions.open(doc('s2'))
  assert.deepEqual(keys(store, 's2'), ['doc:文稿/a.md', 'work:视觉/a.html'])
  assert.equal(storage.getItem(V3_KEY), committed)

  store.actions.bindWorkspace('s3', 'w2', true)
  assert.deepEqual(keys(store, 's3'), ['doc:文稿/other.md'])
  assert.equal(activeKey(store.getSnapshot(), 's3'), 'doc:文稿/other.md')
  assert.equal(storage.getItem(V3_KEY), committed)
}))

test('an existing v4 never falls back to v3 and missing legacy data starts empty', () => withStorage(storage => {
  const v4 = canvasStore()
  v4.actions.bindWorkspace('s1', 'w1', true)
  v4.actions.open(doc('s1'))
  storage.setItem(V3_KEY, JSON.stringify({ tabs: [work('s2')], layout: {}, focus: {} }))

  const restored = canvasStore()
  assert.deepEqual(keys(restored, 's1'), ['doc:文稿/a.md'])
  restored.actions.bindWorkspace('s2', 'w2', true)
  assert.deepEqual(keys(restored, 's2'), [])
  restored.actions.select('s2', 'start')
  assert.equal(activeKey(restored.getSnapshot(), 's2'), 'start')
  restored.actions.open(work('s2'))
  restored.actions.open(work('s2'))
  assert.deepEqual(keys(restored, 's2'), ['work:视觉/a.html'])
}))

test('disabled canvas restoration starts fresh without reading or deleting saved tabs', () => withStorage(storage => {
  const seeded = canvasStore()
  seeded.actions.bindWorkspace('s1', 'w1', true)
  seeded.actions.open(doc('s1'))
  const saved = storage.getItem(V4_KEY)

  const fresh = createCanvasStore(() => false).create()
  assert.deepEqual(fresh.getSnapshot().tabs, [])
  assert.equal(storage.getItem(V4_KEY), saved)
  fresh.actions.open(doc('s2'))
  assert.equal(storage.getItem(V4_KEY), saved)
}))
