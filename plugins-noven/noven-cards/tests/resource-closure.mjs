/** Card payload ownership, cross-project copies and exchange reference closure. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { CardStore } from '../lib/store.js'
import { applyAndCommit } from '../lib/editor.js'
import { buildExportPackage, importExchange } from '../lib/exchange.js'
import { cardModule } from '../lib/document-graph.js'
import { registerCardRoutes } from '../lib/routes.js'
import { registerCardTools } from '../lib/tools.js'
import { decodeCollection, decodeTimeline, encodeCollection, encodeTimeline } from '../lib/formats.js'
import { readZip, writeZip } from '../lib/zip.js'

const module = (id, name, blocks = [], widget) => ({
  id, name, blocks, children: [], tags: [], layout: 'VERTICAL', characterIds: [],
  ...(widget === undefined ? {} : { widget }),
})
const textBlock = (id, content) => ({ kind: 'text', id, content })
const appearance = { readingLayout: 'PAGED' }
const empty = (id, kind, name) => ({ id, kind, name, modules: [], resources: [], internalCharacters: [], extensions: {}, appearance })

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'noven-resource-closure-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, store: new CardStore(root) }
}

async function fixture(store) {
  return store.create('完整世界', 'HUMAN', async receive => {
    const text = raw => receive(new TextEncoder().encode(raw))
    const rootImage = await receive(new Uint8Array([11, 22, 33]))
    const roleImage = await receive(new Uint8Array([44, 55, 66]))
    const collection = await text(encodeCollection({
      ...decodeCollection(),
      fields: [{ id: 'field-image', name: '图片', type: 'image' }, { id: 'field-text', name: '说明', type: 'text' }],
      items: [{ id: 'item-a', name: '甲', summary: '', description: '', visualKey: 'r-root' }],
      values: { 'item-a': { 'field-image': { resourceId: 'r-root' }, 'field-text': 'r-root' } },
      source: { cardId: 'world', moduleId: 'collection', itemId: 'item-a' },
      presentation: { contract: 'archive', layout: 'cards', assets: [{ id: 'item-a', role: '图片', ratio: '1:1', render: '64x64', export: '128x128' }] },
    }))
    const roleCollection = await text(encodeCollection({
      ...decodeCollection(), fields: [],
      items: [{ id: 'item-a', name: '角色条目', summary: '', description: '', visualKey: 'r-role' }],
      values: {},
    }))
    const mapData = id => JSON.stringify({
      version: 2, kind: 'map',
      noven: { markers: [{ id: 'marker-a', x: 0.5, y: 0.5, label: id, description: '' }] },
    })
    const mapA = await text(mapData('甲地图'))
    const mapB = await text(mapData('乙地图'))
    const timeline = await text(encodeTimeline({
      ...decodeTimeline(),
      events: [
        { id: 'event-a', at: 1, until: null, title: '甲', description: '', characters: ['角色'], relations: ['role'], place: { mapModuleId: 'map-a', markerId: 'marker-a' } },
        { id: 'event-b', at: 2, until: null, title: '乙', description: '', characters: [], place: { mapModuleId: 'map-b', markerId: 'marker-a' } },
      ],
    }))
    const layout = await text(JSON.stringify({ version: 1, grid: 12, tiles: [{ id: 'tile-a', source: { moduleId: 'map-a' }, x: 0, y: 0, w: 2, h: 2, hidden: false }] }))
    const caption = await text('角色照片')
    const opaque = await receive(new Uint8Array([0, 255, 64, 128]))
    const role = {
      ...empty('role', 'CHARACTER', '角色'),
      resources: [{ id: 'r-role', content: roleImage, mediaType: 'image/jpeg' }],
      appearance: { ...appearance, avatarResourceId: 'r-role' },
      extensions: { opaque },
      modules: [module('role-folder', '角色模块组', [], undefined)],
    }
    role.modules[0].children = [
      module('role-collection', '角色集合', [textBlock('role-data', roleCollection)], { type: 'collection' }),
      module('role-map', '角色地图', [], { type: 'map', request: { kind: 'terrain' } }),
      module('role-images', '角色图片', [{ kind: 'image', id: 'role-img', resourceId: 'r-role', caption, width: 45 }]),
      module('role-ref', '角色引用', [], { type: 'ref', source: { cardId: 'world', moduleId: 'collection' } }),
    ]
    const world = {
      ...empty('world', 'WORLD', '完整世界'),
      resources: [{ id: 'r-root', content: rootImage, mediaType: 'image/png' }],
      extensions: { 'noven.layout.home': layout },
      internalCharacters: [role],
      modules: [
        module('overview', '总览'),
        module('collection', '根集合', [textBlock('collection-data', collection)], { type: 'collection' }),
        module('map-a', '甲地图', [textBlock('map-data-a', mapA)], { type: 'map' }),
        module('map-b', '乙地图', [textBlock('map-data-b', mapB)], { type: 'map' }),
        module('timeline', '年表', [textBlock('timeline-data', timeline)], { type: 'timeline' }),
        module('ref', '集合挂载', [], {
          type: 'ref', source: { cardId: 'world', moduleId: 'collection' },
          filter: { characters: ['item-a'] }, overrides: { items: [{ id: 'item-a', visualKey: 'r-root' }] },
        }),
        module('external-ref', '外部挂载', [], { type: 'ref', source: { cardId: 'external-world', moduleId: 'map-a' } }),
        module('internal-ref', '角色集合挂载', [], { type: 'ref', source: { cardId: 'world', moduleId: 'role-collection' } }),
      ],
    }
    world.modules[0].characterIds = ['role']
    return world
  })
}

const readData = async (store, rootId, mod) =>
  JSON.parse(new TextDecoder().decode(await store.readPayload(rootId, mod.blocks.find(block => block.kind === 'text').content)))

test('root-card GET, map requests and reference snapshots include internal-character modules', async t => {
  const { root, store } = await project(t)
  await fixture(store)
  await applyAndCommit(store, 'world', 'role', {
    kind: 'add_module_ref', name: '内部角色的同根引用',
    sourceCardId: 'world', sourceModuleId: 'role-collection',
  }, 'HUMAN')
  const routes = new Map()
  registerCardRoutes({
    effect: fn => fn(), sessions: { get: () => undefined }, get: () => undefined,
    connection: { fetch: { register: def => routes.set(def.path, def) } },
  })
  const get = suffix => routes.get('/api/noven-cards').fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&${suffix}`))
  const payload = await (await get('card=world')).json()
  assert.deepEqual(payload.resources.map(resource => resource.id), ['r-root', 'r-role'])
  assert.equal(payload.document.characters[0].avatarResourceId, 'r-role')
  const map = await (await get('card=world&mapRequest=role-map')).json()
  assert.deepEqual(map.request, { kind: 'terrain' })
  const index = await (await get('refs=1')).json()
  assert.ok(index.targets[0].modules.some(mod => mod.id === 'role-collection'))
  assert.equal(index.moduleBacklinks['world:collection'].length, 3)
  assert.equal(index.moduleBacklinks['world:role-collection'].length, 2)
  const built = await buildExportPackage(store, 'world')
  const structure = JSON.parse(new TextDecoder().decode(readZip(built.bytes).get('structure.json')))
  const snapshot = cardModule(structure.card, 'internal-ref').module.widget.snapshot
  assert.equal(snapshot.cardName, '角色')
  assert.equal(snapshot.resources['r-role'].base64, Buffer.from([44, 55, 66]).toString('base64'))
  assert.ok(cardModule(structure.card, 'role-ref').module.widget.snapshot.resources['r-root'])
  const media = Object.values(structure.contents).map(entry => entry.path)
  assert.ok(media.some(path => path.startsWith('图片/') && path.endsWith('.jpg')))
})

test('exchange remaps forward references, scoped widget ids, images and layouts together', async t => {
  const source = await project(t)
  const destination = await project(t)
  await fixture(source.store)
  const built = await buildExportPackage(source.store, 'world')
  const imported = await importExchange(destination.store, built.bytes)
  const saved = await destination.store.commit(imported.cardId, imported.version)
  const doc = saved.document
  const named = name => cardModule(doc, doc.modules.find(mod => mod.name === name).id).module
  const role = doc.internalCharacters[0]
  assert.deepEqual(named('总览').characterIds, [role.id])
  assert.notEqual(role.id, 'role')
  const rawCollection = await readData(destination.store, doc.id, named('根集合'))
  const collection = decodeCollection(JSON.stringify(rawCollection))
  const resource = doc.resources[0]
  assert.equal(collection.items[0].visualKey, resource.id)
  assert.equal(collection.values[collection.items[0].id][collection.fields[0].id].resourceId, resource.id)
  assert.equal(collection.values[collection.items[0].id][collection.fields[1].id], 'r-root')
  assert.equal(collection.source.cardId, doc.id)
  assert.equal(collection.source.moduleId, named('根集合').id)
  assert.equal(collection.source.itemId, collection.items[0].id)
  assert.equal(collection.presentation.assets[0].id, 'item-a')
  const roleCollection = decodeCollection(JSON.stringify(await readData(destination.store, doc.id, role.modules[0].children[0])))
  assert.notEqual(roleCollection.items[0].id, collection.items[0].id)
  assert.equal(roleCollection.items[0].visualKey, role.resources[0].id)
  const mount = named('集合挂载').widget
  assert.equal(mount.source.cardId, doc.id)
  assert.equal(mount.source.moduleId, named('根集合').id)
  assert.deepEqual(mount.filter.characters, [collection.items[0].id])
  assert.equal(mount.overrides.items[0].id, collection.items[0].id)
  assert.equal(mount.overrides.items[0].visualKey, resource.id)
  assert.deepEqual(named('外部挂载').widget.source, { cardId: 'external-world', moduleId: 'map-a' })
  const timeline = decodeTimeline(JSON.stringify(await readData(destination.store, doc.id, named('年表'))))
  const maps = await Promise.all(['甲地图', '乙地图'].map(name => readData(destination.store, doc.id, named(name))))
  for (const [i, event] of timeline.events.entries()) {
    const mapModule = named(i === 0 ? '甲地图' : '乙地图')
    assert.equal(event.place.mapModuleId, mapModule.id)
    assert.equal(event.place.markerId, maps[i].noven.markers[0].id)
  }
  assert.notEqual(maps[0].noven.markers[0].id, maps[1].noven.markers[0].id)
  assert.deepEqual(timeline.events[0].characters, ['角色'])
  assert.deepEqual(timeline.events[0].relations, ['role'])
  const layout = JSON.parse(new TextDecoder().decode(await destination.store.readPayload(doc.id, doc.extensions['noven.layout.home'])))
  assert.equal(layout.tiles[0].source.moduleId, named('甲地图').id)
  assert.notEqual(layout.tiles[0].id, 'tile-a')
  const image = role.modules[0].children.find(mod => mod.name === '角色图片').blocks[0]
  assert.equal(image.resourceId, role.resources[0].id)
  assert.equal(image.width, 45)
  assert.equal(new TextDecoder().decode(await destination.store.readPayload(doc.id, image.caption)), '角色照片')
  assert.deepEqual(await destination.store.readPayload(doc.id, role.extensions.opaque), new Uint8Array([0, 255, 64, 128]))
})

test('cross-project character copy transfers bytes and retargets only self-references', async t => {
  const source = await project(t)
  const destination = await project(t)
  const role = await source.store.create('来源角色', 'HUMAN', async receive => {
    const image = await receive(new Uint8Array([1, 2, 3]))
    const raw = await receive(new TextEncoder().encode('![本人](card-image:avatar#image-block "w=45%")'))
    const opaque = await receive(new Uint8Array([222]))
    return {
      ...empty('source-role', 'CHARACTER', '来源角色'),
      resources: [{ id: 'avatar', content: image, mediaType: 'image/png' }],
      extensions: { opaque }, appearance: { ...appearance, avatarResourceId: 'avatar' },
      modules: [
        module('self', '本人', [textBlock('text-block', raw), { kind: 'image', id: 'image-block', resourceId: 'avatar' }]),
        module('self-ref', '本卡挂载', [], { type: 'ref', source: { cardId: 'source-role', moduleId: 'self' } }),
        module('outside', '外部挂载', [], { type: 'ref', source: { cardId: 'other', moduleId: 'self' } }),
      ],
    }
  })
  await destination.store.create('目标世界', 'HUMAN', async receive => ({
    ...empty('destination', 'WORLD', '目标世界'),
    modules: [module('existing', '已有', [textBlock('existing-block', await receive(new Uint8Array([99])))])],
  }))
  const tools = new Map()
  registerCardTools({ tools: { register: tool => tools.set(tool.name, tool) } })
  const result = await tools.get('copy_internal_character').execute({
    root_id: 'destination', target_id: 'destination', source_id: role.cardId, source_project: source.root,
  }, { agent: { session: { header: { cwd: destination.root } } } })
  assert.equal(result.status, 'saved')
  const copied = (await destination.store.open('destination')).document.internalCharacters[0]
  assert.notEqual(copied.id, role.cardId)
  assert.notEqual(copied.resources[0].content, role.document.resources[0].content)
  assert.deepEqual(await destination.store.readPayload('destination', copied.resources[0].content), new Uint8Array([1, 2, 3]))
  assert.deepEqual(await destination.store.readPayload('destination', copied.extensions.opaque), new Uint8Array([222]))
  assert.equal(copied.appearance.avatarResourceId, copied.resources[0].id)
  assert.deepEqual(copied.modules[1].widget.source, { cardId: 'destination', moduleId: copied.modules[0].id })
  assert.deepEqual(copied.modules[2].widget.source, { cardId: 'other', moduleId: 'self' })
  const markdown = new TextDecoder().decode(await destination.store.readPayload('destination', copied.modules[0].blocks[0].content))
  assert.ok(markdown.includes(`card-image:${copied.resources[0].id}#${copied.modules[0].blocks[1].id}`))
  assert.deepEqual((await source.store.open(role.cardId)).document, role.document)
  const before = (await destination.store.open('destination')).revision
  await assert.rejects(applyAndCommit(destination.store, 'destination', 'destination', {
    kind: 'copy_character', source: role.document, readPayload: async () => { throw new Error('source missing') },
  }, 'HUMAN'), /source missing/)
  assert.equal((await destination.store.open('destination')).revision, before)
})

test('bad exchange checksums and invalid image widths leave no imported draft', async t => {
  const source = await project(t)
  const destination = await project(t)
  await fixture(source.store)
  const built = await buildExportPackage(source.store, 'world')
  const archive = readZip(built.bytes)
  const structure = JSON.parse(new TextDecoder().decode(archive.get('structure.json')))
  const repack = () => writeZip([...archive.entries()].map(([name, data]) => ({
    name, data: name === 'structure.json' ? new TextEncoder().encode(JSON.stringify(structure)) : data,
  })))
  const manifest = Object.values(structure.contents)[0]
  const checksum = manifest.sha256
  manifest.sha256 = '0'.repeat(64)
  await assert.rejects(importExchange(destination.store, repack()), /载荷校验失败/)
  assert.deepEqual(await destination.store.list(), [])
  manifest.sha256 = checksum
  cardModule(structure.card, 'role-images').module.blocks[0].width = 101
  await assert.rejects(importExchange(destination.store, repack()), /width 无效/)
  assert.deepEqual(await destination.store.list(), [])
  cardModule(structure.card, 'role-images').module.blocks[0].width = 45
  const dataRef = cardModule(structure.card, 'collection').module.blocks[0].content
  const entry = structure.contents[dataRef]
  const invalidJson = new TextEncoder().encode('{invalid')
  archive.set(entry.path, invalidJson)
  entry.size = invalidJson.length
  entry.sha256 = createHash('sha256').update(invalidJson).digest('hex')
  await assert.rejects(importExchange(destination.store, repack()), /JSON/)
  assert.deepEqual(await destination.store.list(), [])
})
