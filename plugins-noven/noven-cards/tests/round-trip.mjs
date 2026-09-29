/**
 * 往返对账自测（对齐手机版 CardRoundTripReconciliationTest 的基线）：
 * 建卡（bulk）→ 世界内角色 → 图片资源（封面）→ 导出 → 导入（草稿→提交）→
 * 再导出，除编号外必须逐项一致；载荷按 SHA-256 对账。另测：结构校验拒绝
 * 重复编号、版本冲突拒绝、SillyTavern PNG 导入整体原文进自由文本模块。
 *
 * Run: node tests/round-trip.mjs（或 pnpm test）
 * @module noven-cards/tests/round-trip
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { validateCard } from '../lib/model.js'
import { CardStore, DraftConflict } from '../lib/store.js'
import { buildBulkModules, parseBulkTree } from '../lib/bulk.js'
import { exportCard, importExchange, importForeignFile } from '../lib/exchange.js'
import { applyEdit } from '../lib/editor.js'

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

const deflateInflate = raw => new Uint8Array(inflateRawSync(raw))

const root = mkdtempSync(join(tmpdir(), 'noven-cards-roundtrip-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

try {
  const store = new CardStore(root)

  // 1. bulk 建卡
  const nodes = parseBulkTree(JSON.stringify([
    { name: '主线', text: '大江东去，浪淘尽。', routing: 'default' },
    { name: '人物库', text: '将军与说书人。', routing: 'standby', temporality: 'snapshot' },
    { name: '年表', children: [{ name: '第一纪', text: '起于大雪。' }] },
  ]), 'modules')
  const { modules, createdModuleIds, createdBlockIds } = await buildBulkModules(nodes, text => store.receivePayload('card-a', new TextEncoder().encode(text)))
  const world = {
    id: 'card-a', kind: 'WORLD', name: '测试世界', modules, resources: [], internalCharacters: [], extensions: {},
    appearance: { readingLayout: 'PAGED' },
  }
  check(validateCard(world).length === 0, 'bulk 建卡结构合法')
  check(createdModuleIds.length === 4 && createdBlockIds.length === 3, `bulk 编号直链（模块 ${String(createdModuleIds.length)}、块 ${String(createdBlockIds.length)}）`)
  const saved = await store.saveNew(world, 'AI')
  check(saved.revision === 1 && saved.version === 'v2', `建卡落库（r${String(saved.revision)} ${saved.version}）`)

  // 2. 世界内角色 + 图片（封面）
  const edit1 = await applyEdit(store, 'card-a', 'card-a', 'v2', { kind: 'add_character', name: '说书人' }, 'AI')
  const characterId = edit1.createdModuleIds[0]
  const committed1 = await store.commit('card-a', edit1.draft.version)
  check(characterId !== undefined && committed1.revision === 2, `世界内角色（${String(characterId)}）`)
  const png1x1 = makePng()
  const edit2 = await applyEdit(store, 'card-a', 'card-a', committed1.version, { kind: 'adopt_image', bytes: png1x1, mediaType: 'image/png', moduleId: null }, 'AI')
  const committed2 = await store.commit('card-a', edit2.draft.version)
  const resourceId = (await store.open('card-a')).document.resources[0].id
  const edit3 = await applyEdit(store, 'card-a', 'card-a', committed2.version, { kind: 'appearance', resourceId, cover: true }, 'AI')
  const committed3 = await store.commit('card-a', edit3.draft.version)
  check(committed3.revision === 4, `图片资源 + 封面（r${String(committed3.revision)}）`)

  // 4. 重复编号被校验拒绝
  const broken = JSON.parse(JSON.stringify(world))
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

  // 6. 版本冲突必须拒绝
  let conflicted = false
  try {
    await applyEdit(store, 'card-a', 'card-a', 'v2', { kind: 'rename_card', name: '旧版本改名' }, 'AI')
  } catch (error) {
    conflicted = error instanceof DraftConflict
  }
  check(conflicted, '过期 draft_version 被拒绝（乐观锁）')

  // 7. SillyTavern PNG：整体原文进自由文本模块
  const charaJson = JSON.stringify({ name: ' tavern 角色 ', description: '原文不拆字段' })
  const pngPath = join(root, 'tavern.png')
  writeFileSync(pngPath, makePngWithText('chara', Buffer.from(charaJson).toString('base64')))
  const foreign = await importForeignFile(store, new Uint8Array(readFileSync(pngPath)), 'tavern.png')
  const draft = await store.draft(foreign.cardId)
  check(draft.document.modules.length === 1 && draft.document.modules[0].name === '原文', 'PNG 卡整体原文进自由文本模块')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  if (process.env.KEEP) console.error(`KEPT: ${root}`)
  else rmSync(root, { recursive: true, force: true })
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
