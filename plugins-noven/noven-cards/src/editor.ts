/**
 * 共同编辑入口，ported from the mobile CardEditor + CardComposition：人工与
 * AI 的每一次编辑都变成 EditorCommand 走这里——同一套变换、同一条按卡串行的写入链。
 * 一切编辑先落草稿；提交（commit）才成为正式修订。
 *
 * 与手机端的已声明简化：EditorPosition（UI 光标）不迁移——桌面端当前无卡
 * 片编辑界面；文件夹整理（organizeFolders）语义完整保留。
 * @module noven-cards/editor
 */

import { mintId, flattenModules, editBlocks, findTarget, replaceTarget, insertModule, updateModule, removeModule, parentOfModule, placeModule, organizeFolders, assertValid, IMAGE_MEDIA, type ContentBlock, type ContentDocument, type ContentModule, type ModuleLayout, type ModuleRouting, type ModuleTemporality, type ModuleUse } from './model.ts'
import { CardStore, EditConflict, type CardDraft, type ChangeSource, type SavedCard } from './store.ts'
import { parseModuleMarkdown } from './markdown.ts'
import { readProjectFile } from './exchange.ts'
import { expandShape, bboxOf as geomBBox, padBBox, clipPolygonRect, clipPolylineRect, toChild, type GBBox } from 'noven-fmg/mapgeom'
import { resolvePngHeightmap } from './heightmap-png.ts'
import { generateWorld, resampleWorld, rasterizeDraft, guessDraftLevel, getGridDims, type HeightmapInput } from 'noven-fmg/world'
import { decodeTimeline, encodeTimeline, decodeCollection, encodeCollection, decodeMap, encodeMap, decodeRelation, encodeRelation, decodeLayout, encodeLayout, calendarOf, mintId as mintPayloadId, type CollectionFieldType, type CollectionValue, type CollectionView, type LayoutData, type MapData, type TimelineCalendar } from './formats.ts'

/** 编辑命令全集（工具与未来的人工界面共用）。 */
export type EditorCommand =
  | { kind: 'add_module', name: string, parentId?: string | null, layout?: ModuleLayout, widget?: string }
  | { kind: 'rename_module', moduleId: string, name: string }
  | { kind: 'rename_card', name: string }
  | { kind: 'write_text', moduleId: string, blockId?: string | null, moduleName: string, text: string, expectedContent?: string }
  | { kind: 'replace_text_range', moduleId: string, blockId: string, expectedContent: string, start: number, end: number, text: string, moduleName?: string }
  | { kind: 'write_markdown', moduleId: string, name: string, text: string }
  | { kind: 'write_caption', moduleId: string, blockId: string, moduleName: string, text: string }
  | { kind: 'move_module', moduleId: string, beforeId?: string | null }
  | { kind: 'place_module', moduleId: string, parentId?: string | null, beforeId?: string | null }
  | { kind: 'copy_module', moduleId: string, parentId?: string | null, beforeId?: string | null }
  | { kind: 'merge_child', moduleId: string }
  | { kind: 'set_module_layout', moduleId: string, layout: ModuleLayout }
  | { kind: 'set_reading_layout', layout: 'PAGED' | 'CONTINUOUS' }
  | { kind: 'move_block', moduleId: string, blockId: string, beforeBlockId?: string | null }
  | { kind: 'remove_module', moduleId: string }
  | { kind: 'remove_block', moduleId: string, blockId: string }
  | { kind: 'module_options', moduleId: string, tags: string[], use: ModuleUse | undefined, routing?: ModuleRouting | null, temporality?: ModuleTemporality | null }
  | { kind: 'appearance', resourceId: string | null, cover: boolean }
  | { kind: 'insert_owned_image', moduleId: string, resourceId: string, afterBlockId?: string | null }
  | { kind: 'replace_block_image', moduleId: string, blockId: string, resourceId: string }
  | { kind: 'remove_resource', resourceId: string, removeUses: boolean }
  | { kind: 'adopt_image', bytes: Uint8Array, mediaType: string, moduleId?: string | null, afterBlockId?: string | null }
  /** 把项目内文件嵌入模块：图片收成卡资源 + 图片块；.html/.htm 记 widget.path 活引用；.md/.txt 快照成文字块。moduleId 省略时以文件名建一个新模块。 */
  | { kind: 'embed_file', path: string, moduleId?: string | null }
  | { kind: 'place_character', characterId: string, moduleId?: string | null }
  | { kind: 'add_character', name: string }
  | { kind: 'copy_character', source: ContentDocument }
  | { kind: 'remove_character', characterId: string }
  // ---------- 预制模块的结构化命令（契约 C2）：人、AI、提案共用 ----------
  | { kind: 'set_widget_data', moduleId: string, widget: 'timeline' | 'collection' | 'map' | 'relation', data: unknown }
  /** 从地图模块生一个局部视图子模块：裁取景框内的对象与草稿、重归一化、复用底图 + window 取景框，并记 parent 溯源。 */
  | { kind: 'map_spawn_view', moduleId: string, name?: string, objectId?: string, bbox?: readonly [number, number, number, number], aspect?: number }
  | { kind: 'timeline_set_calendar', moduleId: string, calendar: TimelineCalendar }
  | { kind: 'timeline_switch_view', moduleId: string, name: string }
  | { kind: 'timeline_add_event', moduleId: string, event: { id?: string, at: number | null, until?: number | null, ongoing?: boolean, title: string, description?: string, characters?: string[], color?: string } }
  | { kind: 'timeline_update_event', moduleId: string, id: string, patch: { at?: number | null, until?: number | null, ongoing?: boolean, title?: string, description?: string, characters?: string[], color?: string | null } }
  | { kind: 'timeline_move_event', moduleId: string, id: string, at: number | null, until?: number | null }
  | { kind: 'timeline_remove_event', moduleId: string, id: string }
  | { kind: 'timeline_add_era', moduleId: string, era: { id?: string, name: string, from: number | null, to: number | null, color: string, description?: string } }
  | { kind: 'timeline_update_era', moduleId: string, id: string, patch: { name?: string, from?: number | null, to?: number | null, color?: string, description?: string } }
  | { kind: 'timeline_remove_era', moduleId: string, id: string }
  | { kind: 'timeline_add_mark', moduleId: string, mark: { id?: string, at: number, label?: string } }
  | { kind: 'timeline_update_mark', moduleId: string, id: string, patch: { at?: number, label?: string } }
  | { kind: 'timeline_remove_mark', moduleId: string, id: string }
  | { kind: 'collection_add_field', moduleId: string, field: { id?: string, name: string, type?: CollectionFieldType } }
  | { kind: 'collection_update_field', moduleId: string, id: string, patch: { name?: string, type?: CollectionFieldType } }
  | { kind: 'collection_remove_field', moduleId: string, id: string }
  | { kind: 'collection_add_item', moduleId: string, item: { id?: string, name: string, summary?: string, description?: string }, values?: Record<string, CollectionValue> }
  | { kind: 'collection_update_item', moduleId: string, id: string, patch: { name?: string, summary?: string, description?: string, visualKey?: string | null } }
  | { kind: 'collection_remove_item', moduleId: string, id: string }
  | { kind: 'collection_set_value', moduleId: string, itemId: string, fieldId: string, value: CollectionValue }
  | { kind: 'collection_set_item_image', moduleId: string, itemId: string, resourceId?: string, bytes?: Uint8Array, mediaType?: string }
  | { kind: 'collection_set_style', moduleId: string, artStyle: string }
  | { kind: 'collection_set_view', moduleId: string, view: CollectionView }
  | { kind: 'set_layout', layoutKey: 'overview' | 'player', layout: unknown }

