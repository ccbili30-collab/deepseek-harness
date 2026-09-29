/**
 * 卡片内容纯数据模型，ported from the mobile content-core
 * (ContentDocument.kt + ModuleTree.kt + FolderContents.kt). 两种卡类共用
 * 一套模块化底座；正文与图片只是 ContentRef 引用；人工与 AI 共用同一套
 * 变换。产品决策见 noven-docs/手机版卡系统拆解.md。
 * @module noven-cards/model
 */

import { randomUUID } from 'node:crypto'

/** 内容引用仅定位持久内容（本实现为卡目录内的载荷文件名，如 c12）；不携带字节。 */
export type ContentRef = string

/** 只有两种卡类。 */
export type CardKind = 'WORLD' | 'CHARACTER'

export interface TextBlock { readonly kind: 'text', readonly id: string, content: ContentRef }
export interface ImageBlock { readonly kind: 'image', readonly id: string, resourceId: string, caption?: ContentRef }
export type ContentBlock = TextBlock | ImageBlock

export type ModuleLayout = 'VERTICAL' | 'HORIZONTAL'

/** 携带规则：always 始终 / manual 手动 / keywords 条件触发。 */
export type ModuleUse =
  | { kind: 'always' }
  | { kind: 'manual' }
  | { kind: 'keywords', words: string[], caseSensitive: boolean, requireAll: boolean }

/** 去向标签：进开局资料包 / 每轮注入 / 文风槽 / 待命。 */
export type ModuleRouting = 'DEFAULT' | 'PER_TURN' | 'STYLE' | 'STANDBY'
/** 时间性：不变事实（压缩后可重注入）/ 开局快照（永不重注入）。 */
export type ModuleTemporality = 'CONSTANT' | 'SNAPSHOT'

export interface ContentModule {
  id: string
  name: string
  blocks: ContentBlock[]
  tags: string[]
  use?: ModuleUse
  children: ContentModule[]
  layout: ModuleLayout
  /** 角色展示位（世界卡专属）：指向本世界内部角色，不重复。 */
  characterIds: string[]
  routing?: ModuleRouting
  temporality?: ModuleTemporality
}

export interface CardResource { id: string, content: ContentRef, mediaType: string }

export interface CardAppearance {
  avatarResourceId?: string
  coverResourceId?: string
  readingLayout: 'PAGED' | 'CONTINUOUS'
}

/** 一张卡：仅已确认的内容结构；没有对话、权限或模式。 */
export interface ContentDocument {
  id: string
  kind: CardKind
  name: string
  modules: ContentModule[]
  resources: CardResource[]
  /** 世界内角色（递归完整卡）；角色卡不得再嵌。 */
  internalCharacters: ContentDocument[]
  /** 未知扩展保留原文引用，不解释不改写。 */
  extensions: Record<string, ContentRef>
  appearance: CardAppearance
}

export function mintId(): string {
  return randomUUID()
}

/** 展平模块树（前序）。 */
export function flattenModules(modules: readonly ContentModule[]): ContentModule[] {
  const out: ContentModule[] = []
  const walk = (list: readonly ContentModule[]): void => {
    for (const module of list) {
      out.push(module)
      walk(module.children)
    }
  }
  walk(modules)
  return out
}

/** 结构校验（与手机端 validate 同契约）。返回错误列表；空数组即合法。 */
export function validateCard(document: ContentDocument): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  const identify = (id: string, what: string): void => {
    if (id.length === 0) errors.push(`${what}编号不能为空`)
    else if (seen.has(id)) errors.push(`同一内容树中编号重复：${id}`)
    else seen.add(id)
  }
  const visit = (card: ContentDocument): void => {
    identify(card.id, '卡片')
    if (card.kind === 'CHARACTER' && card.internalCharacters.length > 0) errors.push('角色不能容纳内部角色')
    const localResources = new Set(card.resources.map(resource => resource.id))
    for (const id of [card.appearance.avatarResourceId, card.appearance.coverResourceId]) {
      if (id !== undefined && !localResources.has(id)) errors.push('头像和封面必须引用本卡资源')
    }
    for (const resource of card.resources) {
      identify(resource.id, '资源')
      if (resource.mediaType.trim().length === 0) errors.push('资源类型不能为空')
    }
    const localCharacters = new Set(card.internalCharacters.map(character => character.id))
    const presented = new Set<string>()
    for (const module of flattenModules(card.modules)) {
      for (const characterId of module.characterIds) {
        if (!localCharacters.has(characterId)) errors.push(`角色展示必须定位本世界的角色：${characterId}`)
        else if (presented.has(characterId)) errors.push(`角色展示不能重复放置：${characterId}`)
        else presented.add(characterId)
      }
      identify(module.id, '模块')
      if (module.tags.some(tag => tag.trim().length === 0) || new Set(module.tags).size !== module.tags.length) {
        errors.push(`模块标签不能为空或重复：${module.id}`)
      }
      for (const block of module.blocks) {
        identify(block.id, '内容块')
        if (block.kind === 'image' && !localResources.has(block.resourceId)) errors.push(`图片必须引用本卡资源：${block.id}`)
      }
    }
    for (const character of card.internalCharacters) {
      if (character.kind !== 'CHARACTER') errors.push('世界内部只能包含角色')
      visit(character)
    }
  }
  visit(document)
  return errors
}

