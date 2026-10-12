/**
 * 交换包（导入/导出），ported from the mobile ExchangeLab/CardFiles 语义：
 * 结构与载荷分离；宁可拒绝，不可静默丢弃；载荷逐条 size + sha256 校验；
 * 导入编号重新分配（防冲突，设计行为）；导入产生草稿，确认提交才归库。
 *
 * 非 Novex 文件：PNG 卡（SillyTavern chara/ccv3）与 UTF-8 纯文本整体原文
 * 进入自由文本模块，不强行拆字段。
 * @module noven-cards/exchange
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { mintId, flattenModules, type ContentDocument, type ContentModule, type ContentRef } from './model.ts'
import { CardStore } from './store.ts'
import { readZip, writeZip, type ZipEntry } from './zip.ts'

const EXPERIMENT = 'novex-content-exchange'
const SUPPORTED_VERSIONS = [1, 2] as const

interface ManifestEntry { path: string, size: number, sha256: string }
interface ExchangeStructure {
  experiment: string
  version: number
  card: Record<string, unknown>
  contents: Record<string, ManifestEntry>
}

/** 收集一张卡结构里引用到的全部 ContentRef（含世界内角色，递归）。 */
function collectRefs(card: ContentDocument, into: Set<string> = new Set()): Set<string> {
  for (const module of flattenModules(card.modules)) {
    for (const block of module.blocks) {
      if (block.kind === 'text') into.add(block.content)
      else if (block.caption !== undefined) into.add(block.caption)
    }
  }
  for (const resource of card.resources) into.add(resource.content)
  for (const value of Object.values(card.extensions)) into.add(value)
  for (const character of card.internalCharacters) collectRefs(character, into)
  return into
}

/** 载荷归类与文件名（v2：图片/ 正文/ 扩展/，四位序号 + 人可读标签）。 */
function payloadPath(kind: 'image' | 'text' | 'extension', index: number, label: string, ref: string, mediaType?: string): string {
  const folder = kind === 'image' ? '图片' : kind === 'text' ? '正文' : '扩展'
  const safe = label.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '_').slice(0, 100) || '未命名'
  const extension = kind === 'text' ? '.md'
    : kind === 'extension' ? '.bin'
      : `.${mediaType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'}`
  return `${folder}/${String(index).padStart(4, '0')}-${safe}${extension}`
}

/**
 * 导出一张已保存的卡为交换包。未提交草稿存在时拒绝（导出只认正式版本）。
 * @param store - 卡库。
 * @param cardId - 根卡 id。
 * @param outputPath - 目标 zip 路径（项目内相对或绝对）。
 * @returns 导出的清单摘要。
 */
export async function exportCard(store: CardStore, cardId: string, outputPath: string): Promise<{ path: string, entries: number, sha256: Record<string, string> }> {
  const built = await buildExportPackage(store, cardId)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, built.bytes)
  return { path: outputPath, entries: built.entries, sha256: built.sha256 }
}