/** embed_file 认的文本类后缀 → mediaType：html 记 widget.path 活引用，md/txt 快照成文字块。 */
const EMBED_FILE_MEDIA: Record<string, string> = {
  html: 'text/html', htm: 'text/html', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain',
}

/** 语义色解析成高度：palette 显式 level 优先，否则按名字猜，最后兜底陆地。 */
const levelOfPalette = (data: MapData, color: string): number | undefined => {
  const p = data.palette.find(e => e.color === color)
  if (p !== undefined) return p.level ?? guessDraftLevel(p.name, p.desc) ?? 40
  return guessDraftLevel(color, '')
}

/** world.heightmap 解析成管线输入；kind:'draft' 时把当前草稿栅格化（意图层直通）。 */
export const resolveWorldHeightmap = (data: MapData): HeightmapInput | undefined => {
  const src = data.world
  if (src === undefined) return undefined
  if (src.heightmap.kind !== 'draft') return src.heightmap
  const cfg = { width: 1280, height: 800, points: 10000, ...(src.config ?? {}) } as { width: number, height: number, points: number }
  const dims = getGridDims(cfg.width, cfg.height, cfg.points)
  const baseLevel = data.base !== undefined ? (levelOfPalette(data, data.base.color) ?? 5) : 5
  const heights = rasterizeDraft(data.draft, {
    cellsX: dims.cellsX, cellsY: dims.cellsY,
    aspect: data.aspect ?? cfg.width / cfg.height,
    baseLevel,
    levelOf: color => levelOfPalette(data, color),
  })
  return { kind: 'heights', heights }
}

/** 一次编辑产生的新块/新模块（saved-with-ids 直链用）。 */
export interface EditOutcome {
  readonly draft: CardDraft
  readonly createdModuleIds: string[]
  readonly createdBlockIds: string[]
}

/**
 * 把一条编辑命令套用到这张卡**当前最新**的草稿上（整段读改写在卡的串行链里完成）。
 * 不需要读取时的版本号：编辑不同模块的人和 AI 互不干扰；只有命令自带的块级期望
 * （`replace_text_range.expectedContent`、`write_text.expectedContent`）不满足时才抛
 * {@link EditConflict}。调用方随后 commit。
 * @param store - 卡库。
 * @param cardId - 根卡 id。
 * @param targetId - 实际目标卡（自身或世界内角色）。
 * @param command - 编辑命令。
 * @param source - 编辑来源。
 */
export async function applyEdit(
  store: CardStore,
  cardId: string,
  targetId: string,
  command: EditorCommand,
  source: ChangeSource,
): Promise<EditOutcome> {
  return store.exclusive(cardId, () => applyEditLocked(store, cardId, targetId, command, source))
}

/**
 * {@link applyEdit} 加提交，两步在同一段串行链里完成——中间不会插进别人的写入。
 * @param store - 卡库。
 * @param cardId - 根卡 id。
 * @param targetId - 实际目标卡（自身或世界内角色）。
 * @param command - 编辑命令。
 * @param source - 编辑来源。
 * @returns 编辑结果和提交后的修订。
 */
export async function applyAndCommit(
  store: CardStore,
  cardId: string,
  targetId: string,
  command: EditorCommand,
  source: ChangeSource,
): Promise<{ outcome: EditOutcome, saved: SavedCard }> {
  return store.exclusive(cardId, async () => {
    const outcome = await applyEditLocked(store, cardId, targetId, command, source)
    const saved = await store.commit(cardId, outcome.draft.version)
    return { outcome, saved }
  })
}

async function applyEditLocked(
  store: CardStore,
  cardId: string,
  targetId: string,
  command: EditorCommand,
  source: ChangeSource,
): Promise<EditOutcome> {
  const draft = await store.ensureDraft(cardId, source)
  const { root, createdModuleIds, createdBlockIds } = await transformCard(store, cardId, draft.document, targetId, command)
  const draft2 = await store.updateDraft(cardId, undefined, root, source)
  return { draft: draft2, createdModuleIds, createdBlockIds }
}

/** 一次变换的产出：整卡新文档 + 新块/新模块编号。 */
export interface TransformResult {
  readonly root: ContentDocument
  readonly createdModuleIds: string[]
  readonly createdBlockIds: string[]
}

