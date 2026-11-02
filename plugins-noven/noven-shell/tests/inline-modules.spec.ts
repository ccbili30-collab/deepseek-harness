// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { act, createElement } from '../node_modules/react/index.js'
import { renderToStaticMarkup } from '../node_modules/react-dom/server.js'
import { createRoot } from '../node_modules/react-dom/client.js'
import { afterEach, describe, test, vi } from 'vitest'
import { createInlineMapSender, ModuleBlock, registerInlineBlocks } from '../lib/client/blocks.js'
import { FmgMapHost } from '../lib/client/fmg-map-host.js'
import { ModuleSurface } from '../lib/client/module-surface.js'
import { parseModuleReference, readModuleSource, resolveModuleSource } from '../lib/client/module-source.js'

const t = key => key
const dependencies = {
  t,
  readFile: async () => undefined,
  resolveProjectAsset: async () => null,
}

function module(id, widget, blocks = []) {
  return {
    id,
    name: id,
    blocks,
    children: [],
    characterIds: [],
    layout: 'VERTICAL',
    tags: [],
    ...(widget === undefined ? {} : { widget }),
  }
}

function surfaceProps(current) {
  return {
    module: current,
    t,
    card: { id: 'card-1', name: 'Card', kind: 'WORLD' },
    addr: { sessionId: 'sess-1', root: '/workspace' },
    loadCard: async () => undefined,
    imageUrl: id => `/image/${id}`,
    imageResources: [],
    siblings: [current],
  }
}

function cardState(modules, characters = []) {
  return {
    cardId: 'card-1',
    dir: 'Card',
    revision: 1,
    version: 'v1',
    hasDraft: false,
    draftSource: null,
    document: {
      id: 'card-1',
      kind: 'WORLD',
      name: 'Card',
      modules,
      characters,
      avatarResourceId: null,
      coverResourceId: null,
      logoResourceId: null,
      readingLayout: 'PAGED',
    },
    resources: [],
    coverResourceId: null,
  }
}

const mounted = new Set()

async function mount(element) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.add(root)
  await act(async () => { root.render(element) })
  return {
    container,
    unmount: () => {
      act(() => { root.unmount() })
      mounted.delete(root)
      container.remove()
    },
  }
}

afterEach(() => {
  for (const root of mounted) act(() => { root.unmount() })
  mounted.clear()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('module references', () => {
  test('accepts only complete card/module references', () => {
    assert.deepEqual(parseModuleReference('card:card-1/module-1'), { cardId: 'card-1', moduleId: 'module-1' })
    for (const invalid of ['', 'card:card-1', 'card:/module-1', 'card:card-1/', 'card:a/b/c', '/api/noven-cards?card=a']) {
      assert.equal(parseModuleReference(invalid), undefined)
    }
  })

  test('adds session and workspace scope without moving the module id into the request', () => {
    const resolved = resolveModuleSource('card:卡 1/模块 1', 'sess 1', '/work space')
    assert.ok(resolved !== undefined)
    const parsed = readModuleSource(resolved)
    assert.deepEqual(parsed, {
      endpoint: `/api/noven-cards?${new URLSearchParams({ session: 'sess 1', card: '卡 1', root: '/work space' }).toString()}`,
      sessionId: 'sess 1',
      workspaceRoot: '/work space',
      cardId: '卡 1',
      moduleId: '模块 1',
    })
    assert.ok(!parsed.endpoint.includes('module='))
    assert.equal(readModuleSource('card:card-1/module-1'), undefined)
  })
})

describe('display-only module surface', () => {
  const cases = [
    ['doc', module('doc', undefined, [{ kind: 'text', id: 'b1', text: 'Hello inline module' }])],
    ['profile', module('profile', { type: 'collection', data: { view: 'profile', fields: [], items: [], values: {} } })],
    ['graph', module('graph', { type: 'collection', data: { view: 'graph', fields: [], items: [], values: {} } })],
    ['surface', module('surface', { type: 'html' }, [{ kind: 'text', id: 'b1', text: '<div>Inline surface</div>' }])],
    ['free3d', module('free3d', { type: 'html' }, [{ kind: 'text', id: 'b1', text: '<div>Inline 3D</div>' }])],
    ['scene', module('scene', { type: 'scene', data: { objects: [], camera: { yaw: 0, pitch: 0, zoom: 1 } } })],
    ['timeline', module('timeline', { type: 'timeline', data: {} })],
    ['map', module('map', { type: 'map', data: {} })],
    ['collection', module('collection', { type: 'collection', data: { view: 'list', fields: [], items: [], values: {} } })],
  ]

  for (const [name, current] of cases) {
    test(`${name} uses the shared display surface without page chrome`, async () => {
      if (name === 'doc') {
        vi.stubGlobal('matchMedia', query => ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }))
        const view = await mount(createElement(ModuleSurface, surfaceProps(current)))
        assert.ok(view.container.querySelector('[data-readonly]') !== null)
        assert.ok(!view.container.querySelector('.nv-page-children'))
        view.unmount()
        return
      }
      const html = renderToStaticMarkup(createElement(ModuleSurface, surfaceProps(current)))
      assert.match(html, /data-readonly/)
      assert.ok(!html.includes('modules.widgetSoon'))
      assert.ok(!html.includes('nv-page-children'))
      assert.ok(!html.includes('nv-htmlfile-bar'))
      assert.ok(!html.includes('nv-surfacebar'))
    })
  }

  test('map and HTML keep their viewing surface instead of inheriting inert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    for (const current of [cases.find(([name]) => name === 'map')[1], cases.find(([name]) => name === 'surface')[1]]) {
      const view = await mount(createElement(ModuleSurface, surfaceProps(current)))
      await vi.waitFor(() => {
        assert.equal(view.container.querySelector('.nv-modbox-body')?.hasAttribute('inert'), false)
      })
      assert.ok(view.container.querySelector('iframe') !== null)
      if (current.widget.type === 'map') {
        const frame = view.container.querySelector('iframe')
        const frameDocument = frame.contentDocument
        frameDocument.open()
        frameDocument.write('<!doctype html><html><head></head><body></body></html>')
        frameDocument.close()
        await act(async () => { frame.dispatchEvent(new Event('load')) })
        await vi.waitFor(() => assert.ok(frame.contentDocument?.getElementById('noven-map-readonly') !== null))
        const readOnly = frame.contentDocument.getElementById('noven-map-readonly').textContent
        assert.ok(readOnly.includes('#nv-topbar') && readOnly.includes('#nv-cmdbar') && readOnly.includes('#nv-stagebar'))
        assert.ok(!readOnly.includes('#tooltip'))
      }
      view.unmount()
    }
  })

  test('other structured widgets remain display-only', async () => {
    const current = cases.find(([name]) => name === 'scene')[1]
    const view = await mount(createElement(ModuleSurface, surfaceProps(current)))
    await vi.waitFor(() => assert.ok(view.container.querySelector('.nv-modbox-body')?.hasAttribute('inert')))
    assert.ok(view.container.querySelector('.nv-scene') !== null)
  })
})