/** 断言校验通过；违规抛错（写路径使用）。 */
export function assertValid(document: ContentDocument): void {
  const errors = validateCard(document)
  if (errors.length > 0) throw new Error(errors[0])
}

// ---------- 模块树操作（ModuleTree.kt 的 insert/update/remove/place） ----------

/** 在父级（null=根）内插入模块；beforeId null=末尾；定位模块必须属于该父级。 */
export function insertModule(modules: readonly ContentModule[], parentId: string | null, module: ContentModule, beforeId: string | null): ContentModule[] {
  const into = (siblings: readonly ContentModule[]): ContentModule[] => {
    const index = beforeId === null ? siblings.length : siblings.findIndex(candidate => candidate.id === beforeId)
    if (beforeId !== null && index < 0) throw new Error('定位模块不存在')
    return [...siblings.slice(0, index), module, ...siblings.slice(index)]
  }
  if (parentId === null) return into(modules)
  return modules.map(candidate => {
    if (candidate.id === parentId) return { ...candidate, children: into(candidate.children) }
    return candidate.children.length > 0 ? { ...candidate, children: insertModule(candidate.children, parentId, module, beforeId) } : candidate
  })
}

/** 更新指定模块（整替）；不存在抛错。 */
export function updateModule(modules: readonly ContentModule[], moduleId: string, update: (module: ContentModule) => ContentModule): ContentModule[] {
  let found = false
  const walk = (list: readonly ContentModule[]): ContentModule[] => list.map(candidate => {
    if (candidate.id === moduleId) {
      found = true
      return update(candidate)
    }
    return candidate.children.length > 0 ? { ...candidate, children: walk(candidate.children) } : candidate
  })
  const next = walk(modules)
  if (!found) throw new Error(`目标模块不存在：${moduleId}`)
  return next
}

/** 移除模块及其全部子模块。 */
export function removeModule(modules: readonly ContentModule[], moduleId: string): ContentModule[] {
  const walk = (list: readonly ContentModule[]): ContentModule[] =>
    list.filter(candidate => candidate.id !== moduleId)
      .map(candidate => candidate.children.length > 0 ? { ...candidate, children: walk(candidate.children) } : candidate)
  return walk(modules)
}

/** 求模块的父级 id（根级为 null；不存在为 undefined）。 */
export function parentOfModule(modules: readonly ContentModule[], moduleId: string, parentId: string | null = null): string | null | undefined {
  for (const candidate of modules) {
    if (candidate.id === moduleId) return parentId
    if (candidate.children.length > 0) {
      const found = parentOfModule(candidate.children, moduleId, candidate.id)
      if (found !== undefined) return found
    }
  }
  return undefined
}

/** 把模块子树放到新父级（null=根）的 beforeId 之前（null=末尾）；禁止放入自己或后代。 */
export function placeModule(modules: readonly ContentModule[], moduleId: string, parentId: string | null, beforeId: string | null): ContentModule[] {
  if (parentOfModule(modules, moduleId) === undefined) throw new Error(`目标模块不存在：${moduleId}`)
  const moving = flattenModules(modules).find(candidate => candidate.id === moduleId)
  if (moving === undefined) throw new Error(`目标模块不存在：${moduleId}`)
  if (parentId !== null && new Set(flattenModules([moving]).map(candidate => candidate.id)).has(parentId)) {
    throw new Error('禁止把模块放入自己或它的后代')
  }
  if (beforeId !== null && parentOfModule(modules, beforeId) !== parentId) throw new Error('定位模块与目标父级不一致')
  const next = removeModule(modules, moduleId)
  return insertModule(next, parentId, moving, beforeId)
}

// ---------- 块级编辑 ----------

export type BlockEdit =
  | { kind: 'insert', moduleId: string, block: ContentBlock, beforeBlockId: string | null }
  | { kind: 'replace', blockId: string, block: ContentBlock }
  | { kind: 'remove', blockId: string }
  | { kind: 'move', blockId: string, moduleId: string, beforeBlockId: string | null }

