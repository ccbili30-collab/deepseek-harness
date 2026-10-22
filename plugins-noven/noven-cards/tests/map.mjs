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
import { registerCardTools } from '../lib/tools.js'
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

  // 3. world 生成源编解码：种子/配置/高度图往返不丢，非法整段丢、旧卡无 world 不炸
  {
    const withWorld = decodeMap(encodeMap({
      version: 1, description: '', markers: [], objects: [], draft: [],
      palette: [{ name: '海', desc: 'ocean', color: '#6D9DC5', level: 5 }],
      world: {
        seed: 'abc123', config: { points: 4000 },
        heightmap: { kind: 'heights', heights: [5, 40, 80] },
        postSteps: ['Smooth 2 0 0 0'],
      },
    }))
    check(withWorld.world?.seed === 'abc123' && withWorld.world.config?.points === 4000, 'world 源往返：seed/config 保留')
    check(withWorld.world?.heightmap.kind === 'heights' && withWorld.world.heightmap.heights[2] === 80, 'world 源往返：heights 保留')
    check(withWorld.world?.postSteps?.[0] === 'Smooth 2 0 0 0', 'world 源往返：postSteps 保留')
    check(withWorld.palette[0]?.level === 5, 'palette.level 往返')
    const draftWorld = decodeMap(encodeMap({ ...withWorld, world: { seed: 's', heightmap: { kind: 'draft' } } }))
    check(draftWorld.world?.heightmap.kind === 'draft', 'world 源往返：draft 输入保留')
    const legacy = decodeMap(JSON.stringify({ noven: { description: 'x', objects: [], draft: [], palette: [] } }))
    check(legacy.world === undefined, '旧卡无 world 段不炸')
    const bad = decodeMap(JSON.stringify({ noven: { world: { seed: '', heightmap: { kind: 'nope' } } } }))
    check(bad.world === undefined, '非法 world 整段丢弃')
  }

  // 3b. world 模块的 spawn：不是裁几何，是裁区域重采样——子模块存新的 world 源
  {
    const withWorld = { ...flat, world: { seed: 'resample-parent', config: { points: 3000 }, heightmap: { kind: 'template', template: 'continents' } } }
    await applyAndCommit(store, 'card-m', 'card-m', { kind: 'set_widget_data', moduleId: mapMod.id, widget: 'map', data: withWorld }, 'AI')
    const spawnW = await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id, bbox: [.2, .2, .6, .6], aspect: 1.6 }, 'AI')
    const wChildId = spawnW.outcome.createdModuleIds[0]
    const docW = await store.open('card-m')
    const wChild = docW.document.modules.find(m => m.id === wChildId)
    const wBlock = wChild.blocks.find(b => b.kind === 'text')
    const wData = decodeMap(new TextDecoder().decode(await store.readPayload('card-m', wBlock.content)))
    check(wData.world !== undefined && wData.world.seed !== 'resample-parent', `world 子视图：子种子派生（${String(wData.world?.seed)}）`)
    check(wData.world?.heightmap.kind === 'heights' && wData.world.heightmap.heights.length > 300, `world 子视图：重采样高度图 ${String(wData.world?.heightmap.kind === 'heights' ? wData.world.heightmap.heights.length : 0)} 格`)
    check(wData.parent?.bbox?.[0] === .2 && wData.window !== undefined, 'world 子视图：parent+window 溯源')
    check(wData.world?.config?.states !== undefined, 'world 子视图：实体上限按区域缩放')
    // 复原：不留 world 给后续 bbox 用例
    await applyAndCommit(store, 'card-m', 'card-m', { kind: 'set_widget_data', moduleId: mapMod.id, widget: 'map', data: flat }, 'AI')
  }

  // 4. 显式 bbox 取景 + 无对象报错
  const spawn2 = await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id, bbox: [0, 0, .5, .5], aspect: 1.6 }, 'AI')
  check(spawn2.outcome.createdModuleIds.length === 1, '显式 bbox 取景')
  let rejected = false
  try { await applyAndCommit(store, 'card-m', 'card-m', { kind: 'map_spawn_view', moduleId: mapMod.id }, 'AI') } catch { rejected = true }
  check(rejected, '无 objectId/bbox 拒绝')

  // 5. write_map_document：整份 Fantasy-Map-Generator `.map` 原样落进地图模块文字块。
  {
    await store.create('FMG 地图', 'AI', () => ({
      id: 'card-fmg', kind: 'WORLD', name: 'FMG 地图', modules: [], resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
    }))
    await applyAndCommit(store, 'card-fmg', 'card-fmg', { kind: 'add_module', name: '世界图', widget: 'map' }, 'AI')
    const fmgDoc = await store.open('card-fmg')
    const fmgModule = fmgDoc.document.modules.find(m => m.widget?.type === 'map')
    const payload = '1.154.2|File can be loaded in azgaar.github.io/Fantasy-Map-Generator|2026-1-1|seed\r\nsettings\r\n'
    await applyAndCommit(store, 'card-fmg', 'card-fmg', { kind: 'write_map_document', moduleId: fmgModule.id, text: payload }, 'AI')
    const after = await store.open('card-fmg')
    const afterModule = after.document.modules.find(m => m.id === fmgModule.id)
    const block = afterModule.blocks.find(b => b.kind === 'text')
    const stored = new TextDecoder().decode(await store.readPayload('card-fmg', block.content))
    check(stored === payload, 'write_map_document 原样写入地图文字块')
    await applyAndCommit(store, 'card-fmg', 'card-fmg', {
      kind: 'write_map_document', moduleId: fmgModule.id, text: payload,
      stage: 'terrain', summary: { counts: { states: 0, cultures: 1, burgs: 0, markers: 0 }, states: [] },
    }, 'AI')
    const staged = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)
    check(staged?.widget?.mapStage === 'terrain', 'write_map_document 记下地形阶段')
    check(staged?.widget?.mapSummary?.counts?.states === 0, 'write_map_document 记下地图摘要')

    // 6. request_map_generation：工具排队，生成保存后清除请求。
    const request = { template: 'blank', empty: true, seed: 't', width: 1280, height: 800, points: 1000 }
    await applyAndCommit(store, 'card-fmg', 'card-fmg', { kind: 'request_map_generation', moduleId: fmgModule.id, request }, 'AI')
    const requested = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)
    check(requested?.widget?.request?.template === 'blank' && requested.widget.request.empty === true, 'request_map_generation 排队并保留参数')
    await applyAndCommit(store, 'card-fmg', 'card-fmg', { kind: 'write_map_document', moduleId: fmgModule.id, text: payload }, 'AI')
    const cleared = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)
    check(cleared?.widget?.request === undefined, '地图文档写入后清除生成请求')

    // 6b. request_map_edit：改图请求排队，随后保存清除。
    const editOperations = [{ op: 'States.rename', args: [1, '寒川'] }]
    await applyAndCommit(store, 'card-fmg', 'card-fmg', { kind: 'request_map_edit', moduleId: fmgModule.id, operations: editOperations }, 'AI')
    const editQueued = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)
    check(editQueued?.widget?.request?.kind === 'edit' && editQueued.widget.request.operations?.[0]?.op === 'States.rename', 'request_map_edit 排队并保留动作')

    // 7. generate_map 工具：排队参数落到 map 模块的 request 上。
    const registered = new Map()
    registerCardTools({ tools: { register: definition => { registered.set(definition.name, definition) } } })
    const exec = { agent: { session: { id: 'sess-map', header: { cwd: root } } } }
    const summaryRead = await registered.get('map_summary').execute({
      root_id: 'card-fmg', target_id: 'card-fmg', module_id: fmgModule.id,
    }, exec)
    check(summaryRead.status === 'read' && summaryRead.summary?.counts?.states === 0, 'map_summary 读出已保存摘要')
    const editToolResult = await registered.get('map_edit').execute({
      root_id: 'card-fmg', target_id: 'card-fmg', module_id: fmgModule.id,
      operations: [{ op: 'States.rename', args: [1, '寒川'] }],
    }, exec)
    check(editToolResult.status === 'requested', 'map_edit 回 requested')
    const editToolRequest = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)?.widget?.request
    check(editToolRequest?.kind === 'edit' && editToolRequest.operations?.[0]?.op === 'States.rename', 'map_edit 动作写进地图模块 request')

    const generated = await registered.get('generate_map').execute({
      root_id: 'card-fmg', target_id: 'card-fmg', module_id: fmgModule.id,
      template: 'blank', seed: 'tool-test', width: 1024, height: 640, points: 4000,
    }, exec)
    check(generated.status === 'requested' && generated.template === 'blank' && generated.empty === true, 'generate_map 回 requested 且 blank 带 empty')
    const toolRequest = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)?.widget?.request
    check(toolRequest?.template === 'blank' && toolRequest?.seed === 'tool-test' && toolRequest?.width === 1024, 'generate_map 参数写进地图模块 request')

    // 8. 白膜地形：构图/增量/摘要；只在没有地图文档时接受请求。
    await store.create('AI 白膜', 'AI', () => ({
      id: 'card-terrain', kind: 'WORLD', name: 'AI 白膜', modules: [], resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
    }))
    await applyAndCommit(store, 'card-terrain', 'card-terrain', { kind: 'add_module', name: '世界图', widget: 'map' }, 'AI')
    const terrainModule = (await store.open('card-terrain')).document.modules.find(m => m.widget?.type === 'map')
    const spec = { seed: 'test', landRatio: 0.3, landmasses: [{ shape: 'ellipse', center: [0.5, 0.5], radius: [0.2, 0.16] }] }
    await applyAndCommit(store, 'card-terrain', 'card-terrain', { kind: 'request_map_compose', moduleId: terrainModule.id, spec }, 'AI')
    const composeQueued = (await store.open('card-terrain')).document.modules.find(m => m.id === terrainModule.id)
    check(composeQueued?.widget?.request?.kind === 'compose' && composeQueued.widget.request.spec?.seed === 'test', 'request_map_compose 排队构图')
    const terrainSummary = { landRatio: 0.3, land: 300, cells: 1000, min: 0, max: 62, ascii: '#.' }
    await applyAndCommit(store, 'card-terrain', 'card-terrain', { kind: 'record_map_terrain', moduleId: terrainModule.id, summary: terrainSummary }, 'AI')
    const recorded = (await store.open('card-terrain')).document.modules.find(m => m.id === terrainModule.id)
    check(recorded?.widget?.mapTerrainSummary?.landRatio === 0.3, 'record_map_terrain 记下地形摘要')
    check(recorded?.widget?.request === undefined, '地形摘要写入后清除构图请求')
    await applyAndCommit(store, 'card-terrain', 'card-terrain', { kind: 'request_map_paint', moduleId: terrainModule.id, operations: [{ op: 'add_ridge', args: { path: [[0.2, 0.2], [0.5, 0.3]], height: 40 } }] }, 'AI')
    const paintQueued = (await store.open('card-terrain')).document.modules.find(m => m.id === terrainModule.id)
    check(paintQueued?.widget?.request?.kind === 'paint' && paintQueued.widget.request.operations?.[0]?.op === 'add_ridge', 'request_map_paint 排队地形动作')
    const composeTool = await registered.get('map_compose').execute({
      root_id: 'card-terrain', target_id: 'card-terrain', module_id: terrainModule.id, spec,
    }, exec)
    check(composeTool.status === 'requested', 'map_compose 工具回 requested')
    const summaryTool = await registered.get('map_terrain_summary').execute({
      root_id: 'card-terrain', target_id: 'card-terrain', module_id: terrainModule.id,
    }, exec)
    check(summaryTool.status === 'read' && summaryTool.summary?.landRatio === 0.3, 'map_terrain_summary 读出摘要')
    const paintTool = await registered.get('map_paint').execute({
      root_id: 'card-terrain', target_id: 'card-terrain', module_id: terrainModule.id,
      operations: [{ op: 'add_ridge', args: { path: [[0.2, 0.2], [0.5, 0.3]], height: 30 } }],
    }, exec)
    check(paintTool.status === 'requested', 'map_paint 工具回 requested')
    const painted = (await store.open('card-terrain')).document.modules.find(m => m.id === terrainModule.id)?.widget?.request
    check(painted?.kind === 'paint', 'map_paint 动作写进 request')

    const humanTool = await registered.get('generate_map_human').execute({
      root_id: 'card-fmg', target_id: 'card-fmg', module_id: fmgModule.id,
    }, exec)
    check(humanTool.status === 'requested', 'generate_map_human 工具回 requested')
    const humanRequest = (await store.open('card-fmg')).document.modules.find(m => m.id === fmgModule.id)?.widget?.request
    check(humanRequest?.kind === 'human', 'generate_map_human 写进 request')
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
