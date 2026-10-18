/**
 * 路由层自测（契约 C2/C5/C6/C7/C8）：用最小假 ctx 挂路由，直接打
 * Request —— GET 回执带提案/信任档；?since= 返回变化清单与提案摘要；
 * diff/accept/reject/trust ops；/api/noven-tree 聚合与 304 轮询；
 * create 的 starter 字段。
 *
 * Run: node tests/routes.mjs（或 pnpm test）
 * @module noven-cards/tests/routes
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CardStore } from '../lib/store.js'
import { registerCardRoutes } from '../lib/routes.js'
import { registerTreeRoutes } from '../lib/tree.js'
import { proposeEdit } from '../lib/proposals.js'

const root = mkdtempSync(join(tmpdir(), 'noven-cards-routes-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

/** 最小假 ctx：effect 立即执行；无会话也无持久层，路由走 ?root= 直取项目。 */
const routes = new Map()
const fakeCtx = {
  effect: fn => fn(),
  connection: { fetch: { register: def => { routes.set(def.path, def) } } },
  sessions: { get: () => undefined },
  get: () => undefined,
}
registerCardRoutes(fakeCtx)
registerTreeRoutes(fakeCtx)
const cardRoute = routes.get('/api/noven-cards')
const treeRoute = routes.get('/api/noven-tree')

const get = (path) => cardRoute.fetch(new Request(`http://t${path}`))
const post = (body) => cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