function moduleOfBlock(modules: readonly ContentModule[], blockId: string): string {
  for (const module of flattenModules(modules)) {
    if (module.blocks.some(block => block.id === blockId)) return module.id
  }
  throw new Error(`内容块不存在：${blockId}`)
}

export function editBlocks(document: ContentDocument, edits: readonly BlockEdit[]): ContentDocument {
  let modules = document.modules
  for (const edit of edits) {
    if (edit.kind === 'insert') {
      modules = updateModule(modules, edit.moduleId, module => {
        const index = edit.beforeBlockId === null ? module.blocks.length : module.blocks.findIndex(block => block.id === edit.beforeBlockId)
        if (edit.beforeBlockId !== null && index < 0) throw new Error('定位内容块不存在')
        return { ...module, blocks: [...module.blocks.slice(0, index), edit.block, ...module.blocks.slice(index)] }
      })
    }
    else if (edit.kind === 'replace') {
      modules = updateModule(modules, moduleOfBlock(modules, edit.blockId), module => ({
        ...module,
        blocks: module.blocks.map(block => block.id === edit.blockId ? edit.block : block),
      }))
    }
    else if (edit.kind === 'remove') {
      modules = updateModule(modules, moduleOfBlock(modules, edit.blockId), module => ({
        ...module,
        blocks: module.blocks.filter(block => block.id !== edit.blockId),
      }))
    }
    else {
      const owner = moduleOfBlock(modules, edit.blockId)
      const block = flattenModules(modules).find(candidate => candidate.id === owner)?.blocks.find(candidate => candidate.id === edit.blockId)
      if (block === undefined) throw new Error('要移动的内容块不存在')
      modules = updateModule(modules, owner, module => ({ ...module, blocks: module.blocks.filter(candidate => candidate.id !== edit.blockId) }))
      modules = updateModule(modules, edit.moduleId, module => {
        const index = edit.beforeBlockId === null ? module.blocks.length : module.blocks.findIndex(candidate => candidate.id === edit.beforeBlockId)
        if (edit.beforeBlockId !== null && index < 0) throw new Error('定位内容块不存在')
        return { ...module, blocks: [...module.blocks.slice(0, index), block, ...module.blocks.slice(index)] }
      })
    }
  }
  return { ...document, modules }
}

/** 在世界（或独立卡）内定位目标卡：自身或某个内部角色。 */
export function findTarget(document: ContentDocument, targetId: string): ContentDocument {
  if (document.id === targetId) return document
  const character = document.internalCharacters.find(candidate => candidate.id === targetId)
  if (character === undefined) throw new Error('目标卡片不在当前内容树中')
  return character
}

/** 用变换后的目标卡替换树内同位卡。 */
export function replaceTarget(document: ContentDocument, targetId: string, next: ContentDocument): ContentDocument {
  if (document.id === targetId) return next
  return {
    ...document,
    internalCharacters: document.internalCharacters.map(candidate => candidate.id === targetId ? next : candidate),
  }
}

/**
 * 文件夹整理（FolderContents.organize）：既有子模块又有正文的模块，其正文
 * 降级为一个真实子模块（新编号确定性生成、避开全树已用编号），原模块变成
 * 纯分组（保留名称/布局/角色展示位；正文块的编号与携带规则原地保留——已有
 * 对话对模块的选择继续指向同一内容）。
 */
export function organizeFolders(document: ContentDocument): ContentDocument {
  const used = new Set<string>()
  for (const part of [document, ...document.internalCharacters]) {
    used.add(part.id)
    for (const resource of part.resources) used.add(resource.id)
    for (const module of flattenModules(part.modules)) {
      used.add(module.id)
      for (const block of module.blocks) used.add(block.id)
    }
  }
  const childId = (parent: string): string => {
    for (let salt = 0; ; salt++) {
      const candidate = `folder-${parent}-${salt}`
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
    }
  }
  const visit = (items: readonly ContentModule[]): ContentModule[] => items.map(original => {
    const children = visit(original.children)
    if (children.length > 0 && original.blocks.length > 0) {
      const body: ContentModule = { ...original, children: [], layout: 'VERTICAL', characterIds: [] }
      const folder: ContentModule = {
        id: childId(original.id),
        name: original.name,
        blocks: [],
        tags: [],
        children: [body, ...children],
        layout: original.layout,
        characterIds: original.characterIds,
      }
      return folder
    }
    return { ...original, children }
  })
  return { ...document, modules: visit(document.modules) }
}
