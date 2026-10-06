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
import { aiTrustOf, setAiTrust } from '../lib/trust.js'
import { decodeCollection, decodeLayout, decodeTimeline, encodeCollection, encodeLayout, encodeTimeline } from '../lib/formats.js'

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

  // 6. 信任档：默认 propose → 工具回 proposed；auto → 工具直接 saved
  check(await aiTrustOf(root, 'card-p') === 'propose', '信任档缺省为 propose')
  const registered = new Map()
  registerCardTools({ tools: { register: def => { registered.set(def.name, def) } } })
  const exec = { agent: { session: { id: 'sess-p', header: { cwd: root } } } }
  const proposed = await registered.get('rename_card').execute({ root_id: 'card-p', target_id: 'card-p', name: '提案世界改名' }, exec)
  check(proposed.status === 'proposed' && proposed.pending === true, '工具在 propose 档下回 proposed')
  const headAfterTool = await store.open('card-p')
  check(headAfterTool.document.name === '提案世界', 'proposed 的改名没碰 head')
  await rejectProposal(store, 'card-p')
  await setAiTrust(root, 'card-p', 'auto')
  check(await aiTrustOf(root, 'card-p') === 'auto', '信任档可切到 auto')
  const saved6 = await registered.get('rename_card').execute({ root_id: 'card-p', target_id: 'card-p', name: '自动世界' }, exec)
  check(saved6.status === 'saved' && (await store.open('card-p')).document.name === '自动世界', 'auto 档下工具直接提交')
  await setAiTrust(root, 'card-p', 'propose')

  // 7. 时间线 v2 编解码
  const timeline = {
    version: 2,
    calendar: { name: '神历', unit: '年', epoch: 0, step: 1, format: '神历 {n} 年' },
    eras: [{ id: 'era-1', name: '第一纪', from: 0, to: 300, color: 'purple' }],
    events: [
      { id: 'ev-1', at: 42, until: null, title: '大雪', description: '纪元的开端', characters: [] },
      { id: 'ev-2', at: null, until: null, title: '未定', description: '', characters: [] },
    ],
  }
  const encoded = encodeTimeline(timeline)
  const decoded = decodeTimeline(encoded)
  check(decoded.events.length === 2 && decoded.eras.length === 1 && decoded.calendar.step === 1, '时间线 v2 往返一致')
  const projection = JSON.parse(encoded)
  check(projection.nodes.length === 2 && projection.nodes[0].time === '神历 42 年' && projection.nodes[1].time === '', 'nodes 投影按 at 排序、未放置置底')
  const v1 = decodeTimeline(JSON.stringify({ version: 1, kind: 'timeline', nodes: [{ time: '元年', title: '旧节点', description: 'v1' }] }))
  check(v1.events.length === 1 && v1.events[0].at === null && v1.events[0].title === '旧节点', 'v1 nodes 读成未放置事件')
  const external = decodeTimeline(JSON.stringify({
    version: 2, kind: 'timeline',
    nodes: [{ time: 'x', title: '大雪', description: '' }, { time: 'y', title: '外部新增', description: '' }],
    noven: { calendar: timeline.calendar, eras: [], events: [timeline.events[0]] },
  }))
  check(external.events.length === 2 && external.events.some(e => e.title === '外部新增' && e.at === null), '投影对账：外部新增的 node 回收为未放置事件')

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