try {
  const store = new CardStore(root)
  await store.create('路由世界', 'AI', async receive => {
    const p = await receive(new TextEncoder().encode('甲'))
    return {
      id: 'card-r', kind: 'WORLD', name: '路由世界', resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
      modules: [{ id: 'm-a', name: '模块甲', tags: [], children: [], layout: 'VERTICAL', characterIds: [], blocks: [{ kind: 'text', id: 'b-a', content: p }] }],
    }
  })

  // 1. GET 回执带提案/信任档字段；preview=1 叠提案
  const plain = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r`)).json()
  check(plain.hasProposal === false && plain.aiTrust === 'propose' && plain.document.modules[0].name === '模块甲', 'GET 回执：无提案 + 默认信任档')
  await proposeEdit(store, 'card-r', 'card-r', { kind: 'write_text', moduleId: 'm-a', blockId: 'b-a', moduleName: '模块甲', text: 'AI 改写' })
  const ghost = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r&preview=1`)).json()
  check(ghost.hasProposal === true && ghost.proposal.changes.length === 1, 'GET：挂起提案在回执里')
  const ghostBlock = ghost.document.modules[0].blocks[0]
  const headBlock = plain.document.modules[0].blocks[0]
  check(ghostBlock.ref !== headBlock.ref, 'preview=1 的块内容引用指向新载荷（幽灵态）')

  // 2. diff / accept / reject / trust
  const diff = await (await post({ op: 'diff', cardId: 'card-r' })).json()
  check(diff.pending === true && diff.changes[0].kind === 'changed' && diff.changes[0].stale === false, 'POST diff 列改动')
  const rejected = await (await post({ op: 'reject', cardId: 'card-r' })).json()
  check(rejected.ok === true && (await store.proposal('card-r')) === undefined, 'POST reject 丢提案')
  await proposeEdit(store, 'card-r', 'card-r', { kind: 'add_module', name: '提案模块' })
  const accepted = await (await post({ op: 'accept', cardId: 'card-r' })).json()
  check(accepted.ok === true && (await store.open('card-r')).document.modules.some(m => m.name === '提案模块'), 'POST accept 落地')
  check((await post({ op: 'trust', cardId: 'card-r', mode: 'bogus' })).status === 400, 'trust 拒绝非法模式')
  const trusted = await (await post({ op: 'trust', cardId: 'card-r', mode: 'auto' })).json()
  check(trusted.aiTrust === 'auto', 'trust 切换成功')

  // 3. since 轮询：同修订无变化；提交后列变化模块；快照缺失回 full
  const before = (await store.open('card-r')).revision
  const quiet = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r&since=${String(before)}`)).json()
  check(quiet.revision === before && quiet.changed.length === 0 && quiet.added.length === 0, 'since=当前修订 → 无变化')
  await post({ op: 'apply', cardId: 'card-r', command: { kind: 'rename_module', moduleId: 'm-a', name: '模块甲改名' } })
  const after = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r&since=${String(before)}`)).json()
  check(after.revision === before + 1 && after.changed.includes('m-a'), `since 报变化模块（r${String(before)}→r${String(after.revision)}）`)
  const missing = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r&since=999`)).json()
  check(missing.revision === after.revision && missing.changed.length === 0, 'since>当前修订 → 无变化')
  const ancient = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&card=card-r&since=1`)).json()
  check(ancient.changed.length > 0 || ancient.full === true, 'since=旧修订 → 变化或全量')

  // 4. create 的 starter：WORLD blank 带「设定总览」锚点模块，CHARACTER 保持空卡（契约 C7/Q4）
  const worldCard = await (await post({ op: 'create', kind: 'WORLD', name: '起手世界' })).json()
  const worldDoc = (await store.open(worldCard.cardId)).document
  check(worldDoc.modules.length === 1 && worldDoc.modules[0].name === '设定总览' && worldDoc.modules[0].blocks.length === 0, 'WORLD blank 起手带「设定总览」空模块')
  const blankCard = await (await post({ op: 'create', kind: 'CHARACTER', name: '空白角色' })).json()
  check(blankCard.ok === true && blankCard.starter === 'blank', 'create 默认 blank')
  const interviewCard = await (await post({ op: 'create', kind: 'CHARACTER', name: '访谈角色', starter: 'interview' })).json()
  check(interviewCard.ok === true && interviewCard.starter === 'interview', 'create 接 interview')
  check((await post({ op: 'create', kind: 'WORLD', name: 'x', starter: 'bogus' })).status === 400, '非法 starter 拒绝')
  check((await post({ op: 'create', kind: 'WORLD', name: 'x', starter: 'template:fantasy' })).status === 400, '未知模板拒绝')
  const presetCard = await (await post({ op: 'create', kind: 'WORLD', starter: 'template:world', name: '预设世界' })).json()
  check(presetCard.ok === true && typeof presetCard.cardId === 'string', '模板 starter 落卡')
  const presetPayload = await (await cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&card=${presetCard.cardId}`))).json()
  check(presetPayload.card.document.modules.some(m => m.name === '势力名录' && m.widget?.type === 'collection'), '预设世界带势力名录集合模块')
  check(presetPayload.card.document.resources.length === 1, '世界预设带地图底图资源')

  // 5. /api/noven-tree：聚合 + since 304
  const tree1 = await (await treeRoute.fetch(new Request(`http://t/api/noven-tree?root=${encodeURIComponent(root)}`))).json()
  check(tree1.cards.length === 4 && tree1.cards.some(c => c.name === '路由世界' && c.modules.some(m => m.type === 'document')), '树聚合卡与模块类型')
  check(typeof tree1.revision === 'string' && tree1.files.count >= 0, '树带修订号与文件计数')
  const same = await treeRoute.fetch(new Request(`http://t/api/noven-tree?root=${encodeURIComponent(root)}&since=${tree1.revision}`))
  check(same.status === 304, 'since=同 token → 304')
  await proposeEdit(store, 'card-r', 'card-r', { kind: 'add_module', name: '幽灵模块' })
  const tree2 = await (await treeRoute.fetch(new Request(`http://t/api/noven-tree?root=${encodeURIComponent(root)}`))).json()
  check(tree2.revision !== tree1.revision && tree2.cards.find(c => c.cardId === 'card-r').pending === true, '提案挂起 → token 变 + pending 标记')
  check(!tree2.cards.find(c => c.cardId === 'card-r').modules.some(m => m.name === '幽灵模块'), '幽灵模块不进树（仍是 head）')

  // 6. delete → restore：软删除可撤销（客户端「删除 + Toast 撤销」依赖它）
  check((await post({ op: 'restore', cardId: 'card-r' })).status === 404, 'restore 未删除的卡 → 404')
  await post({ op: 'delete', cardId: 'card-r' })
  check(!(await store.list()).includes('card-r'), 'delete 后卡离开列表')
  const restored = await (await post({ op: 'restore', cardId: 'card-r' })).json()
  check(restored.ok === true && (await store.list()).includes('card-r') && (await store.open('card-r')).document.name === '路由世界', 'restore 后卡与历史原样回来')
  check((await post({ op: 'restore' })).status === 400, 'restore 缺 cardId → 400')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (process.env.KEEP) console.error(`KEPT: ${root}`)
  else rmSync(root, { recursive: true, force: true })
}
