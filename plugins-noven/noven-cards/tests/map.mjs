/**
 * 地图载荷与局部视图自测：
 * 1. decodeMap 兼容顶层扁平写入（客户端惯例）与三种 draft 图元（stroke/shape/poly）；
 *    base/parent/window/aspect 经 encode→decode 往返不丢。
 * 2. map_spawn_view：按对象外接框取景，框内几何裁剪重归一化、底图块复用、
 *    parent 溯源落进子模块数据。
 *
 * Run: node tests/map.mjs（或 pnpm test）
 * @module noven-cards/tests/map
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardStore } from '../lib/store.js'
import { applyAndCommit } from '../lib/editor.js'
import { decodeMap, encodeMap } from '../lib/formats.js'

const root = mkdtempSync(join(tmpdir(), 'noven-cards-map-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

try {
  const store = new CardStore(root)
  await store.create('地图测试', 'AI', () => ({
    id: 'card-m', kind: 'WORLD', name: '地图测试', modules: [], resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
  }))
  await applyAndCommit(store, 'card-m', 'card-m', { kind: 'add_module', name: '世界图', widget: 'map' }, 'AI')
  const doc1 = await store.open('card-m')
  const mapMod = doc1.document.modules.find(m => m.widget?.type === 'map')
  check(mapMod !== undefined, 'add_module 建地图模块')

  // 1. 扁平（顶层）写入：客户端 set_widget_data 惯例，draft 混合三种图元。
  const flat = {
    description: '大陆与内海',
    base: { name: '海', desc: 'ocean water', color: '#6D9DC5' },
    objects: [
      { id: 'f-1', type: 'face', layer: 'kingdom', name: '王国', color: '#7FBF8E', pts: [[.4, .3], [.6, .3], [.6, .5], [.4, .5]] },
      { id: 'l-1', type: 'line', layer: 'river', name: '长河', color: '#6D9DC5', pts: [[.1, .5], [.45, .4], [.9, .8]], widths: [.02, .02, .02] },
      { id: 'm-in', type: 'mark', layer: 'landmark', name: '城内', color: '#D64541', pos: [.5, .4], description: '' },
      { id: 'm-out', type: 'mark', layer: 'landmark', name: '城外', color: '#D64541', pos: [.95, .9], description: '' },
    ],
    draft: [
      { color: '#B8A888', r: .03, pts: [[.1, .1], [.2, .12]] },
      { kind: 'shape', color: '#B8A888', ctrl: [[.35, .25], [.65, .25], [.65, .55], [.35, .55]], roughness: .35, seed: 7 },
      { kind: 'shape', color: '#000000', ctrl: [[.48, .38], [.52, .38], [.52, .42], [.48, .42]], roughness: .2, seed: 9, op: 'subtract' },
      { kind: 'poly', color: '#5F8F5F', pts: [[.42, .32], [.5, .3], [.55, .36], [.46, .38]] },
    ],
    palette: [{ name: '海', desc: 'ocean', color: '#6D9DC5' }],
  }
  await applyAndCommit(store, 'card-m', 'card-m', { kind: 'set_widget_data', moduleId: mapMod.id, widget: 'map', data: flat }, 'AI')

  // 读回 widget JSON → decodeMap → 关键字段逐项在。
  const doc2 = await store.open('card-m')
  const mapMod2 = doc2.document.modules.find(m => m.id === mapMod.id)
  const textBlock = mapMod2.blocks.find(b => b.kind === 'text')
  const data2 = decodeMap(new TextDecoder().decode(await store.readPayload('card-m', textBlock.content)))
  check(data2.base?.color === '#6D9DC5' && data2.base.name === '海', 'base 顶层写入解出')
  check(data2.draft.length === 4 && data2.draft[1].kind === 'shape' && data2.draft[2].op === 'subtract' && data2.draft[3].kind === 'poly', 'draft 三图元混合解出')
  check(data2.objects.length === 4 && data2.markers.length === 2, 'objects 解出 + markers 投影')
  const again = decodeMap(encodeMap(data2))
  check(JSON.stringify(again) === JSON.stringify(data2), 'encode→decode 往返逐项一致')

  // 2. map_spawn_view：按王国面取景。
  const spawn = await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id, objectId: 'f-1', aspect: 1.6 }, 'AI')
  check(spawn.outcome.createdModuleIds.length === 1, 'spawn 建一个子模块')
  const childId = spawn.outcome.createdModuleIds[0]
  const doc3 = await store.open('card-m')
  const modules = doc3.document.modules
  const srcIdx = modules.findIndex(m => m.id === mapMod.id)
  check(modules[srcIdx + 1]?.id === childId, '子模块紧跟源模块')
  const child = modules[srcIdx + 1]
  check(child.widget?.type === 'map' && child.name.includes('王国'), `子模块命名 ${child.name}`)
  const childBlock = child.blocks.find(b => b.kind === 'text')
  const childData = decodeMap(new TextDecoder().decode(await store.readPayload('card-m', childBlock.content)))
  check(childData.parent?.moduleId === mapMod.id && childData.parent.objectId === 'f-1', 'parent 溯源记入')
  check(childData.window !== undefined && childData.aspect !== undefined && childData.aspect > 0, `window+aspect 记入（aspect=${String(childData.aspect)}）`)
  const inRange = childData.objects.every(o => {
    const pts = o.type === 'mark' ? [o.pos] : o.pts
    return pts.every(p => p[0] >= -1e-9 && p[0] <= 1 + 1e-9 && p[1] >= -1e-9 && p[1] <= 1 + 1e-9)
  })
  check(inRange, '子模块几何重归一化在 [0,1] 内')
  check(childData.objects.some(o => o.id === 'f-1') && childData.objects.some(o => o.id === 'm-in') && !childData.objects.some(o => o.id === 'm-out'), '框内对象保留、框外地标剔除')
  check(childData.draft.every(e => e.kind === 'poly' || e.kind === 'stroke'), 'shape 展开裁剪后落成 poly/stroke')
  check(childData.draft.some(e => e.op === 'subtract'), 'subtract 语义带到子图')
  check(childData.base?.color === '#6D9DC5', 'base 继承')

  // 3. 显式 bbox 取景 + 无对象报错
  const spawn2 = await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id, bbox: [0, 0, .5, .5], aspect: 1.6 }, 'AI')
  check(spawn2.outcome.createdModuleIds.length === 1, '显式 bbox 取景')
  let rejected = false
  try { await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id }, 'AI') } catch { rejected = true }
  check(rejected, '无 objectId/bbox 拒绝')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
