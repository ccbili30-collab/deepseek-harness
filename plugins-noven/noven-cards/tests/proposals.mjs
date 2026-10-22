/**
 * 提案语义（契约 C5）与数据格式 v2 自测：
 * AI 写入默认落 proposal.json 不碰 head；预览 = head + 补丁；接受/拒绝
 * 支持整份或按模块挑选；人在挂起期间的编辑与提案隔离（同模块则标 stale）；
 * 信任档 'auto' 恢复直接提交。另测时间线/集合/布局 v2 编解码与 v1 投影兼容。
 *
 * Run: node tests/proposals.mjs（或 pnpm test）
 * @module noven-cards/tests/proposals
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardStore } from '../lib/store.js'
import { registerCardTools } from '../lib/tools.js'
import { applyAndCommit } from '../lib/editor.js'
import { acceptProposal, proposalChanges, proposalPreview, proposeEdit, rejectProposal } from '../lib/proposals.js'
import { aiTrustOf } from '../lib/trust.js'
import { decodeCollection, decodeLayout, decodeTimeline, encodeCollection, encodeLayout, encodeTimeline, formatTime } from '../lib/formats.js'

const root = mkdtempSync(join(tmpdir(), 'noven-cards-proposals-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const textOf = async (store, cardId, mod) => new TextDecoder().decode(await store.readPayload(cardId, mod.blocks[0].content))

try {
  const store = new CardStore(root)

  // 0. 建一张两模块的卡
  await store.create('提案世界', 'AI', async receive => {
    const [p1, p2] = await Promise.all([receive(new TextEncoder().encode('甲')), receive(new TextEncoder().encode('乙'))])
    const mod = (id, name, content) => ({ id, name, tags: [], children: [], layout: 'VERTICAL', characterIds: [], blocks: [{ kind: 'text', id: `${id}-b`, content }] })
    return {
      id: 'card-p', kind: 'WORLD', name: '提案世界', resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
      modules: [mod('m-a', '模块甲', p1), mod('m-b', '模块乙', p2)],
    }
  })

  // 1. proposeEdit 只写 proposal.json，head 不动
  const out1 = await proposeEdit(store, 'card-p', 'card-p', { kind: 'write_text', moduleId: 'm-a', blockId: 'm-a-b', moduleName: '模块甲', text: 'AI 改写甲' })
  const head1 = await store.open('card-p')
  check(head1.revision === 1, `提案不碰 head（r${String(head1.revision)}）`)
  check(await textOf(store, 'card-p', head1.document.modules[0]) === '甲', 'head 的模块甲仍是原文')
  const preview1 = proposalPreview(head1.document, out1.proposal)
  check(await textOf(store, 'card-p', preview1.modules[0]) === 'AI 改写甲', '预览叠出 AI 改动')
  const changes1 = proposalChanges(head1.document, out1.proposal)
  check(changes1.length === 1 && changes1[0].kind === 'changed' && changes1[0].stale === false, 'diff 列出一条未过期的改动')

  // 2. 第二条命令叠进同一个提案
  const out2 = await proposeEdit(store, 'card-p', 'card-p', { kind: 'add_module', name: 'AI 新增模块' })
  const proposal2 = await store.proposal('card-p')
  const changes2 = proposalChanges((await store.open('card-p')).document, proposal2)
  check(changes2.length === 2 && changes2.some(c => c.kind === 'added' && c.name === 'AI 新增模块'), '连续命令叠进同一提案（两条改动）')

  // 3. 人改另一个模块：互不干扰；接受提案不吞人的编辑
  const human = await applyAndCommit(store, 'card-p', 'card-p', { kind: 'write_text', moduleId: 'm-b', blockId: 'm-b-b', moduleName: '模块乙', text: '人改写乙' }, 'HUMAN')
  check(human.saved.revision === 2, '人提交不受挂起提案影响')
  const changes3 = proposalChanges(human.saved.document, await store.proposal('card-p'))
  check(changes3.every(c => c.stale === false), '人改别的模块后提案仍全部未过期')
  const savedAccept = await acceptProposal(store, 'card-p')
  const docAccept = savedAccept.document
  check(await textOf(store, 'card-p', docAccept.modules[0]) === 'AI 改写甲'
    && await textOf(store, 'card-p', docAccept.modules[1]) === '人改写乙'
    && docAccept.modules.some(m => m.name === 'AI 新增模块'), '接受提案：AI 改动落地，人的编辑原样保留')
  check(await store.proposal('card-p') === undefined, '整份接受后提案清空')

  // 4. 人改同一个模块 → stale；接受会覆盖人的编辑（UI 用 stale 提示）
  await proposeEdit(store, 'card-p', 'card-p', { kind: 'write_text', moduleId: 'm-a', blockId: 'm-a-b', moduleName: '模块甲', text: 'AI 再改甲' })
  await applyAndCommit(store, 'card-p', 'card-p', { kind: 'write_text', moduleId: 'm-a', blockId: 'm-a-b', moduleName: '模块甲', text: '人也改甲' }, 'HUMAN')
  const head4 = await store.open('card-p')
  const changes4 = proposalChanges(head4.document, await store.proposal('card-p'))
  check(changes4.length === 1 && changes4[0].stale === true, '人改过同一模块：改动标 stale')
  const saved4 = await acceptProposal(store, 'card-p')
  check(await textOf(store, 'card-p', saved4.document.modules[0]) === 'AI 再改甲', '接受 stale 改动覆盖人的编辑（明示的取舍）')

  // 5. 部分接受/拒绝
  await proposeEdit(store, 'card-p', 'card-p', { kind: 'add_module', name: '提案模块一' })
  const out5 = await proposeEdit(store, 'card-p', 'card-p', { kind: 'add_module', name: '提案模块二' })
  const changes5 = proposalChanges((await store.open('card-p')).document, out5.proposal)
  const [first, second] = changes5.filter(c => c.kind === 'added')
  const saved5 = await acceptProposal(store, 'card-p', [first.moduleId])
  check(saved5.document.modules.some(m => m.name === '提案模块一') && !saved5.document.modules.some(m => m.name === '提案模块二'), '部分接受只落地选中的模块')
  const remaining = proposalChanges(saved5.document, await store.proposal('card-p'))
  check(remaining.length === 1 && remaining[0].moduleId === second.moduleId, '未被接受的改动仍在提案里')
  await rejectProposal(store, 'card-p')
  check(await store.proposal('card-p') === undefined && !(await store.open('card-p')).document.modules.some(m => m.name === '提案模块二'), '拒绝丢弃剩余补丁')

  // 5b. 素材资源改动也要进提案——不然接受后 visualKey 指向不存在的资源
  const png1x1 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await proposeEdit(store, 'card-p', 'card-p', { kind: 'adopt_image', bytes: png1x1, mediaType: 'image/png', moduleId: null })
  const saved5b = await acceptProposal(store, 'card-p')
  check(saved5b.document.resources.length === 1 && saved5b.document.resources[0].mediaType === 'image/png', '素材资源补丁随提案接受落地')
  check((await store.open('card-p')).document.resources.length === 1, '接受的资源写入 head')

  // 6. AI 工具直接提交：不再经过提案确认，也不看旧的信任档
  check(await aiTrustOf(root, 'card-p') === 'propose', '旧信任档仍可读（工具已不使用）')
  const registered = new Map()
  registerCardTools({ tools: { register: def => { registered.set(def.name, def) } } })
  const exec = { agent: { session: { id: 'sess-p', header: { cwd: root } } } }
  const saved6 = await registered.get('rename_card').execute({ root_id: 'card-p', target_id: 'card-p', name: '直接世界' }, exec)
  check(saved6.status === 'saved' && (await store.open('card-p')).document.name === '直接世界', '工具直接提交')
  check(await store.proposal('card-p') === undefined, '直接提交不产生提案')
  const wrote6 = await registered.get('write_module_text').execute({ root_id: 'card-p', target_id: 'card-p', module_id: 'm-a', block_id: '', text: '直接写正文' }, exec)
  const afterWrite = await store.open('card-p')
  check(wrote6.status === 'saved' && afterWrite.document.modules[0].name === '模块甲', '省略 name 时不清空模块名')

  // 7. 时间线 v2 编解码
  const timeline = {
    version: 2,
    calendar: { name: '神历', units: [{ name: '年', per: 1 }], cycles: [], epoch: 0, step: 1, format: '神历 {n} 年', formatBefore: '前 {n} 年', unit: '年' },
    views: [
      { name: '公元纪年', units: [{ name: '年', per: 360 }, { name: '日', per: 1 }], cycles: [], epoch: 0, step: 1, format: '公元{n}年', formatBefore: '公元前{n}年', unit: '日' },
      { units: [], cycles: [], epoch: 0, step: 1, format: '{n}', formatBefore: '前{n}' },
    ],
    eras: [
      { id: 'era-1', name: '第一纪', from: 0, to: 300, color: 'purple' },
      { id: 'era-2', name: '未竟之世', from: 400, to: null, color: 'blue', description: '向未来开放' },
    ],
    events: [
      { id: 'ev-1', at: 42, until: null, title: '大雪', description: '纪元的开端', characters: ['沈青梧'], relations: ['师徒'] },
      { id: 'ev-2', at: null, until: null, title: '未定', description: '', characters: [] },
      { id: 'ev-3', at: 500, until: null, ongoing: true, title: '进行中的革命', description: '', characters: [], color: 'pink' },
    ],
  }
  const encoded = encodeTimeline(timeline)
  const decoded = decodeTimeline(encoded)
  check(decoded.events.length === 3 && decoded.eras.length === 2 && decoded.calendar.step === 1, '时间线 v2 往返一致')
  check(decoded.events[1].at === null && decoded.eras[1].to === null, 'null 端点/未放置不被解码成 0')
  check(decoded.events[2].ongoing === true && decoded.events[2].color === 'pink', 'ongoing 与事件色往返一致')
  check(decoded.events[0].relations?.[0] === '师徒', '事件关联关系往返一致')
  check(decoded.calendar.unit === '年' && decoded.calendar.units[0].per === 1, '历法单位链与兼容 unit 往返一致')
  check(decoded.views.length === 1 && decoded.views[0].name === '公元纪年' && decoded.views[0].units[0].per === 360, '命名历法视图往返、无名视图丢弃')
  const projection = JSON.parse(encoded)
  check(projection.nodes.length === 3 && projection.nodes[0].time === '神历 42 年' && projection.nodes[1].time === '神历 500 年' && projection.nodes[2].time === '', 'nodes 投影按 at 排序、未放置置底')
  const greg = { ...timeline.calendar, format: '公元{n}年', formatBefore: '公元前{n}年' }
  check(formatTime(greg, -5) === '公元前5年', 'formatBefore 模板自带单位名不再叠单位')
  check(formatTime({ ...timeline.calendar, formatBefore: '前 {n}' }, -5) === '前 5年', 'formatBefore 不带单位时仍补单位名')
  const multi = { ...timeline.calendar, units: [{ name: '年', per: 360 }, { name: '月', per: 30 }, { name: '日', per: 1 }], unit: '日', formatBefore: '公元前{n}年' }
  check(formatTime(multi, -79560) === '公元前221年' && formatTime(multi, -79700) === '公元前221年4月20日', '多单位复合串剥掉模板重复单位后缀')
  const v1 = decodeTimeline(JSON.stringify({ version: 1, kind: 'timeline', nodes: [{ time: '元年', title: '旧节点', description: 'v1' }] }))
  check(v1.events.length === 1 && v1.events[0].at === null && v1.events[0].title === '旧节点', 'v1 nodes 读成未放置事件')
  const external = decodeTimeline(JSON.stringify({
    version: 2, kind: 'timeline',
    nodes: [{ time: 'x', title: '大雪', description: '' }, { time: 'y', title: '外部新增', description: '' }],
    noven: { calendar: timeline.calendar, eras: [], events: [timeline.events[0]] },
  }))
  check(external.events.length === 2 && external.events.some(e => e.title === '外部新增' && e.at === null), '投影对账：外部新增的 node 回收为未放置事件')

  // 7b. 历法命令：set_calendar 带名入视图库，switch_view 切视图不碰轴值
  await store.create('历法卡', 'AI', async receive => ({
    id: 'card-tl', kind: 'WORLD', name: '历法卡', resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
    modules: [{
      id: 'm-tl', name: '时间线', tags: [], children: [], layout: 'VERTICAL', characterIds: [],
      widget: { type: 'timeline' },
      blocks: [{ kind: 'text', id: 'm-tl-b', content: await receive(new TextEncoder().encode(encodeTimeline(timeline))) }],
    }],
  }))
  const tlOf = async () => decodeTimeline(new TextDecoder().decode(
    await store.readPayload('card-tl', (await store.open('card-tl')).document.modules[0].blocks[0].content)))
  const gregorian = { name: '公元纪年', units: [{ name: '年', per: 360 }, { name: '日', per: 1 }], cycles: [], epoch: 0, step: 1, format: '公元{n}年', formatBefore: '公元前{n}年', unit: '日' }
  await applyAndCommit(store, 'card-tl', 'card-tl', { kind: 'timeline_set_calendar', moduleId: 'm-tl', calendar: gregorian }, 'AI')
  const afterSet = await tlOf()
  check(afterSet.calendar.name === '公元纪年' && afterSet.views.some(v => v.name === '公元纪年'), 'set_calendar 带名：切过去并进视图库')
  check(afterSet.events[0].at === 42 && afterSet.eras[0].from === 0, '换历法不动轴上数值')
  await applyAndCommit(store, 'card-tl', 'card-tl', { kind: 'timeline_switch_view', moduleId: 'm-tl', name: '公元纪年' }, 'AI')
  check((await tlOf()).calendar.format === '公元{n}年', 'switch_view 切到命名视图')
  const beforeNoop = await tlOf()
  await applyAndCommit(store, 'card-tl', 'card-tl', { kind: 'timeline_switch_view', moduleId: 'm-tl', name: '不存在的历法' }, 'AI')
  check((await tlOf()).calendar.name === beforeNoop.calendar.name, 'switch_view 未知名不动当前历法')

  // 8. 集合 v2 编解码
  const collection = {
    version: 2,
    fields: [{ id: 'f-1', name: '阵营', type: 'text' }, { id: 'f-2', name: '立绘', type: 'image' }],
    items: [{ id: 'it-1', name: '条目一', summary: 's', description: 'd', visualKey: null }],
    values: { 'it-1': { 'f-1': '守序', 'f-2': { resourceId: 'r1' } } },
    view: 'cards',
  }
  const decodedC = decodeCollection(encodeCollection(collection))
  check(decodedC.fields.length === 2 && decodedC.values['it-1']['f-2'].resourceId === 'r1' && decodedC.view === 'cards', '集合 v2 往返一致')
  const orphan = decodeCollection(JSON.stringify({
    version: 2, kind: 'collection',
    items: [{ id: 'it-1', name: 'a', summary: '', description: '' }],
    noven: { fields: [{ id: 'f-1', name: 'x', type: 'text' }], values: { 'it-1': { 'f-9': '孤儿值' }, 'it-9': { 'f-1': '孤儿条目' } }, view: 'list' },
  }))
  check(Object.keys(orphan.values).length === 0, '孤儿值/孤儿条目被清出 values')

  // 9. 布局编解码
  const layout = { version: 1, grid: 12, tiles: [{ id: 't-1', source: { moduleId: 'm-a' }, x: 0, y: 0, w: 6, h: 2, hidden: false }] }
  check(decodeLayout(encodeLayout(layout)).tiles[0].w === 6, '布局 v1 往返一致')
  check(decodeLayout('not json').tiles.length === 0 && decodeLayout(undefined).grid === 12, '布局损坏/缺失回空布局')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (process.env.KEEP) console.error(`KEPT: ${root}`)
  else rmSync(root, { recursive: true, force: true })
}