describe('read-only map generation persistence', () => {
  function host(current, send) {
    return mount(createElement(FmgMapHost, {
      module: current,
      t,
      send,
      addr: { sessionId: 'sess-1', root: '/workspace' },
      cardId: 'card-1',
      readOnly: true,
    }))
  }

  async function message(frame, data) {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data, source: frame.contentWindow }))
    })
  }

  test('rejects save messages for an ordinary displayed map without a generation request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const send = vi.fn(async () => true)
    const view = await host(module('map', { type: 'map', data: {} }), send)
    const frame = view.container.querySelector('iframe')
    await message(frame, { type: 'noven-map-save', data: '1.154.2|map', stage: 'world', summary: {} })
    assert.equal(send.mock.calls.length, 0)
    view.unmount()
  })

  test('keeps one consumed compose chain writable through terrain and world, then closes it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
    const send = vi.fn(async () => true)
    const current = module('map', { type: 'map', data: {}, request: { kind: 'compose', spec: { seed: 'test' } } })
    const view = await host(current, send)
    const frame = view.container.querySelector('iframe')
    frame.contentWindow.novenHostReady = true
    const post = vi.spyOn(frame.contentWindow, 'postMessage')
    await act(async () => {
      await vi.waitFor(() => assert.ok(post.mock.calls.some(call => call[0]?.type === 'noven-map-blank')))
    })
    await message(frame, { type: 'noven-map-blank-started' })
    await message(frame, { type: 'noven-map-terrain-summary', summary: { landRatio: 0.4 } })
    await message(frame, { type: 'noven-map-save', data: '1.154.2|terrain', stage: 'terrain', summary: {} })
    await message(frame, { type: 'noven-map-save', data: '1.154.2|world', stage: 'world', summary: { counts: { burgs: 1 } } })
    await message(frame, { type: 'noven-map-save', data: '1.154.2|unexpected', stage: 'world', summary: {} })
    assert.deepEqual(send.mock.calls.map(call => call[0].kind), ['record_map_terrain', 'write_map_document', 'write_map_document'])
    view.unmount()
  })
})