/** 打包一张卡的交换包到内存 —— HTTP 导出与写盘导出共用同一份载荷。 */
export async function buildExportPackage(store: CardStore, cardId: string): Promise<{ bytes: Uint8Array, name: string, entries: number, sha256: Record<string, string> }> {
  if (await store.draft(cardId) !== undefined) throw new Error('卡上有未提交草稿；先提交（commit_import / 保存）再导出')
  const saved = await store.open(cardId)
  if (saved === undefined) throw new Error('卡不存在或已删除')
  const refs = [...collectRefs(saved.document)].sort()
  const entries: ZipEntry[] = [{ name: 'structure.json', data: new TextEncoder().encode(JSON.stringify({ experiment: EXPERIMENT, version: 2, card: saved.document, contents: {} }, null, 2)) }]
  void entries.pop()
  const contents: Record<string, ManifestEntry> = {}
  const sha256s: Record<string, string> = {}
  let imageIndex = 0, textIndex = 0, extensionIndex = 0
  const resourceMedia = new Map(saved.document.resources.map(resource => [resource.content, resource.mediaType]))
  const kindOf = (ref: string): 'image' | 'text' | 'extension' => {
    const media = resourceMedia.get(ref)
    return media !== undefined && media.startsWith('image/') ? 'image' : media !== undefined ? 'extension' : 'text'
  }
  const packageEntries: ZipEntry[] = []
  for (const ref of refs) {
    const bytes = await store.readPayload(cardId, ref)
    const kind = kindOf(ref)
    const index = kind === 'image' ? imageIndex++ : kind === 'text' ? textIndex++ : extensionIndex++
    const label = labelFor(saved.document, ref)
    const path = payloadPath(kind, index, label, ref, resourceMedia.get(ref))
    const sha256 = await store.payloadSha256(cardId, ref)
    contents[ref] = { path, size: bytes.length, sha256 }
    sha256s[ref] = sha256
    packageEntries.push({ name: path, data: bytes })
  }
  const structure: ExchangeStructure = { experiment: EXPERIMENT, version: 2, card: saved.document as unknown as Record<string, unknown>, contents }
  const all: ZipEntry[] = [
    { name: 'structure.json', data: new TextEncoder().encode(`${JSON.stringify(structure, null, 2)}\n`) },
    ...packageEntries,
  ]
  return { bytes: writeZip(all), name: saved.document.name, entries: refs.length, sha256: sha256s }
}

/** 给载荷起人可读名：优先引用它的模块名，兜底卡名。 */
function labelFor(card: ContentDocument, ref: string): string {
  const visit = (document: ContentDocument): string => {
    for (const module of flattenModules(document.modules)) {
      for (const block of module.blocks) {
        if ((block.kind === 'text' && block.content === ref) || (block.kind === 'image' && block.caption === ref)) {
          return module.name.length > 0 ? module.name : document.name
        }
      }
    }
    for (const resource of document.resources) {
      if (resource.content === ref) return document.name
    }
    for (const character of document.internalCharacters) {
      const found = visit(character)
      if (found !== document.name || character.name === found) return found
    }
    return document.name
  }
  return visit(card)
}

