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
  check((await post({ op: 'create', kind: 'WORLD', name: 'x', starter: 'template:fantasy' })).status === 400, '未知模板 → 400')
  const templated = await (await post({ op: 'create', kind: 'WORLD', name: '模板世界', starter: 'template:world' })).json()
  const templatedDoc = (await store.open(templated.cardId)).document
  check(templated.ok === true && templatedDoc.modules.some(m => m.name === '世界档案'), 'template:world 落预制骨架')
  check((await post({ op: 'create', kind: 'WORLD', name: 'x', starter: 'template:fantasy' })).status === 400, '未知模板拒绝')
  const presetCard = await (await post({ op: 'create', kind: 'WORLD', starter: 'template:world', name: '预设世界' })).json()
  check(presetCard.ok === true && typeof presetCard.cardId === 'string', '模板 starter 落卡')
  const presetPayload = await (await cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&card=${presetCard.cardId}`))).json()
  const flattenModules = (modules) => modules.flatMap(m => [m, ...flattenModules(m.children ?? [])])
  check(flattenModules(presetPayload.document.modules).some(m => m.name === '势力' && m.widget?.type === 'collection'), '预设世界带势力集合模块')
  check(presetPayload.resources.length === 0, '世界预设默认不带示例资源')
  const refs = await (await cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&refs=1`))).json()
  check(Array.isArray(refs.targets) && refs.targets.some(t => t.cardId === presetCard.cardId), '反查索引列出目标卡')
  check((refs.backlinks?.[presetCard.cardId]?.length ?? 0) === 0, `空白预设无同卡引用（${refs.backlinks?.[presetCard.cardId]?.length ?? 0}）`)

  // 5. 用户模块契约：presentation 随定义保存并在落卡时保留
  const savedModule = await (await post({ op: 'save_user_module', definition: {
    name: '门派名册', shape: 'collection', view: 'cards', cardAspect: 'square',
    fields: [{ name: '名称', type: 'text' }, { name: '徽记', type: 'image' }, { name: '立场', type: 'chips' }],
    presentation: { contract: 'sect-roster', layout: 'heraldry', core: ['名称', '徽记'], optional: ['立场'], detail: [{ title: '立场', fields: ['立场'] }], editor: { create: ['名称', '徽记'], detail: ['立场'] }, assets: [{ id: 'emblem', role: '徽记', ratio: '1:1', render: '96x96', export: '192x192' }], links: ['place'] },
  } })).json()
  check(savedModule.ok === true && savedModule.module?.presentation?.contract === 'sect-roster', '用户模块保存 presentation 契约')
  const moduleList = await (await get(`/api/noven-cards?root=${encodeURIComponent(root)}&modules=1`)).json()
  check(moduleList.modules?.some(module => module.presentation?.contract === 'sect-roster'), '用户模块库回读 presentation')
  const customMounted = await (await post({ op: 'apply', cardId: blankCard.cardId, command: { kind: 'add_module_custom', name: '门派名册', definition: savedModule.module } })).json()
  check(customMounted.ok === true, '用户模块可添加到卡')
  const customPayload = await (await cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&card=${blankCard.cardId}`))).json()
  const customModule = flattenModules(customPayload.document.modules).find(module => module.name === '门派名册')
  check(customModule?.widget?.data?.presentation?.contract === 'sect-roster', '用户模块落卡保留 presentation')

  // 6. /api/noven-tree：聚合 + since 304
  const tree1 = await (await treeRoute.fetch(new Request(`http://t/api/noven-tree?root=${encodeURIComponent(root)}`))).json()
  check(tree1.cards.length >= 5 && tree1.cards.some(c => c.name === '路由世界' && c.modules.some(m => m.type === 'document')), '树聚合卡与模块类型')
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

  // 7. 删除不设引用拦截（用户拍板 2026-10-21）：删卡、删模块都照办，引用方自己处理缺失。
  const characterCard = await (await post({ op: 'create', kind: 'CHARACTER', name: '守卫预设角色', starter: 'template:character' })).json()
  check(typeof characterCard.cardId === 'string', '预设角色卡创建（删除回归夹具）')
  const characterDoc = await (await cardRoute.fetch(new Request(`http://t/api/noven-cards?root=${encodeURIComponent(root)}&card=${characterCard.cardId}`))).json()
  const sourceModule = characterDoc.document.modules.find(module => module.name === '角色档案')
  check(sourceModule !== undefined, '预设角色卡带「角色档案」')
  const removedModule = await post({
    op: 'apply', cardId: characterCard.cardId, targetId: characterCard.cardId,
    command: { kind: 'remove_module', moduleId: sourceModule.id },
  })
  check(removedModule.status === 200, `被同卡集合引用的模块也照删（实际 ${String(removedModule.status)}）`)
  const characterDelete = await post({ op: 'delete', cardId: characterCard.cardId })
  check(characterDelete.status === 200, `同卡自引用的卡照删（实际 ${String(characterDelete.status)}）`)
  check(!(await store.list()).includes(characterCard.cardId), '同卡自引用的卡删后离开列表')

  // 8. 被别的卡挂载照删；引用方保留引用模块（来源缺失由界面呈现）
  const referrer = await (await post({ op: 'create', kind: 'WORLD', name: '守卫引用方' })).json()
  const mounted = await (await post({
    op: 'apply', cardId: referrer.cardId, targetId: referrer.cardId,
    command: { kind: 'add_module_ref', name: '引用甲', sourceCardId: 'card-r', sourceModuleId: 'm-a' },
  })).json()
  check(mounted.ok === true, '建跨卡引用模块')
  const deletedWhileMounted = await post({ op: 'delete', cardId: 'card-r' })
  check(deletedWhileMounted.status === 200, `被外部挂载的卡照删（实际 ${String(deletedWhileMounted.status)}）`)
  check(!(await store.list()).includes('card-r'), '被挂载的卡删后离开列表')
  const referrerAfter = await store.open(referrer.cardId)
  check(referrerAfter?.document.modules.some(module => module.widget?.type === 'ref') === true, '引用方的引用模块仍在（来源缺失由界面显示）')
  check((await post({ op: 'delete', cardId: referrer.cardId })).status === 200, '引用方自身可删')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (process.env.KEEP) console.error(`KEPT: ${root}`)
  else rmSync(root, { recursive: true, force: true })
}
