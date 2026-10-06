/**
 * 往返对账自测（对齐手机版 CardRoundTripReconciliationTest 的基线）：
 * 建卡（bulk）→ 世界内角色 → 图片资源（封面）→ 导出 → 导入（草稿→提交）→
 * 再导出，除编号外必须逐项一致；载荷按 SHA-256 对账。另测：结构校验拒绝
 * 重复编号、抽屉式并发写（不同模块互不干扰、同块过期拒绝）、SillyTavern PNG 导入整体原文进自由文本模块。
 *
 * Run: node tests/round-trip.mjs（或 pnpm test）
 * @module noven-cards/tests/round-trip
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { validateCard } from '../lib/model.js'
import { BindingStore } from '../lib/bindings.js'
import { CardStore, DraftConflict, EditConflict } from '../lib/store.js'
import { registerCardTools } from '../lib/tools.js'
import { buildBulkModules, parseBulkTree } from '../lib/bulk.js'
import { exportCard, importExchange, importForeignFile } from '../lib/exchange.js'
import { applyAndCommit, applyEdit } from '../lib/editor.js'
import { setAiTrust } from '../lib/trust.js'

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

const deflateInflate = raw => new Uint8Array(inflateRawSync(raw))

const root = mkdtempSync(join(tmpdir(), 'noven-cards-roundtrip-'))
const refRoot = mkdtempSync(join(tmpdir(), 'noven-cards-ref-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

try {
  const store = new CardStore(root)

  // 1. bulk 建卡（载荷随卡一次性落库——卡还不存在时 receivePayload 会误报"不存在"）
  const nodes = parseBulkTree(JSON.stringify([
    { name: '主线', text: '大江东去，浪淘尽。', routing: 'default' },
    { name: '人物库', text: '将军与说书人。', routing: 'standby', temporality: 'snapshot' },
    { name: '年表', children: [{ name: '第一纪', text: '起于大雪。' }] },
  ]), 'modules')
  let createdModuleIds = []
  let createdBlockIds = []
  const saved = await store.create('测试世界', 'AI', async receive => {
    const built = await buildBulkModules(nodes, text => receive(new TextEncoder().encode(text)))
    createdModuleIds = built.createdModuleIds
    createdBlockIds = built.createdBlockIds
    return {
      id: 'card-a', kind: 'WORLD', name: '测试世界', modules: built.modules, resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
    }
  })
  check(createdModuleIds.length === 4 && createdBlockIds.length === 3, `bulk 编号直链（模块 ${String(createdModuleIds.length)}、块 ${String(createdBlockIds.length)}）`)
  check(saved.revision === 1 && saved.version === 'v2', `建卡落库（r${String(saved.revision)} ${saved.version}）`)

  // 1b. create 回调失败时目录必须清掉——不落半个目录
  let staged = null
  try {
    await store.create('废卡', 'AI', async receive => {
      await receive(new TextEncoder().encode('孤儿载荷'))
      throw new Error('校验失败')
    })
  } catch (error) {
    staged = error.message === '校验失败'
  }
  check(staged === true, 'create 失败抛出回调错误')
  check(!(await store.list()).some(id => id !== 'card-a'), 'create 失败不留目录')

  // 2. 世界内角色 + 图片（封面）
  const edit1 = await applyEdit(store, 'card-a', 'card-a', { kind: 'add_character', name: '说书人' }, 'AI')
  const characterId = edit1.createdModuleIds[0]
  const committed1 = await store.commit('card-a', edit1.draft.version)
  check(characterId !== undefined && committed1.revision === 2, `世界内角色（${String(characterId)}）`)
  const png1x1 = makePng()
  const edit2 = await applyEdit(store, 'card-a', 'card-a', { kind: 'adopt_image', bytes: png1x1, mediaType: 'image/png', moduleId: null }, 'AI')
  const committed2 = await store.commit('card-a', edit2.draft.version)
  const resourceId = (await store.open('card-a')).document.resources[0].id
  const edit3 = await applyEdit(store, 'card-a', 'card-a', { kind: 'appearance', resourceId, cover: true }, 'AI')
  const committed3 = await store.commit('card-a', edit3.draft.version)
  check(committed3.revision === 4, `图片资源 + 封面（r${String(committed3.revision)}）`)

  // 4. 重复编号被校验拒绝
  const broken = JSON.parse(JSON.stringify(saved.document))
  broken.modules[1].id = broken.modules[0].id
  check(validateCard(broken).length > 0, '结构校验拒绝重复编号')

  // 5. 导出 → 导入 → 再导出，往返一致
  const zipPath = join(root, 'export1.novex.zip')
  const exported = await exportCard(store, 'card-a', zipPath)
  const imported = await importExchange(store, new Uint8Array(readFileSync(zipPath)))
  check(imported.cardId !== 'card-a', `导入编号重新分配（${imported.cardId.slice(0, 13)}…）`)
  const committedImport = await store.commit(imported.cardId, imported.version)
  const zipPath2 = join(root, 'export2.novex.zip')
  const exported2 = await exportCard(store, imported.cardId, zipPath2)
  const structure1 = stripIds(JSON.parse(new TextDecoder().decode(readZipEntry(zipPath, 'structure.json'))).card)
  const structure2 = stripIds(JSON.parse(new TextDecoder().decode(readZipEntry(zipPath2, 'structure.json'))).card)
  check(JSON.stringify(structure1) === JSON.stringify(structure2), '往返结构逐项一致（编号除外）')
  const sha1 = Object.values(exported.sha256).sort()
  const sha2 = Object.values(exported2.sha256).sort()
  check(JSON.stringify(sha1) === JSON.stringify(sha2), `载荷 SHA-256 对账（${String(sha1.length)} 条）`)
  check(committedImport.document.internalCharacters.length === 1, '世界内角色递归完整保留')

  // 6. 抽屉式并发：不同模块同时写互不丢更新；同一文字块读后被改才拒绝
  const before6 = await store.open('card-a')
  const [m0, m1] = before6.document.modules
  const textOf = async mod => new TextDecoder().decode(await store.readPayload('card-a', mod.blocks[0].content))
  const concurrent = await Promise.all([
    applyAndCommit(store, 'card-a', 'card-a', { kind: 'write_text', moduleId: m0.id, blockId: m0.blocks[0].id, moduleName: m0.name, text: '并发写 A' }, 'HUMAN'),
    applyAndCommit(store, 'card-a', 'card-a', { kind: 'write_text', moduleId: m1.id, blockId: m1.blocks[0].id, moduleName: m1.name, text: '并发写 B' }, 'AI'),
    applyAndCommit(store, 'card-a', 'card-a', { kind: 'add_module', name: '并发新增' }, 'AI'),
  ])
  const after6 = await store.open('card-a')
  check(concurrent.length === 3 && after6.revision === before6.revision + 3, `三路并发写全部提交（r${String(before6.revision)}→r${String(after6.revision)}）`)
  check(await textOf(after6.document.modules[0]) === '并发写 A' && await textOf(after6.document.modules[1]) === '并发写 B'
    && after6.document.modules.some(mod => mod.name === '并发新增'), '不同模块的并发写互不丢更新')

  const staleRef = before6.document.modules[0].blocks[0].content
  let blockConflict = null
  try {
    await applyAndCommit(store, 'card-a', 'card-a', { kind: 'write_text', moduleId: m0.id, blockId: m0.blocks[0].id, moduleName: m0.name, text: '过期覆盖', expectedContent: staleRef }, 'HUMAN')
  } catch (error) {
    blockConflict = error
  }
  check(blockConflict instanceof EditConflict && blockConflict.moduleId === m0.id && blockConflict.blockId === m0.blocks[0].id, '同一文字块读后被改：只拦这一块（EditConflict 带模块/块编号）')
  check(await textOf((await store.open('card-a')).document.modules[0]) === '并发写 A', '被拒的写入没有落盘')
  let otherModuleOk = true
  try {
    await applyAndCommit(store, 'card-a', 'card-a', { kind: 'write_text', moduleId: m1.id, blockId: m1.blocks[0].id, moduleName: m1.name, text: '带期望的写', expectedContent: (await store.open('card-a')).document.modules[1].blocks[0].content }, 'HUMAN')
  } catch {
    otherModuleOk = false
  }
  check(otherModuleOk, '期望与现状一致的块级写入通过')

  // 6b. 显式确认某一版（导入确认）仍是严格的
  const shell6 = await store.ensureDraft('card-a', 'AI')
  let staleCommit = false
  try {
    await store.commit('card-a', 'v0')
  } catch (error) {
    staleCommit = error instanceof DraftConflict
  }
  check(staleCommit, '显式传入过期版本的 commit 仍被拒绝')
  await store.discardDraft('card-a')
  void shell6

  // 7. SillyTavern PNG：整体原文进自由文本模块
  const charaJson = JSON.stringify({ name: ' tavern 角色 ', description: '原文不拆字段' })
  const pngPath = join(root, 'tavern.png')
  writeFileSync(pngPath, makePngWithText('chara', Buffer.from(charaJson).toString('base64')))
  const foreign = await importForeignFile(store, new Uint8Array(readFileSync(pngPath)), 'tavern.png')
  const draft = await store.draft(foreign.cardId)
  check(draft.document.modules.length === 1 && draft.document.modules[0].name === '原文', 'PNG 卡整体原文进自由文本模块')

  // 8. 产出即管理对象：写卡工具保存成功后把根卡登记为会话 managed
  const registered = new Map()
  registerCardTools({ tools: { register: def => { registered.set(def.name, def) } } })
  const exec = { agent: { session: { id: 'sess-1', header: { cwd: root } } } }
  const created = await registered.get('create_card').execute({ kind: 'WORLD', name: '绑定世界' }, exec)
  const bindings = new BindingStore(root)
  const bound1 = (await bindings.all())['sess-1']
  check(bound1?.managed?.cardId === created.root_id && bound1.managed.permission === 'free',
    `建卡即绑定 managed（${created.root_id.slice(0, 13)}…）`)

  // 同卡续写保留既有权限档
  await bindings.set('sess-1', { ...bound1, managed: { cardId: created.root_id, permission: 'approve' } })
  await registered.get('rename_card').execute(
    { root_id: created.root_id, target_id: created.root_id, draft_version: created.next_draft_version, name: '改名世界' }, exec)
  const bound2 = (await bindings.all())['sess-1']
  check(bound2?.managed?.cardId === created.root_id && bound2.managed.permission === 'approve', '同卡续写保留 approve 权限')

  // 新产出卡接管管理对象
  const second = await registered.get('create_card').execute({ kind: 'CHARACTER', name: '新角色' }, exec)
  const bound3 = (await bindings.all())['sess-1']
  check(bound3?.managed?.cardId === second.root_id && bound3.managed.permission === 'free', '新产出卡接管 managed')

  // 9. 宏通道建卡 + 结果对模型可见（render 必须回结构化 JSON，不是 'done'）
  const bulkTool = registered.get('create_card_bulk')
  const bulkSaved = await bulkTool.execute({
    kind: 'WORLD', name: '宏建世界',
    modules_json: JSON.stringify([
      { name: '总览', text: '一览', routing: 'per_turn' },
      { name: '章节', children: [{ name: '序章', text: '开场' }] },
    ]),
  }, exec)
  check(bulkSaved.next_draft_version === 'v2' && bulkSaved.created_module_ids.length === 3, `create_card_bulk 直回 next_draft_version（${bulkSaved.next_draft_version}）`)
  const rendered = bulkTool.output.render({}, bulkSaved)
  check(rendered[0].type === 'text' && JSON.parse(rendered[0].text).next_draft_version === 'v2', '写结果对模型可见（render 回 JSON）')

  // 10. read_card 回结构 + 当前版本 + 卡目录
  const read = await registered.get('read_card').execute({ root_id: bulkSaved.root_id, target_id: bulkSaved.root_id }, exec)
  check(read.draft_version === 'v2' && read.card.modules.length === 2 && typeof read.card_dir === 'string', 'read_card 回结构/版本/目录')
  const moduleId = read.card.modules[0].id
  check(read.card.modules[0].routing === 'PER_TURN', 'bulk 携带的 routing 生效')

  // 11. 版本接力不靠猜：上一次写的 next_draft_version 直接喂下一次写
  //     （本段断言直接提交链路，先把这张卡的信任档切到 auto；提案语义在 proposals.mjs）
  await setAiTrust(root, bulkSaved.root_id, 'auto')
  const added = await registered.get('add_module_bulk').execute({
    root_id: bulkSaved.root_id, target_id: bulkSaved.root_id, draft_version: read.draft_version,
    module_json: JSON.stringify({ name: '附录', text: '补遗' }),
  }, exec)
  check(added.status === 'saved' && typeof added.next_draft_version === 'string', `add_module_bulk 接力成功（${added.next_draft_version}）`)
  const noVersion = await registered.get('add_module_bulk').execute({
    root_id: bulkSaved.root_id, target_id: bulkSaved.root_id,
    module_json: JSON.stringify({ name: '免版本号', text: '不传 draft_version 也能写' }),
  }, exec)
  check(noVersion.status === 'saved', '写工具省略 draft_version 直接成功')
  const read2 = await registered.get('read_card').execute({ root_id: bulkSaved.root_id, target_id: bulkSaved.root_id }, exec)
  check(read2.draft_version === noVersion.next_draft_version && read2.card.modules.length === 4, '版本号照常回报，卡内模块数一致')

  // 12. 挂载引用卡：读得到结构/正文/目录，写也直接通（跨项目就是普通写）
  const refStore = new CardStore(refRoot)
  await refStore.create('远端世界', 'AI', async receive => {
    const ref1 = await receive(new TextEncoder().encode('远方正文'))
    return {
      id: 'ref-card-1', kind: 'WORLD', name: '远端世界', resources: [], internalCharacters: [], extensions: {},
      appearance: { readingLayout: 'PAGED' },
      modules: [{ id: 'm1', name: '远方', tags: [], children: [], layout: 'VERTICAL', characterIds: [], blocks: [{ kind: 'text', id: 'b1', content: ref1 }] }],
    }
  })
  await bindings.set('sess-1', { ...bound3, refs: [{ root: refRoot, cardId: 'ref-card-1' }] })
  const refRead = await registered.get('read_card').execute({ root_id: 'ref-card-1', target_id: 'ref-card-1' }, exec)
  check(refRead.reference === true && refRead.card.name === '远端世界' && refRead.card_dir.includes(refRoot) && refRead.project_root === refRoot,
    'read_card 打开引用卡（reference + project_root + card_dir）')
  const refBlock = await registered.get('read_text_block').execute({
    root_id: 'ref-card-1', target_id: 'ref-card-1', draft_version: refRead.draft_version, module_id: 'm1', block_id: 'b1',
  }, exec)
  check(refBlock.text === '远方正文', 'read_text_block 读引用卡正文')
  await setAiTrust(refRoot, 'ref-card-1', 'auto')
  const remoteWrite = await registered.get('rename_card').execute({
    root_id: 'ref-card-1', target_id: 'ref-card-1', draft_version: refRead.draft_version, name: '远端世界改名',
  }, exec)
  check(remoteWrite.status === 'saved' && remoteWrite.project_root === refRoot, '跨项目写挂载卡直接生效（回执带来源项目）')
  const remoteHead = await refStore.open('ref-card-1')
  check(remoteHead?.document.name === '远端世界改名', '改名落进了来源项目的 card.json')

  // 13. move_card：整卡搬家到本项目——编号不变、引用自动摘除、变本地卡
  const moved = await registered.get('move_card').execute({ card_id: 'ref-card-1', to_project: 'this' }, exec)
  check(moved.status === 'moved' && moved.to === root, `move_card 搬入本项目（${moved.name}）`)
  const movedLocal = await new CardStore(root).open('ref-card-1')
  check(movedLocal?.document.name === '远端世界改名' && (await new CardStore(refRoot).open('ref-card-1')) === undefined, '搬家后目标项目持有卡、来源项目不再持有')
  const boundAfterMove = (await bindings.all())['sess-1']
  check(!(boundAfterMove?.refs ?? []).some(ref => ref.cardId === 'ref-card-1'), '搬入本项目后引用自动摘除')

  // 14. 死挂载自愈：managed 指向被删的卡 → 解析绑定时自动摘除（Finder 删卡不走软件）
  const deadStore = new CardStore(root)
  await deadStore.create('将删的卡', 'AI', async () => ({
    id: 'dead-card', kind: 'WORLD', name: '将删的卡', modules: [], resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
  }))
  await bindings.set('sess-1', { ...boundAfterMove, managed: { cardId: 'dead-card', permission: 'free' } })
  rmSync(join(root, '卡', '将删的卡'), { recursive: true, force: true })
  check(await bindings.pruneDeadLocalMounts('sess-1'), '死挂载被识别')
  const afterPrune = (await bindings.all())['sess-1']
  check(afterPrune?.managed === undefined, '死挂载自动摘除（managed 已清）')

  // 15. list_projects：注册表枚举（真实注册表，校验字段形状）
  const projectRows = await registered.get('list_projects').execute({}, exec)
  check(Array.isArray(projectRows.projects) && projectRows.projects.every(p => typeof p.root === 'string' && typeof p.card_count === 'number'), 'list_projects 枚举注册表')

  // 15. 不存在的卡：报错指出去哪核对
  let missingMsg = ''
  try {
    await registered.get('read_card').execute({ root_id: 'no-such-card', target_id: 'no-such-card' }, exec)
  } catch (error) {
    missingMsg = error.message
  }
  check(missingMsg.includes('list_projects') && missingMsg.includes('list_cards'), '不存在卡的诊断指向核对入口')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (process.env.KEEP) console.error(`KEPT: ${root}`)
  else rmSync(root, { recursive: true, force: true })
  rmSync(refRoot, { recursive: true, force: true })
}

/** 去掉全部编号与引用，留纯结构与字节语义。 */
function stripIds(node) {
  if (Array.isArray(node)) return node.map(stripIds)
  if (node === null || typeof node !== 'object') return node
  const out = {}
  for (const [key, value] of Object.entries(node)) {
    if (['id', 'content', 'caption', 'resourceId', 'avatarResourceId', 'coverResourceId', 'characterIds', 'characters'].includes(key)) {
      out[key] = Array.isArray(value) ? value.map(() => '*') : value === undefined ? undefined : '*'
      continue
    }
    out[key] = stripIds(value)
  }
  return out
}