/** 严格解析卡结构：字段不完整或出现未支持字段直接报错（不静默丢弃）。 */
function parseCardStrict(raw: unknown, path: string): ContentDocument {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${path} 不是对象`)
  const allowed = new Set(['id', 'kind', 'name', 'modules', 'resources', 'internalCharacters', 'characters', 'extensions', 'appearance'])
  for (const key of Object.keys(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) throw new Error(`${path}.${key} 是未支持字段（不能静默丢弃）`)
  }
  const source = raw as Record<string, unknown>
  const kind = source.kind
  if (kind !== 'WORLD' && kind !== 'CHARACTER') throw new Error(`${path}.kind 必须是 WORLD 或 CHARACTER`)
  if (typeof source.id !== 'string' || source.id.length === 0) throw new Error(`${path}.id 不能为空`)
  if (typeof source.name !== 'string') throw new Error(`${path}.name 不能为空`)
  const card: ContentDocument = {
    id: source.id,
    kind,
    name: source.name,
    modules: parseModulesStrict(source.modules ?? [], `${path}.modules`),
    resources: (Array.isArray(source.resources) ? source.resources : []).map((entry, index) => {
      if (entry === null || typeof entry !== 'object') throw new Error(`${path}.resources[${String(index)}] 不是对象`)
      const resource = entry as Record<string, unknown>
      for (const key of Object.keys(resource)) {
        if (!['id', 'content', 'mediaType'].includes(key)) throw new Error(`${path}.resources[${String(index)}].${key} 是未支持字段`)
      }
      if (typeof resource.id !== 'string' || typeof resource.content !== 'string' || typeof resource.mediaType !== 'string') {
        throw new Error(`${path}.resources[${String(index)}] 字段不完整`)
      }
      return { id: resource.id, content: resource.content, mediaType: resource.mediaType }
    }),
    internalCharacters: (Array.isArray(source.characters) ? source.characters : Array.isArray(source.internalCharacters) ? source.internalCharacters : [])
      .map((entry, index) => parseCardStrict(entry, `${path}.characters[${String(index)}]`)),
    extensions: (() => {
      const extensions = source.extensions ?? {}
      if (extensions === null || typeof extensions !== 'object' || Array.isArray(extensions)) throw new Error(`${path}.extensions 不是对象`)
      const out: Record<string, string> = {}
      for (const [key, value] of Object.entries(extensions as Record<string, unknown>)) {
        if (typeof value !== 'string') throw new Error(`${path}.extensions.${key} 不是内容引用`)
        out[key] = value
      }
      return out
    })(),
    appearance: (() => {
      const appearance = source.appearance ?? {}
      if (appearance === null || typeof appearance !== 'object') throw new Error(`${path}.appearance 不是对象`)
      const value = appearance as Record<string, unknown>
      for (const key of Object.keys(value)) {
        if (!['avatar', 'cover', 'avatarResourceId', 'coverResourceId', 'readingLayout'].includes(key)) throw new Error(`${path}.appearance.${key} 是未支持字段`)
      }
      const readingLayout = value.readingLayout ?? 'PAGED'
      if (readingLayout !== 'PAGED' && readingLayout !== 'CONTINUOUS') throw new Error(`${path}.appearance.readingLayout 无效`)
      return {
        ...(typeof value.avatarResourceId === 'string' ? { avatarResourceId: value.avatarResourceId } : typeof value.avatar === 'string' ? { avatarResourceId: value.avatar } : {}),
        ...(typeof value.coverResourceId === 'string' ? { coverResourceId: value.coverResourceId } : typeof value.cover === 'string' ? { coverResourceId: value.cover } : {}),
        readingLayout,
      }
    })(),
  }
  return card
}

function parseModulesStrict(raw: unknown, path: string): ContentModule[] {
  if (!Array.isArray(raw)) throw new Error(`${path} 不是数组`)
  return raw.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') throw new Error(`${path}[${String(index)}] 不是对象`)
    const module = entry as Record<string, unknown>
    for (const key of Object.keys(module)) {
      if (!['id', 'name', 'blocks', 'tags', 'use', 'children', 'layout', 'characterIds', 'characters', 'routing', 'temporality', 'widget'].includes(key)) {
        throw new Error(`${path}[${String(index)}].${key} 是未支持字段`)
      }
    }
    if (typeof module.id !== 'string' || module.id.length === 0) throw new Error(`${path}[${String(index)}].id 不能为空`)
    if (typeof module.name !== 'string') throw new Error(`${path}[${String(index)}].name 不能为空`)
    const layout = module.layout ?? 'VERTICAL'
    if (layout !== 'VERTICAL' && layout !== 'HORIZONTAL') throw new Error(`${path}[${String(index)}].layout 无效`)
    const routing = module.routing
    if (routing !== undefined && routing !== 'DEFAULT' && routing !== 'PER_TURN' && routing !== 'STYLE' && routing !== 'STANDBY') throw new Error(`${path}[${String(index)}].routing 无效`)
    const temporality = module.temporality
    if (temporality !== undefined && temporality !== 'CONSTANT' && temporality !== 'SNAPSHOT') throw new Error(`${path}[${String(index)}].temporality 无效`)
    const widget = module.widget
    if (widget !== undefined) {
      if (widget === null || typeof widget !== 'object' || typeof (widget as Record<string, unknown>).type !== 'string') throw new Error(`${path}[${String(index)}].widget 无效`)
      const wh = (widget as Record<string, unknown>).height
      if (wh !== undefined && typeof wh !== 'number') throw new Error(`${path}[${String(index)}].widget.height 无效`)
    }
    const use = parseUseStrict(module.use, `${path}[${String(index)}].use`)
    const tags = Array.isArray(module.tags) ? module.tags : []
    if (tags.some(tag => typeof tag !== 'string' || tag.length === 0)) throw new Error(`${path}[${String(index)}].tags 无效`)
    return {
      id: module.id,
      name: module.name,
      blocks: (Array.isArray(module.blocks) ? module.blocks : []).map((block, blockIndex) => {
        if (block === null || typeof block !== 'object') throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}] 不是对象`)
        const value = block as Record<string, unknown>
        for (const key of Object.keys(value)) {
          if (!['kind', 'id', 'content', 'resource', 'resourceId', 'caption'].includes(key)) throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}].${key} 是未支持字段`)
        }
        if (typeof value.id !== 'string' || value.id.length === 0) throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}].id 不能为空`)
        if (value.kind === 'text') {
          if (typeof value.content !== 'string') throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}].content 不能为空`)
          return { kind: 'text', id: value.id, content: value.content }
        }
        if (value.kind === 'image') {
          const resourceId = typeof value.resourceId === 'string' ? value.resourceId : value.resource
          if (typeof resourceId !== 'string') throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}].resource 不能为空`)
          const caption = typeof value.caption === 'string' ? value.caption : undefined
          return { kind: 'image', id: value.id, resourceId, ...(caption !== undefined ? { caption } : {}) }
        }
        throw new Error(`${path}[${String(index)}].blocks[${String(blockIndex)}].kind 无效`)
      }),
      tags: tags as string[],
      ...(use !== undefined ? { use } : {}),
      children: parseModulesStrict(module.children ?? [], `${path}[${String(index)}].children`),
      layout,
      characterIds: Array.isArray(module.characters)
        ? module.characters as string[]
        : Array.isArray(module.characterIds) ? module.characterIds as string[] : [],
      ...(routing !== undefined ? { routing } : {}),
      ...(temporality !== undefined ? { temporality } : {}),
      ...(widget !== undefined ? { widget: widget as ContentModule['widget'] & object } : {}),
    }
  })
}

