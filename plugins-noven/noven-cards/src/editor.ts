/**
 * 共同编辑入口，ported from the mobile CardEditor + CardComposition：人工与
 * AI 的每一次编辑都变成 EditorCommand 走这里——同一套变换、同一个乐观锁。
 * 一切编辑先落草稿；提交（commit）才成为正式修订。
 *
 * 与手机端的已声明简化：EditorPosition（UI 光标）不迁移——桌面端当前无卡
 * 片编辑界面；文件夹整理（organizeFolders）语义完整保留。
 * @module noven-cards/editor
 */

import { mintId, flattenModules, editBlocks, findTarget, replaceTarget, insertModule, updateModule, removeModule, parentOfModule, placeModule, organizeFolders, assertValid, type ContentBlock, type ContentDocument, type ContentModule, type ModuleLayout, type ModuleRouting, type ModuleTemporality, type ModuleUse } from './model.ts'
import { CardStore, type CardDraft, type ChangeSource } from './store.ts'
import { parseModuleMarkdown } from './markdown.ts'

/** 编辑命令全集（工具与未来的人工界面共用）。 */
export type EditorCommand =
  | { kind: 'add_module', name: string, parentId?: string | null, layout?: ModuleLayout }
  | { kind: 'rename_module', moduleId: string, name: string }
  | { kind: 'rename_card', name: string }
  | { kind: 'write_text', moduleId: string, blockId?: string | null, moduleName: string, text: string }
  | { kind: 'replace_text_range', moduleId: string, blockId: string, expectedContent: string, start: number, end: number, text: string, moduleName?: string }
  | { kind: 'write_markdown', moduleId: string, name: string, text: string }
  | { kind: 'write_caption', moduleId: string, blockId: string, moduleName: string, text: string }
  | { kind: 'move_module', moduleId: string, beforeId?: string | null }
  | { kind: 'place_module', moduleId: string, parentId?: string | null, beforeId?: string | null }
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
  | { kind: 'place_character', characterId: string, moduleId?: string | null }
  | { kind: 'add_character', name: string }
  | { kind: 'copy_character', source: ContentDocument }
  | { kind: 'remove_character', characterId: string }

/** 一次编辑产生的新块/新模块（saved-with-ids 直链用）。 */
export interface EditOutcome {
  readonly draft: CardDraft
  readonly createdModuleIds: string[]
  readonly createdBlockIds: string[]
}

/**
 * 应用一条编辑命令到草稿（版本必须匹配）。调用方随后 commit。
 * @param store - 卡库。
 * @param cardId - 根卡 id。
 * @param targetId - 实际目标卡（自身或世界内角色）。
 * @param expectedVersion - 读取时的版本。
 * @param command - 编辑命令。
 * @param source - 编辑来源。
 */
export async function applyEdit(
  store: CardStore,
  cardId: string,
  targetId: string,
  expectedVersion: string,
  command: EditorCommand,
  source: ChangeSource,
): Promise<EditOutcome> {
  const draft = await store.ensureDraft(cardId, source)
  if (draft.version !== expectedVersion) {
    throw new (await import('./store.ts')).DraftConflict(draft.version)
  }
  const card = findTarget(draft.document, targetId)
  const createdModules: string[] = []
  const createdBlocks: string[] = []
  const textRef = async (text: string): Promise<string> => store.receivePayload(cardId, new TextEncoder().encode(text))

  const module = (id: string): ContentModule => {
    const found = flattenModules(card.modules).find(candidate => candidate.id === id)
    if (found === undefined) throw new Error('目标模块不存在或不属于当前卡片')
    return found
  }
  const put = (next: ContentDocument): ContentDocument => replaceTarget(draft.document, targetId, next)

  let next = card
  switch (command.kind) {
    case 'add_module': {
      const created: ContentModule = { id: mintId(), name: command.name, blocks: [], tags: [], children: [], layout: command.layout ?? 'VERTICAL', characterIds: [] }
      next = put({ ...card, modules: insertModule(card.modules, command.parentId ?? null, created, null) })
      createdModules.push(created.id)
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
      if (block.content !== command.expectedContent) throw new Error('文字版本已变化，请重新读取后修改')
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
  }

  next = organizeFolders(next)
  assertValid(next)
  const draft2 = await store.updateDraft(cardId, expectedVersion, replaceTarget(draft.document, targetId, next), source)
  return { draft: draft2, createdModuleIds: createdModules, createdBlockIds: createdBlocks }
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