/**
 * 把一条命令套用到任意一份卡文档上（不读写 draft.json）：变换 + 文件夹整理 +
 * 校验。草稿路径（applyEditLocked）和提案路径（proposals.ts）共用。
 * @param document - 作为基底的整卡文档（调用方决定是 head、草稿还是提案预览）。
 */
export async function transformCard(
  store: CardStore,
  cardId: string,
  document: ContentDocument,
  targetId: string,
  command: EditorCommand,
): Promise<TransformResult> {
  const transformed = await transformDocument(store, cardId, document, targetId, command)
  const root = organizeFolders(transformed.root)
  assertValid(root)
  return { root, createdModuleIds: transformed.createdModuleIds, createdBlockIds: transformed.createdBlockIds }
}

async function transformDocument(
  store: CardStore,
  cardId: string,
  document: ContentDocument,
  targetId: string,
  command: EditorCommand,
): Promise<TransformResult> {
  const card = findTarget(document, targetId)
  const createdModules: string[] = []
  const createdBlocks: string[] = []
  const textRef = async (text: string): Promise<string> => store.receivePayload(cardId, new TextEncoder().encode(text))

  const module = (id: string): ContentModule => {
    const found = flattenModules(card.modules).find(candidate => candidate.id === id)
    if (found === undefined) throw new Error('目标模块不存在或不属于当前卡片')
    return found
  }
  const put = (next: ContentDocument): ContentDocument => replaceTarget(document, targetId, next)

  /** embed_file 的落块尾巴：图片进卡资源 + 图片块；其余（md/txt）快照成文字块。模块必须已在 working 里。 */
  const embedInto = async (working: ContentDocument, moduleId: string, bytes: Uint8Array, imageMedia: string | undefined): Promise<ContentDocument> => {
    const ref = await store.receivePayload(cardId, bytes)
    if (imageMedia !== undefined) {
      const resource = { id: mintId(), content: ref, mediaType: imageMedia }
      const block: ContentBlock = { kind: 'image', id: mintId(), resourceId: resource.id }
      createdBlocks.push(block.id)
      const withResource: ContentDocument = { ...working, resources: [...working.resources, resource] }
      return editBlocks(withResource, [{ kind: 'insert', moduleId, block, beforeBlockId: null }])
    }
    const block: ContentBlock = { kind: 'text', id: mintId(), content: ref }
    createdBlocks.push(block.id)
    return editBlocks(working, [{ kind: 'insert', moduleId, block, beforeBlockId: null }])
  }

  // ---------- 预制模块载荷（widget JSON 存在模块的第一个文字块里） ----------
  const widgetModule = (id: string, widgetType: string): ContentModule => {
    const target = module(id)
    if (target.widget?.type !== widgetType) throw new Error(`目标模块不是 ${widgetType} 类型`)
    return target
  }
  const widgetJson = async (target: ContentModule): Promise<string | undefined> => {
    const block = target.blocks.find(candidate => candidate.kind === 'text')
    return block === undefined ? undefined : new TextDecoder().decode(await store.readPayload(cardId, block.content))
  }
  /** 把 JSON 写回模块的第一个文字块；没有就新建一个（模块内只允许一个 JSON 块——其余文字块按文档正文处理）。 */
  const putWidgetJson = async (target: ContentModule, text: string): Promise<ContentModule[]> => {
    const ref = await textRef(text)
    const existing = target.blocks.find(candidate => candidate.kind === 'text')
    if (existing !== undefined) {
      return updateModule(card.modules, target.id, original => ({
        ...original,
        blocks: original.blocks.map(block => block.id === existing.id ? { kind: 'text', id: block.id, content: ref } : block),
      }))
    }
    const block: ContentBlock = { kind: 'text', id: mintId(), content: ref }
    createdBlocks.push(block.id)
    return updateModule(card.modules, target.id, original => ({ ...original, blocks: [...original.blocks, block] }))
  }
  /** 读载荷 → 变换 → 写回，预制模块命令的公共骨架。 */
  const mutateWidget = async <T>(moduleId: string, widgetType: string, decode: (raw: string | undefined) => T, encode: (data: T) => string, mutate: (data: T) => T): Promise<ContentModule[]> => {
    const target = widgetModule(moduleId, widgetType)
    const data = decode(await widgetJson(target))
    return putWidgetJson(target, encode(mutate(data)))
  }

  let next = card
  switch (command.kind) {
    case 'add_module': {
      const created: ContentModule = { id: mintId(), name: command.name, blocks: [], tags: [], children: [], layout: command.layout ?? 'VERTICAL', characterIds: [], ...(command.widget !== undefined ? { widget: { type: command.widget } } : {}) }
      next = put({ ...card, modules: insertModule(card.modules, command.parentId ?? null, created, null) })
      createdModules.push(created.id)
      break
    }
    case 'copy_module': {
      const source = module(command.moduleId)
      const clone = cloneModule(source)
      const parentId = command.parentId !== undefined ? command.parentId : (parentOfModule(card.modules, source.id) ?? null)
      if (parentId !== null) module(parentId)
      const sibs = parentId === null ? card.modules : (flattenModules(card.modules).find(candidate => candidate.id === parentId)?.children ?? [])
      const beforeId = command.beforeId !== undefined
        ? command.beforeId
        : (sibs.slice(sibs.findIndex(candidate => candidate.id === source.id) + 1)[0]?.id ?? null)
      next = put({ ...card, modules: insertModule(card.modules, parentId, clone, beforeId) })
      createdModules.push(...flattenModules([clone]).map(candidate => candidate.id))
      break
    }
    case 'merge_child': {
      const target = module(command.moduleId)
      if (target.children.length !== 1) throw new Error('只有仅剩一个子模块的文件夹才能合并回本体')
      const child = target.children[0]
      if (child.children.length > 0) throw new Error('子模块内部还有子级，请先处理')
      next = put({
        ...card,
        modules: updateModule(card.modules, target.id, original => ({
          ...original,
          blocks: [...original.blocks, ...child.blocks],
          characterIds: [...original.characterIds, ...child.characterIds.filter(id => !original.characterIds.includes(id))],
          children: [],
        })),
      })
      break
    }
    case 'rename_module':
      next = put({ ...card, modules: updateModule(card.modules, command.moduleId, original => ({ ...original, name: command.name })) })
      break
    case 'rename_card': {
      const name = command.name.trim()
      if (name.length === 0) throw new Error('名称不能为空')
      next = put({ ...card, name })
      break
    }
    case 'write_text': {
      const target = module(command.moduleId)
      const blockId = command.blockId ?? null
      if (blockId !== null) {
        const existing = target.blocks.find(block => block.id === blockId)
        if (existing === undefined || existing.kind !== 'text') throw new Error('文字块不存在')
        if (command.expectedContent !== undefined && existing.content !== command.expectedContent) {
          throw new EditConflict('这个文字块在你读取之后被改过，请重新读取后再改', target.id, blockId)
        }
      }
      const ref = await textRef(command.text)
      const block: ContentBlock = { kind: 'text', id: blockId ?? mintId(), content: ref }
      if (blockId === null) createdBlocks.push(block.id)
      const blocks = blockId === null
        ? [...target.blocks, block]
        : target.blocks.map(candidate => candidate.id === blockId ? block : candidate)
      next = put({ ...card, modules: updateModule(card.modules, target.id, original => ({ ...original, name: command.moduleName, blocks })) })
      break
    }
    case 'replace_text_range': {
      const target = module(command.moduleId)
      const block = target.blocks.find(candidate => candidate.id === command.blockId)
      if (block === undefined || block.kind !== 'text') throw new Error('文字块不存在')
      if (block.content !== command.expectedContent) throw new EditConflict('文字版本已变化，请重新读取后修改', target.id, block.id)
      const original = new TextDecoder().decode(await store.readPayload(cardId, block.content))
      const codepoints = Array.from(original)
      if (command.start < 0 || command.end < command.start || command.end > codepoints.length) throw new Error('文字修改范围无效')
      const updated = [...codepoints.slice(0, command.start), ...Array.from(command.text), ...codepoints.slice(command.end)].join('')
      const ref = await textRef(updated)
      next = put({
        ...card,
        modules: updateModule(card.modules, target.id, original2 => ({
          ...original2,
          name: command.moduleName ?? original2.name,
          blocks: original2.blocks.map(candidate => candidate.id === block.id ? { ...block, content: ref } : candidate),
        })),
      })
      break
    }
    case 'write_markdown': {
      const target = module(command.moduleId)
      const blocks = await parseModuleMarkdown(card, command.text, async text => textRef(text))
      next = put({ ...card, modules: updateModule(card.modules, target.id, original => ({ ...original, name: command.name, blocks })) })
      break
    }
    case 'write_caption': {
      const target = module(command.moduleId)
      const block = target.blocks.find(candidate => candidate.id === command.blockId)
      if (block === undefined || block.kind !== 'image') throw new Error('图片块不存在')
      const caption = command.text.length > 0 ? await textRef(command.text) : undefined
      next = put({
        ...card,
        modules: updateModule(card.modules, target.id, original => ({
          ...original,
          name: command.moduleName,
          blocks: original.blocks.map(candidate => candidate.id === block.id ? { ...block, caption } : candidate),
        })),
      })
      break
    }
    case 'move_module':
      module(command.moduleId)
      if (command.beforeId != null) module(command.beforeId)
      next = put({ ...card, modules: placeModule(card.modules, command.moduleId, parentOfModule(card.modules, command.moduleId) ?? null, command.beforeId ?? null) })
      break
    case 'place_module':
      next = put({ ...card, modules: placeModule(card.modules, command.moduleId, command.parentId ?? null, command.beforeId ?? null) })
      break
    case 'set_module_layout':
      next = put({ ...card, modules: updateModule(card.modules, command.moduleId, original => ({ ...original, layout: command.layout })) })
      break
    case 'set_reading_layout':
      next = put({ ...card, appearance: { ...card.appearance, readingLayout: command.layout } })
      break
    case 'move_block': {
      const owner = module(command.moduleId)
      if (!owner.blocks.some(block => block.id === command.blockId)) throw new Error('内容块不属于目标模块')
      next = put({ ...card, ...editBlocks(card, [{ kind: 'move', blockId: command.blockId, moduleId: command.moduleId, beforeBlockId: command.beforeBlockId ?? null }]) })
      break
    }
    case 'remove_module':
      module(command.moduleId)
      next = put({ ...card, modules: removeModule(card.modules, command.moduleId) })
      break
    case 'remove_block': {
      const owner = module(command.moduleId)
      if (!owner.blocks.some(block => block.id === command.blockId)) throw new Error('内容块不属于目标模块')
      next = put({ ...card, ...editBlocks(card, [{ kind: 'remove', blockId: command.blockId }]) })
      break
    }
    case 'module_options': {
      const target = module(command.moduleId)
      next = put({
        ...card,
        modules: updateModule(card.modules, target.id, original => ({
          ...original,
          tags: command.tags,
          use: command.use,
          routing: command.routing === null ? original.routing : (command.routing ?? original.routing),
          temporality: command.temporality === null ? original.temporality : (command.temporality ?? original.temporality),
        })),
      })
      break
    }
    case 'appearance': {
      const valid = command.resourceId === null || card.resources.some(resource => resource.id === command.resourceId && resource.mediaType.startsWith('image/'))
      if (!valid) throw new Error('图片资源不属于目标卡或类型不符')
      next = put({
        ...card,
        appearance: command.cover
          ? { ...card.appearance, coverResourceId: command.resourceId ?? undefined }
          : { ...card.appearance, avatarResourceId: command.resourceId ?? undefined },
      })
      break
    }
    case 'insert_owned_image': {
      const target = module(command.moduleId)
      if (!card.resources.some(resource => resource.id === command.resourceId && resource.mediaType.startsWith('image/'))) throw new Error('图片资源不属于目标卡或类型不符')
      const after = command.afterBlockId ?? null
      if (after !== null && !target.blocks.some(block => block.id === after)) throw new Error('定位内容块不属于目标模块')
      const at = after === null ? target.blocks.length : target.blocks.findIndex(block => block.id === after) + 1
      const block: ContentBlock = { kind: 'image', id: mintId(), resourceId: command.resourceId }
      createdBlocks.push(block.id)
      next = put({ ...card, ...editBlocks(card, [{ kind: 'insert', moduleId: target.id, block, beforeBlockId: target.blocks.at(at)?.id ?? null }]) })
      break
    }
    case 'replace_block_image': {
      const target = module(command.moduleId)
      const block = target.blocks.find(candidate => candidate.id === command.blockId)
      if (block === undefined || block.kind !== 'image') throw new Error('图片块不存在')
      if (!card.resources.some(resource => resource.id === command.resourceId && resource.mediaType.startsWith('image/'))) throw new Error('图片资源不属于目标卡或类型不符')
      next = put({ ...card, ...editBlocks(card, [{ kind: 'replace', blockId: block.id, block: { ...block, resourceId: command.resourceId } }]) })
      break
    }
    case 'remove_resource': {
      const resource = card.resources.find(candidate => candidate.id === command.resourceId)
      if (resource === undefined) throw new Error('目标资源不存在')
      const usedBy = flattenModules(card.modules).flatMap(module2 => module2.blocks.filter(block => block.kind === 'image' && block.resourceId === command.resourceId))
      const asAvatar = card.appearance.avatarResourceId === command.resourceId
      const asCover = card.appearance.coverResourceId === command.resourceId
      if (!command.removeUses && (usedBy.length > 0 || asAvatar || asCover)) throw new Error('资源仍在使用；确认移除请传 remove_uses=true')
      let working = { ...card, resources: card.resources.filter(candidate => candidate.id !== command.resourceId) }
      for (const block of usedBy) {
        working = editBlocks(working, [{ kind: 'remove', blockId: block.id }])
      }
      if (asAvatar) working = { ...working, appearance: { ...working.appearance, avatarResourceId: undefined } }
      if (asCover) working = { ...working, appearance: { ...working.appearance, coverResourceId: undefined } }
      next = put(working)
      break
    }
    case 'adopt_image': {
      const ref = await store.receivePayload(cardId, command.bytes)
      const resource = { id: mintId(), content: ref, mediaType: command.mediaType }
      let working: ContentDocument = { ...card, resources: [...card.resources, resource] }
      if (command.moduleId != null) {
        const target = module(command.moduleId)
        const after = command.afterBlockId ?? null
        if (after !== null && !target.blocks.some(block => block.id === after)) throw new Error('图片插入位置不存在')
        const at = after === null ? target.blocks.length : target.blocks.findIndex(block => block.id === after) + 1
        const block: ContentBlock = { kind: 'image', id: mintId(), resourceId: resource.id }
        createdBlocks.push(block.id)
        working = editBlocks(working, [{ kind: 'insert', moduleId: target.id, block, beforeBlockId: target.blocks.at(at)?.id ?? null }])
      }
      next = put(working)
      break
    }
    case 'embed_file': {
      const extension = command.path.split('.').pop()?.toLowerCase() ?? ''
      const base = command.path.split('/').pop() ?? command.path
      const stem = base.replace(/\.[^.]*$/u, '')
      const imageMedia = IMAGE_MEDIA[extension]
      const fileMedia = EMBED_FILE_MEDIA[extension]
      if (imageMedia === undefined && fileMedia === undefined) throw new Error(`不支持嵌入的文件类型：${extension === '' ? base : extension}`)
      const bytes = await readProjectFile(store.projectRoot, command.path)
      const targetId = command.moduleId ?? null
      if (targetId === null) {
        // 嵌到卡根：以文件名新建一个模块；html 建活引用模块，其余建正文模块。
        const created: ContentModule = {
          id: mintId(), name: stem === '' ? base : stem, blocks: [], tags: [], children: [],
          layout: 'VERTICAL', characterIds: [],
          ...(fileMedia === 'text/html' ? { widget: { type: 'html', path: command.path } } : {}),
        }
        let working: ContentDocument = { ...card, modules: insertModule(card.modules, null, created, null) }
        createdModules.push(created.id)
        // html 是活引用——不留快照块；图片/文本才落块。
        if (fileMedia !== 'text/html') working = await embedInto(working, created.id, bytes, imageMedia)
        next = put(working)
        break
      }
      const target = module(targetId)
      if (fileMedia === 'text/html') {
        // 活引用改写模块呈现载体；已有正文的模块拒绝改型——内容会不可见。
        if (target.widget?.type !== 'html' && target.blocks.length > 0) {
          throw new Error('目标模块已有正文——选一个空模块，或省略 module_id 新建嵌入模块')
        }
        next = put({ ...card, modules: updateModule(card.modules, target.id, original => ({ ...original, widget: { ...original.widget, type: 'html', path: command.path } })) })
        break
      }
      next = put(await embedInto(card, target.id, bytes, imageMedia))
      break
    }
    case 'place_character': {
      if (!card.internalCharacters.some(character => character.id === command.characterId)) throw new Error('角色展示必须定位本世界的角色')
      next = put({
        ...card,
        modules: stripCharacter(card.modules, command.characterId),
      })
      if (command.moduleId != null) {
        const target = flattenModules(next.modules).find(candidate => candidate.id === command.moduleId)
        if (target === undefined) throw new Error('目标模块不存在')
        next = put({ ...next, modules: updateModule(next.modules, target.id, original => ({ ...original, characterIds: [...original.characterIds, command.characterId] })) })
      }
      break
    }
    case 'add_character': {
      if (card.kind !== 'WORLD') throw new Error('只有世界卡能容纳内部角色')
      const character: ContentDocument = {
        id: mintId(), kind: 'CHARACTER', name: command.name, modules: [], resources: [], internalCharacters: [], extensions: {},
        appearance: { readingLayout: 'PAGED' },
      }
      createdModules.push(character.id)
      next = put({ ...card, internalCharacters: [...card.internalCharacters, character] })
      break
    }
    case 'copy_character': {
      if (card.kind !== 'WORLD') throw new Error('只有世界卡能容纳内部角色')
      if (command.source.kind !== 'CHARACTER') throw new Error('只能复制角色卡')
      const copy = cloneWithFreshIds(command.source)
      next = put({ ...card, internalCharacters: [...card.internalCharacters, copy] })
      createdModules.push(copy.id)
      break
    }
    case 'remove_character': {
      if (!card.internalCharacters.some(character => character.id === command.characterId)) throw new Error('内部角色不存在')
      next = put({
        ...card,
        internalCharacters: card.internalCharacters.filter(character => character.id !== command.characterId),
        modules: stripCharacter(card.modules, command.characterId),
      })
      break
    }
    // ---------- 时间线 v2 ----------
    case 'set_widget_data': {
      const raw = typeof command.data === 'string' ? command.data : JSON.stringify(command.data)
      const prepared = command.widget === 'map' ? await resolvePngHeightmap(raw) : raw
      const modules = command.widget === 'collection'
        ? await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, () => decodeCollection(prepared))
        : command.widget === 'map'
          ? await mutateWidget(command.moduleId, 'map', decodeMap, encodeMap, () => decodeMap(prepared))
          : command.widget === 'relation'
            ? await mutateWidget(command.moduleId, 'relation', decodeRelation, encodeRelation, () => decodeRelation(prepared))
            : await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, () => decodeTimeline(prepared))
      next = put({ ...card, modules })
      break
    }
    case 'map_spawn_view': {
      const source = widgetModule(command.moduleId, 'map')
      const data = decodeMap(await widgetJson(source))
      const parentAspect = command.aspect !== undefined && command.aspect > 0 ? command.aspect : (data.aspect ?? 1.6)
      // 取景框：显式 bbox 优先，否则由 objectId 对象的归一化外接框外扩留白推出。
      let bbox: GBBox
      if (command.bbox !== undefined) {
        const [x0, y0, x1, y1] = command.bbox
        if (!(x1 > x0 && y1 > y0)) throw new Error('bbox 必须是 [x0,y0,x1,y1] 且非空')
        const cl = (v: number): number => Math.min(1, Math.max(0, v))
        bbox = [cl(x0), cl(y0), cl(x1), cl(y1)]
      } else {
        const obj = data.objects.find(o => o.id === command.objectId)
        if (obj === undefined) throw new Error('生成视图需要 objectId（对象编号）或显式 bbox')
        const pts = obj.type === 'mark' ? [obj.pos] : obj.pts
        bbox = padBBox(geomBBox(pts), .18, .15)
      }
      const childAspect = Math.max(.05, parentAspect * (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]))
      const norm = (p: readonly [number, number]): readonly [number, number] => toChild(p, bbox)

      // 对象裁剪：面按框裁多边形、线拆成框内段、地标只留框内；全裁掉的不带子图。
      const objects: MapData['objects'][number][] = []
      for (const o of data.objects) {
        if (o.type === 'face') {
          const clipped = clipPolygonRect(o.pts, bbox)
          if (clipped.length >= 3) objects.push({ ...o, pts: clipped.map(norm) })
        } else if (o.type === 'line') {
          const median = [...o.widths].sort((a, b) => a - b)[Math.floor(o.widths.length / 2)] ?? .01
          for (const seg of clipPolylineRect(o.pts, bbox)) {
            objects.push({ ...o, id: mintId(), pts: seg.map(norm), widths: seg.map(() => median), attachStart: undefined, attachEnd: undefined })
          }
        } else if (o.type === 'mark' && o.pos[0] >= bbox[0] && o.pos[0] <= bbox[2] && o.pos[1] >= bbox[1] && o.pos[1] <= bbox[3]) {
          objects.push({ ...o, pos: norm(o.pos) })
        }
      }
      // 草稿裁剪：shape 先确定性展开再裁（落 poly 静多边形）；stroke 拆框内段。
      const draft: MapData['draft'][number][] = []
      for (const e of data.draft) {
        if (e.kind === 'shape') {
          const expanded = expandShape(e.ctrl, parentAspect, e.roughness, e.seed)
            .map((p): readonly [number, number] => [p[0] / parentAspect, p[1]])
          const clipped = clipPolygonRect(expanded, bbox)
          if (clipped.length >= 3) draft.push({ kind: 'poly', color: e.color, pts: clipped.map(norm), ...(e.op !== undefined ? { op: e.op } : {}) })
        } else if (e.kind === 'poly') {
          const clipped = clipPolygonRect(e.pts, bbox)
          if (clipped.length >= 3) draft.push({ kind: 'poly', color: e.color, pts: clipped.map(norm), ...(e.op !== undefined ? { op: e.op } : {}) })
        } else {
          for (const seg of clipPolylineRect(e.pts, bbox)) {
            draft.push({ kind: 'stroke', color: e.color, r: e.r, pts: seg.map(norm), ...(e.erase === true ? { erase: true } : {}) })
          }
        }
      }
      // 世界子视图（Resample）：不是裁几何，而是把取景框区域重采样成更密的高度图，
      // 子模块读入时由管线重算——更密的格子上会重新长出河网/城邦，细节真的变多。
      let childWorld: MapData['world'] = undefined
      if (data.world !== undefined) {
        const heightmap = resolveWorldHeightmap(data)
        if (heightmap !== undefined) {
          const parentWorld = generateWorld({ seed: data.world.seed, config: data.world.config, heightmap, postSteps: [...(data.world.postSteps ?? [])] })
          const res = resampleWorld(parentWorld, bbox, 2)
          // 框内的实体覆写重映射进子图：改过的城名/国名在子世界里继续生效。
          // id 锚点按生成序号分配、父子不同，重映射时剥掉只留 key/at。
          const childEdits = (data.world.edits ?? [])
            .filter(e => e.key !== undefined || (e.at !== undefined && e.at[0] >= bbox[0] && e.at[0] <= bbox[2] && e.at[1] >= bbox[1] && e.at[1] <= bbox[3]))
            .map(e => {
              const { id: _drop, ...rest } = e
              return rest.at === undefined ? rest : { ...rest, at: toChild(rest.at, bbox) }
            })
          childWorld = {
            seed: res.seed,
            config: { ...(data.world.config ?? {}), ...res.config },
            heightmap: { kind: 'heights', heights: res.heights },
            ...(data.world.postSteps !== undefined ? { postSteps: data.world.postSteps } : {}),
            ...(childEdits.length > 0 ? { edits: childEdits } : {}),
          }
        }
      }
      const objectName = data.objects.find(o => o.id === command.objectId)?.name
      const childData: MapData = {
        ...data, markers: [], objects, draft,
        ...(childWorld !== undefined ? { world: childWorld } : {}),
        parent: { moduleId: source.id, ...(command.objectId !== undefined ? { objectId: command.objectId } : {}), bbox },
        window: bbox, aspect: childAspect,
      }
      const child: ContentModule = {
        id: mintId(), name: command.name ?? `${source.name} · ${objectName ?? '局部视图'}`,
        blocks: source.blocks.filter(block => block.kind === 'image').map(block => ({ ...block, id: mintId() })),
        tags: [], children: [], layout: 'VERTICAL', characterIds: [], widget: { type: 'map' },
      }
      createdModules.push(child.id)
      createdBlocks.push(...child.blocks.map(block => block.id))
      const widgetBlock: ContentBlock = { kind: 'text', id: mintId(), content: await textRef(encodeMap(childData)) }
      createdBlocks.push(widgetBlock.id)
      child.blocks.push(widgetBlock)
      // 紧跟源模块之后插入：同一层级的下一个兄弟就是 beforeId。
      const parentId = parentOfModule(card.modules, source.id) ?? null
      const siblings = parentId === null ? card.modules : (flattenModules(card.modules).find(candidate => candidate.id === parentId)?.children ?? [])
      const beforeId = siblings.slice(siblings.findIndex(candidate => candidate.id === source.id) + 1)[0]?.id ?? null
      next = put({ ...card, modules: insertModule(card.modules, parentId, child, beforeId) })
      break
    }
    case 'timeline_set_calendar':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => {
        const calendar = calendarOf(command.calendar)
        // 带名字的历法进视图库（同名覆盖）；无名的只切当前显示。
        const views = calendar.name === ''
          ? data.views
          : [...data.views.filter(v => v.name !== calendar.name), calendar]
        return { ...data, calendar, views }
      }) })
      break
    case 'timeline_switch_view':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => {
        const view = data.views.find(v => v.name === command.name)
        return view === undefined ? data : { ...data, calendar: view }
      }) })
      break
    case 'timeline_add_event':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        events: [...data.events, {
          id: command.event.id ?? mintPayloadId(),
          at: command.event.at, until: command.event.until ?? null,
          ...(command.event.ongoing === true ? { ongoing: true as const } : {}),
          title: command.event.title, description: command.event.description ?? '',
          characters: command.event.characters ?? [],
          ...(command.event.color !== undefined ? { color: command.event.color } : {}),
        }],
      })) })
      break
    case 'timeline_update_event':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        // patch.color === null 表示「跟随纪元」——摘掉字段而不是存 null。
        events: data.events.map(event => {
          if (event.id !== command.id) return event
          const { color, ...rest } = { ...event, ...command.patch, id: event.id }
          return color === null || color === undefined ? rest : { ...rest, color }
        }),
      })) })
      break
    case 'timeline_move_event':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        events: data.events.map(event => event.id === command.id
          ? { ...event, at: command.at, until: command.until === undefined ? event.until : command.until }
          : event),
      })) })
      break
    case 'timeline_remove_event':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        events: data.events.filter(event => event.id !== command.id),
      })) })
      break
    case 'timeline_add_era':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        // from/to null = 开放端（向过去/未来延伸）；两端都空按全开放保留。
        eras: [...data.eras, { id: command.era.id ?? mintPayloadId(), name: command.era.name, from: command.era.from ?? null, to: command.era.to ?? null, color: command.era.color, description: command.era.description ?? '' }],
      })) })
      break
    case 'timeline_update_era':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        eras: data.eras.map(era => era.id === command.id ? { ...era, ...command.patch, id: era.id } : era),
      })) })
      break
    case 'timeline_remove_era':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        eras: data.eras.filter(era => era.id !== command.id),
      })) })
      break
    case 'timeline_add_mark':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        marks: [...data.marks, { id: command.mark.id ?? mintPayloadId(), at: command.mark.at, label: command.mark.label ?? '' }],
      })) })
      break
    case 'timeline_update_mark':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        marks: data.marks.map(mark => mark.id === command.id ? { ...mark, ...command.patch, id: mark.id } : mark),
      })) })
      break
    case 'timeline_remove_mark':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'timeline', decodeTimeline, encodeTimeline, data => ({
        ...data,
        marks: data.marks.filter(mark => mark.id !== command.id),
      })) })
      break
    // ---------- 集合 v2 ----------
    case 'collection_add_field':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({
        ...data,
        fields: [...data.fields, { id: command.field.id ?? mintPayloadId(), name: command.field.name, type: command.field.type ?? 'text' }],
      })) })
      break
    case 'collection_update_field':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({
        ...data,
        fields: data.fields.map(field => field.id === command.id ? { ...field, ...command.patch, id: field.id } : field),
      })) })
      break
    case 'collection_remove_field':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({
        ...data,
        fields: data.fields.filter(field => field.id !== command.id),
        values: Object.fromEntries(Object.entries(data.values).map(([itemId, byField]) => {
          const rest = { ...byField }
          delete rest[command.id]
          return [itemId, rest]
        })),
      })) })
      break
    case 'collection_add_item':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => {
        const itemId = command.item.id ?? mintPayloadId()
        const items = [...data.items, { id: itemId, name: command.item.name, summary: command.item.summary ?? '', description: command.item.description ?? '', visualKey: null }]
        const byField: Record<string, CollectionValue> = {}
        for (const [key, value] of Object.entries(command.values ?? {})) {
          const field = data.fields.find(candidate => candidate.id === key || candidate.name === key)
          if (field === undefined) throw new Error(`字段不存在：${key}`)
          byField[field.id] = value
        }
        const values = Object.keys(byField).length > 0 ? { ...data.values, [itemId]: byField } : data.values
        return { ...data, items, values }
      }) })
      break
    case 'collection_update_item':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({
        ...data,
        items: data.items.map(item => item.id === command.id ? { ...item, ...command.patch, id: item.id } : item),
      })) })
      break
    case 'collection_remove_item':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({
        ...data,
        items: data.items.filter(item => item.id !== command.id),
        values: Object.fromEntries(Object.entries(data.values).filter(([itemId]) => itemId !== command.id)),
      })) })
      break
    case 'collection_set_value':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => {
        if (!data.fields.some(field => field.id === command.fieldId)) throw new Error('字段不存在')
        if (!data.items.some(item => item.id === command.itemId)) throw new Error('条目不存在')
        return { ...data, values: { ...data.values, [command.itemId]: { ...data.values[command.itemId], [command.fieldId]: command.value } } }
      }) })
      break
    case 'collection_set_item_image': {
      let resourceId = command.resourceId
      let resources = card.resources
      if (resourceId === undefined) {
        if (command.bytes === undefined || command.mediaType === undefined) throw new Error('需要 resourceId 或图片字节')
        const ref = await store.receivePayload(cardId, command.bytes)
        resourceId = mintId()
        resources = [...resources, { id: resourceId, content: ref, mediaType: command.mediaType }]
      } else if (!resources.some(candidate => candidate.id === resourceId && candidate.mediaType.startsWith('image/'))) {
        throw new Error('图片资源不属于目标卡或类型不符')
      }
      const bound = resourceId
      const modules = await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => {
        if (!data.items.some(item => item.id === command.itemId)) throw new Error('条目不存在')
        return { ...data, items: data.items.map(item => item.id === command.itemId ? { ...item, visualKey: bound } : item) }
      })
      next = put({ ...card, resources, modules })
      break
    }
    case 'collection_set_style':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({ ...data, artStyle: command.artStyle })) })
      break
    case 'collection_set_view':
      next = put({ ...card, modules: await mutateWidget(command.moduleId, 'collection', decodeCollection, encodeCollection, data => ({ ...data, view: command.view })) })
      break
    // ---------- 总览 / 玩家布局（extensions 引用载荷） ----------
    case 'set_layout': {
      const text = encodeLayout(typeof command.layout === 'string' ? decodeLayout(command.layout) : command.layout as LayoutData)
      const ref = await textRef(text)
      next = put({ ...card, extensions: { ...card.extensions, [`noven.layout.${command.layoutKey}`]: ref } })
      break
    }
  }

  return { root: next, createdModuleIds: createdModules, createdBlockIds: createdBlocks }
}