function readZipEntry(path, name) {
  // 复用产品 zip 读：避免测试里重复实现
  const bytes = new Uint8Array(readFileSync(path))
  const buffer = Buffer.from(bytes)
  let end = -1
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const entryName = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const method = buffer.readUInt16LE(offset + 10)
    if (entryName === name) {
      const lName = buffer.readUInt16LE(localOffset + 26)
      const lExtra = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + lName + lExtra
      const raw = buffer.subarray(start, start + compressedSize)
      return method === 8 ? deflateInflate(raw) : raw
    }
    offset += 46 + nameLength + extraLength + buffer.readUInt16LE(offset + 32)
  }
  throw new Error(`zip entry not found: ${name}`)
}


/** 最小合法 PNG（1x1 RGBA）。 */
function makePng() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6
  const idat = deflateRawSync(Buffer.from([0, 255, 0, 128, 255]))
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0)),
  ]))
}

function makePngWithText(keyword, text) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6
  const idat = deflateRawSync(Buffer.from([0, 255, 0, 128, 255]))
  const payload = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')])
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('tEXt', payload), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0)),
  ]))
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  let value = -1
  for (const byte of body) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  crc.writeUInt32BE((value ^ -1) >>> 0)
  return Buffer.concat([length, body, crc])
}
void deflateRawSync