function parseUseStrict(raw: unknown, path: string): ContentDocument['modules'][number]['use'] {
  if (raw === undefined || raw === null) return undefined
  if (raw === null || typeof raw !== 'object') throw new Error(`${path} 不是对象`)
  const use = raw as Record<string, unknown>
  if (use.kind === 'always' || use.kind === 'manual') return { kind: use.kind }
  if (use.kind === 'keywords') {
    if (!Array.isArray(use.words) || use.words.some(word => typeof word !== 'string')) throw new Error(`${path}.words 无效`)
    return { kind: 'keywords', words: use.words as string[], caseSensitive: use.caseSensitive === true, requireAll: use.requireAll === true }
  }
  throw new Error(`${path}.kind 无效`)
}

/**
 * 导入交换包：先校验清单（size + sha256 + 恰好等于结构引用集合），再转存
 * 载荷、重新分配全部编号，产出 IMPORT 草稿（用户确认后 commit）。
 * @param store - 卡库。
 * @param bytes - zip 字节。
 * @returns 草稿（card_id + version）。
 */
export async function importExchange(store: CardStore, bytes: Uint8Array): Promise<{ cardId: string, version: string, name: string, kind: string }> {
  const entries = readZip(bytes)
  const structureEntry = entries.get('structure.json')
  if (structureEntry === undefined) throw new Error('包内缺少 structure.json')
  const structure = JSON.parse(new TextDecoder().decode(structureEntry)) as Partial<ExchangeStructure>
  if (structure.experiment !== EXPERIMENT) throw new Error('不是诺文交换包')
  if (structure.version !== undefined && !SUPPORTED_VERSIONS.includes(structure.version as 1 | 2)) throw new Error(`交换包版本不支持：${String(structure.version)}`)
  if (structure.card === undefined || structure.contents === undefined) throw new Error('交换包结构不完整')
  const manifest: Record<string, { path: string, size: number, sha256: string }> = structure.contents
  const card = parseCardStrict(structure.card, 'card')
  // manifest: keys must exactly equal referenced refs; entries must exist with matching size + sha256
  const refs = collectRefs(card)
  const manifestKeys = new Set(Object.keys(structure.contents))
  for (const ref of refs) {
    if (!manifestKeys.has(ref)) throw new Error(`清单缺少结构引用的载荷：${ref}`)
  }
  for (const key of manifestKeys) {
    if (!refs.has(key)) throw new Error(`清单包含结构未引用的载荷：${key}`)
  }
  const { createHash } = await import('node:crypto')
  for (const [ref, entry] of Object.entries(manifest)) {
    if (entry === null || typeof entry !== 'object' || typeof entry.path !== 'string' || typeof entry.size !== 'number' || typeof entry.sha256 !== 'string') {
      throw new Error(`清单条目不完整：${ref}`)
    }
  }
  const knownPaths = new Set(Object.values(manifest).map(entry => entry.path))
  for (const name of entries.keys()) {
    if (name !== 'structure.json' && !knownPaths.has(name)) throw new Error(`包内存在清单之外的条目：${name}`)
  }
  // verify + transfer payloads, remap refs
  const refMap = new Map<string, string>()
  const cardId = mintId()
  // 先落一个壳草稿把卡目录建出来——载荷要进它的 contents/；随后整卡覆盖。
  const shell = await store.ensureDraft(cardId, 'IMPORT', {
    kind: card.kind,
    name: card.name,
    document: { ...card, id: cardId, modules: [], resources: [], internalCharacters: [], extensions: {} },
  })
  for (const ref of refs) {
    const entry = manifest[ref]
    if (entry === undefined) throw new Error(`清单缺少结构引用的载荷：${ref}`)
    const data = entries.get(entry.path)
    if (data === undefined) throw new Error(`包内缺少清单登记的载荷：${entry.path}`)
    if (data.length !== entry.size) throw new Error(`载荷大小不匹配：${entry.path}`)
    const sha256 = createHash('sha256').update(data).digest('hex')
    if (sha256 !== entry.sha256) throw new Error(`载荷校验失败：${entry.path}`)
    refMap.set(ref, await store.receivePayload(cardId, data))
  }
  const remapped = remapAllIds(card, cardId, refMap)
  const draft = await store.updateDraft(cardId, shell.version, remapped, 'IMPORT')
  return { cardId, version: draft.version, name: remapped.name, kind: remapped.kind }
}