describe('module block registration', () => {
  test('registers both product block ids, the card resolver, and the choice codec', () => {
    const specs = new Map()
    const sources = new Map()
    const codecs = []
    const registry = {
      register: spec => { specs.set(spec.id, spec); return () => { specs.delete(spec.id) } },
      registerSource: (kind, resolver) => { sources.set(kind, resolver); return () => { sources.delete(kind) } },
      resolve: id => specs.get(id),
    }
    const ctx = {
      get: id => id === 'chatBlocks' ? registry : id === 'inputTriggers' ? {
        registerSource: source => { codecs.push(source); return () => {} },
      } : undefined,
      effect: callback => { callback() },
    }
    registerInlineBlocks(ctx, dependencies)
    assert.deepEqual([...specs.keys()].sort(), ['code', 'module'])
    assert.deepEqual([...sources.keys()], ['card'])
    assert.equal(specs.get('code').content, 'data')
    assert.equal(specs.get('module').source, 'card')
    assert.equal(codecs[0].name, 'noven-code-choice')
    assert.match(sources.get('card')('card:card-1/module-1', 'sess-1', '/workspace'), /^\/api\/noven-cards\?/)
  })
})

describe('inline map command channel', () => {
  test('writes only the referenced module and serializes card versions', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, version: `v${fetchMock.mock.calls.length + 1}` }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const send = createInlineMapSender({ sessionId: 'sess-1', root: '/workspace' }, cardState([]), 'character-1', 'map-1')
    assert.equal(await send({ kind: 'write_text', moduleId: 'map-1', text: 'no' }), false)
    assert.equal(await send({ kind: 'write_map_document', moduleId: 'other', text: 'no' }), false)
    assert.equal(fetchMock.mock.calls.length, 0)
    const first = send({ kind: 'record_map_terrain', moduleId: 'map-1', summary: {} })
    const second = send({ kind: 'write_map_document', moduleId: 'map-1', text: '1.154.2|map' })
    assert.equal(await first, true)
    assert.equal(await second, true)
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body))
    assert.deepEqual(bodies.map(body => body.version), ['v1', 'v2'])
    assert.deepEqual(bodies.map(body => body.targetId), ['character-1', 'character-1'])
    assert.deepEqual(bodies.map(body => body.command.kind), ['record_map_terrain', 'write_map_document'])
  })
})

describe('module block loading', () => {
  test('loads a nested character module through the resolved endpoint', async () => {
    const nested = module('nested', { type: 'relation', data: { nodes: [], edges: [] } })
    const character = { ...cardState([nested]).document, id: 'character-1', characters: undefined }
    delete character.characters
    const state = cardState([], [character])
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => state }))
    vi.stubGlobal('fetch', fetchMock)
    const src = resolveModuleSource('card:card-1/nested', 'sess-1', '/workspace')
    const view = await mount(createElement(ModuleBlock, { src, title: 'Nested', dependencies }))
    await vi.waitFor(() => assert.ok(view.container.querySelector('.nv-relation') !== null))
    const endpoint = fetchMock.mock.calls[0][0]
    assert.ok(endpoint.startsWith('/api/noven-cards?'))
    assert.ok(!endpoint.includes('#'))
    assert.ok(!endpoint.includes('module='))
  })

  test('turns an invalid card payload into the block error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json') } })))
    const src = resolveModuleSource('card:card-1/module-1', 'sess-1', '/workspace')
    const view = await mount(createElement(ModuleBlock, { src, title: 'Invalid', dependencies }))
    await vi.waitFor(() => assert.match(view.container.textContent, /cardpage.module.missing/))
    assert.match(view.container.textContent, /Invalid/)
  })

  test('shows a controlled error when the card response omits resources', async () => {
    const state = cardState([module('doc', undefined, [{ kind: 'text', id: 'b1', text: 'Hello' }])])
    delete state.resources
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => state })))
    const src = resolveModuleSource('card:card-1/doc', 'sess-1', '/workspace')
    const view = await mount(createElement(ModuleBlock, { src, title: 'No resources', dependencies }))
    await vi.waitFor(() => assert.match(view.container.textContent, /cardpage.module.missing/))
    assert.match(view.container.textContent, /No resources/)
    assert.equal(view.container.querySelector('.nv-module-surface'), null)
  })

  test('reports a missing module inside the reserved block and never fetches malformed sources', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => cardState([]) }))
    vi.stubGlobal('fetch', fetchMock)
    const src = resolveModuleSource('card:card-1/missing', 'sess-1', '/workspace')
    const view = await mount(createElement(ModuleBlock, { src, title: 'Missing', dependencies }))
    await vi.waitFor(() => assert.match(view.container.textContent, /cardpage.module.missing/))
    assert.match(view.container.textContent, /Missing/)
    view.unmount()
    fetchMock.mockClear()
    const malformed = await mount(createElement(ModuleBlock, { src: 'card:bad', title: 'Bad', dependencies }))
    await vi.waitFor(() => assert.match(malformed.container.textContent, /cardpage.module.missing/))
    assert.equal(fetchMock.mock.calls.length, 0)
  })
})