/** 从全部模块的展示位里摘掉一个角色（递归）。 */
function stripCharacter(modules: ContentModule[], characterId: string): ContentModule[] {
  return modules.map(original => ({
    ...original,
    characterIds: original.characterIds.filter(id => id !== characterId),
    children: stripCharacter(original.children, characterId),
  }))
}

/** 深拷贝一份角色卡并全树换新编号（含引用改写），副本独立。 */
function cloneWithFreshIds(source: ContentDocument): ContentDocument {
  const idMap = new Map<string, string>()
  const fresh = (old: string): string => {
    const mapped = idMap.get(old) ?? mintId()
    idMap.set(old, mapped)
    return mapped
  }
  const remapRef = (ref: string): string => ref
  const walkModules = (modules: ContentModule[]): ContentModule[] => modules.map(original => ({
    ...original,
    id: fresh(original.id),
    blocks: original.blocks.map(block => block.kind === 'image'
      ? { ...block, id: fresh(block.id), resourceId: fresh(block.resourceId) }
      : { ...block, id: fresh(block.id) }),
    characterIds: original.characterIds.map(id => idMap.get(id) ?? id),
    children: walkModules(original.children),
  }))
  void remapRef
  return {
    ...source,
    id: fresh(source.id),
    modules: walkModules(source.modules),
    resources: source.resources.map(resource => ({ ...resource, id: fresh(resource.id) })),
    extensions: { ...source.extensions },
    appearance: {
      readingLayout: source.appearance.readingLayout,
      avatarResourceId: source.appearance.avatarResourceId !== undefined ? fresh(source.appearance.avatarResourceId) : undefined,
      coverResourceId: source.appearance.coverResourceId !== undefined ? fresh(source.appearance.coverResourceId) : undefined,
    },
    internalCharacters: [],
  }
}

/** 深拷贝模块子树：模块与块全部换新 id，文字载荷与图片资源按引用共享（载荷不可变，天然可共享）。 */
function cloneModule(original: ContentModule): ContentModule {
  return {
    id: mintId(),
    name: original.name,
    blocks: original.blocks.map(block => ({ ...block, id: mintId() })),
    tags: [...original.tags],
    ...(original.use !== undefined ? { use: original.use } : {}),
    children: original.children.map(cloneModule),
    layout: original.layout,
    characterIds: [...original.characterIds],
    ...(original.routing !== undefined ? { routing: original.routing } : {}),
    ...(original.temporality !== undefined ? { temporality: original.temporality } : {}),
    ...(original.widget !== undefined ? { widget: { ...original.widget } } : {}),
  }
}