/** 导入语义：对象编号与内容引用全部重新分配（防冲突，设计行为）。 */
function remapAllIds(card: ContentDocument, freshCardId: string, refMap: Map<string, string>): ContentDocument {
  const idMap = new Map<string, string>()
  const fresh = (old: string): string => {
    const mapped = idMap.get(old) ?? mintId()
    idMap.set(old, mapped)
    return mapped
  }
  const ref = (old: ContentRef): ContentRef => refMap.get(old) ?? old
  const walkModules = (modules: ContentModule[]): ContentModule[] => modules.map(original => ({
    ...original,
    id: fresh(original.id),
    blocks: original.blocks.map(block => block.kind === 'text'
      ? { ...block, id: fresh(block.id), content: ref(block.content) }
      : { ...block, id: fresh(block.id), resourceId: fresh(block.resourceId), ...(block.caption !== undefined ? { caption: ref(block.caption) } : {}) }),
    characterIds: original.characterIds.map(id => idMap.get(id) ?? id),
    children: walkModules(original.children),
  }))
  return {
    ...card,
    id: freshCardId,
    modules: walkModules(card.modules),
    resources: card.resources.map(resource => ({ ...resource, id: fresh(resource.id), content: ref(resource.content) })),
    extensions: Object.fromEntries(Object.entries(card.extensions).map(([key, value]) => [key, ref(value)])),
    appearance: {
      readingLayout: card.appearance.readingLayout,
      ...(card.appearance.avatarResourceId !== undefined ? { avatarResourceId: idMap.get(card.appearance.avatarResourceId) ?? card.appearance.avatarResourceId } : {}),
      ...(card.appearance.coverResourceId !== undefined ? { coverResourceId: idMap.get(card.appearance.coverResourceId) ?? card.appearance.coverResourceId } : {}),
    },
    internalCharacters: card.internalCharacters.map((character, index) => remapAllIds(character, fresh(`${card.id}:c${String(index)}`), refMap)),
  }
}

/**
 * 导入非 Novex 文件：PNG 卡（chara/ccv3 原文）或 UTF-8 纯文本——整体原文进
 * 自由文本模块，不强行拆字段。
 * @param store - 卡库。
 * @param bytes - 文件字节。
 * @param fileName - 原文件名（命名与卡类默认值用）。
 */
export async function importForeignFile(store: CardStore, bytes: Uint8Array, fileName: string): Promise<{ cardId: string, version: string, name: string, kind: string }> {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  let rawText: string | undefined
  if (isPng) {
    rawText = extractPngCardText(bytes)
    if (rawText === undefined) throw new Error('PNG 内没有卡数据（缺少 chara/ccv3 文本块）')
  }
  else {
    rawText = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  // 卡名优先取数据里的名字（chara JSON 的 data.name/name），文件名只是兜底。
  let name = fileName.replace(/\.[^.]+$/u, '') || '导入卡'
  try {
    const parsed = JSON.parse(rawText) as { name?: unknown, data?: { name?: unknown } }
    const inner = parsed.data?.name ?? parsed.name
    if (typeof inner === 'string' && inner.trim().length > 0) name = inner
  } catch { /* 原文不是 JSON——用文件名 */ }
  const cardId = mintId()
  const draft = await store.ensureDraft(cardId, 'IMPORT', {
    kind: 'CHARACTER',
    name,
    document: {
      id: cardId,
      kind: 'CHARACTER',
      name,
      modules: [],
      resources: [],
      internalCharacters: [],
      extensions: {},
      appearance: { readingLayout: 'PAGED' },
    },
  })
  const textRef = await store.receivePayload(cardId, new TextEncoder().encode(rawText))
  const module: ContentModule = {
    id: mintId(),
    name: '原文',
    blocks: [{ kind: 'text', id: mintId(), content: textRef }],
    tags: [],
    children: [],
    layout: 'VERTICAL',
    characterIds: [],
  }
  const updated = await store.updateDraft(cardId, draft.version, { ...draft.document, modules: [module] }, 'IMPORT')
  return { cardId, version: updated.version, name, kind: 'CHARACTER' }
}

/** 从 PNG 的 tEXt/zTXt 块里找 SillyTavern 卡数据（base64 JSON 原文）。 */
export function extractPngCardText(bytes: Uint8Array): string | undefined {
  const buffer = Buffer.from(bytes)
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IEND') break
    if (type === 'tEXt' || type === 'zTXt') {
      const zero = data.indexOf(0)
      if (zero > 0) {
        const keyword = data.toString('latin1', 0, zero)
        if (keyword === 'chara' || keyword === 'ccv3') {
          const payload = type === 'tEXt' ? data.subarray(zero + 1) : new Uint8Array(inflateRawSync(data.subarray(zero + 2)))
          const text = payload.toString('latin1')
          try {
            return Buffer.from(text, 'base64').toString('utf8')
          } catch {
            return text
          }
        }
      }
    }
    offset += 12 + length
  }
  return undefined
}

/** 便捷：项目内路径读字节。 */
export async function readProjectFile(projectRoot: string, relative: string): Promise<Uint8Array> {
  const resolved = join(projectRoot, relative)
  if (!resolved.startsWith(projectRoot)) throw new Error('路径越出项目')
  return new Uint8Array(await readFile(resolved))
}
