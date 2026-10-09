/**
 * AI 提案（契约 C5 方案 B 变体「补丁集」）。
 *
 * 选择补丁集而不是命令日志的理由：命令不必确定可重放——提案只存
 * 「目标卡 → 模块补丁（before/after 快照 + 位置）」。预览 = head + 补丁；
 * 接受 = 把补丁套到**当前** head 再提交；拒绝 = 丢补丁。人在挂起期间的
 * 编辑落在 head 上，天然和提案隔离——不会出现「人保存时连带提交 AI 改动」。
 *
 * 提案文件 proposal.json 在卡目录里（Finder 可见、随卡搬家、软删保留）。
 * @module noven-cards/proposals
 */

import { flattenModules, findTarget, insertModule, removeModule, replaceTarget, type CardAppearance, type ContentDocument, type ContentModule, type ContentRef } from './model.ts'
import { CardStore, type CardSurface, type ModulePatch, type ProposalFile, type SavedCard, type TargetPatch } from './store.ts'
import { transformCard, type EditorCommand } from './editor.ts'

/** 一次提案写入的回执（给工具/UI：pending + 新建编号）。 */
export interface ProposalOutcome {
  readonly proposal: ProposalFile
  readonly createdModuleIds: string[]
  readonly createdBlockIds: string[]
}

function surfaceOf(document: ContentDocument): CardSurface {
  return { name: document.name, appearance: document.appearance, extensions: document.extensions }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

interface ModulePosition { readonly parentId: string | null, readonly index: number, readonly beforeId: string | null }

/**
 * 模块在树里的父级、兄弟序号与后继兄弟。index/parentId 判移动；
 * beforeId 与 insertModule 同语义（插到它前面，null=队尾）只做插入锚点。
 */
function positionOf(modules: readonly ContentModule[], moduleId: string, parentId: string | null = null): ModulePosition | undefined {
  const index = modules.findIndex(candidate => candidate.id === moduleId)
  if (index >= 0) return { parentId, index, beforeId: index + 1 < modules.length ? modules[index + 1].id : null }
  for (const candidate of modules) {
    const found = positionOf(candidate.children, moduleId, candidate.id)
    if (found !== undefined) return found
  }
  return undefined
}

/** 对比两份目标卡文档，产出补丁集（任何一项都为空时返回 undefined）。 */
export function diffTarget(before: ContentDocument, after: ContentDocument): TargetPatch | undefined {
  const beforeFlat = new Map(flattenModules(before.modules).map(m => [m.id, m]))
  const afterFlat = new Map(flattenModules(after.modules).map(m => [m.id, m]))
  const modules: Record<string, ModulePatch> = {}
  for (const [id, beforeModule] of beforeFlat) {
    const afterModule = afterFlat.get(id)
    if (afterModule === undefined) {
      modules[id] = { before: beforeModule, after: null }
      continue
    }
    const pos = positionOf(after.modules, id)
    const beforePos = positionOf(before.modules, id)
    if (!sameJson(beforeModule, afterModule) || beforePos?.parentId !== pos?.parentId || beforePos?.index !== pos?.index) {
      modules[id] = { before: beforeModule, after: afterModule, parentId: pos?.parentId ?? null, index: pos?.index, beforeId: pos?.beforeId ?? null }
    }
  }
  for (const [id, afterModule] of afterFlat) {
    if (beforeFlat.has(id)) continue
    const pos = positionOf(after.modules, id)
    modules[id] = { before: null, after: afterModule, parentId: pos?.parentId ?? null, index: pos?.index, beforeId: pos?.beforeId ?? null }
  }
  const characters: Record<string, { before: ContentDocument | null, after: ContentDocument | null }> = {}
  const beforeChars = new Map(before.internalCharacters.map(c => [c.id, c]))
  const afterChars = new Map(after.internalCharacters.map(c => [c.id, c]))
  for (const [id, b] of beforeChars) {
    const a = afterChars.get(id)
    if (a === undefined) characters[id] = { before: b, after: null }
    else if (!sameJson(b, a)) characters[id] = { before: b, after: a }
  }
  for (const [id, a] of afterChars) {
    if (!beforeChars.has(id)) characters[id] = { before: null, after: a }
  }
  const card = !sameJson(surfaceOf(before), surfaceOf(after)) ? { before: surfaceOf(before), after: surfaceOf(after) } : undefined
  const resources = !sameJson(before.resources, after.resources) ? { before: before.resources, after: after.resources } : undefined
  if (Object.keys(modules).length === 0 && Object.keys(characters).length === 0 && card === undefined && resources === undefined) return undefined
  return { modules, characters, ...(card !== undefined ? { card } : {}), ...(resources !== undefined ? { resources } : {}) }
}

/** 把补丁集套到模块树上（预览 / 接受共用的纯函数）。 */
function applyModulePatches(modules: ContentModule[], patches: readonly ModulePatch[]): ContentModule[] {
  let tree = modules
  // 先删（after=null），后按依赖序插入/替换。
  for (const patch of patches) {
    const removed = patch.before
    if (patch.after === null && removed !== null && flattenModules(tree).some(m => m.id === removed.id)) {
      tree = removeModule(tree, removed.id)
    }
  }
  const pending = patches.filter(patch => patch.after !== null)
  const ids = pending.map(patch => (patch.after as ContentModule).id)
  const guard = ids.length * ids.length + 1
  for (let round = 0; round < guard && pending.length > 0; round++) {
    const patch = pending.shift() as ModulePatch
    const after = patch.after as ContentModule
    const parentId = patch.parentId ?? null
    const parentReady = parentId === null || flattenModules(tree).some(m => m.id === parentId)
    if (!parentReady) {
      pending.push(patch)
      continue
    }
    if (flattenModules(tree).some(m => m.id === after.id)) tree = removeModule(tree, after.id)
    const siblings = parentId === null ? tree : (flattenModules(tree).find(m => m.id === parentId)?.children ?? [])
    const beforeId = patch.beforeId !== null && patch.beforeId !== undefined && siblings.some(m => m.id === patch.beforeId) ? patch.beforeId : null
    tree = insertModule(tree, parentId, after, beforeId)
  }
  // 残留的补丁（父级被一并拒绝/删除的）静默跳过——调用方在 diff 里能看到。
  return tree
}

/** 把一个目标卡的补丁套到文档上。 */
function applyTargetPatch(document: ContentDocument, targetId: string, patch: TargetPatch): ContentDocument {
  const target = findTarget(document, targetId)
  let next: ContentDocument = {
    ...target,
    modules: applyModulePatches(target.modules, Object.values(patch.modules)),
    internalCharacters: applyCharacterPatches(target.internalCharacters, patch.characters),
  }
  if (patch.card !== undefined) {
    next = { ...next, name: patch.card.after.name, appearance: patch.card.after.appearance, extensions: patch.card.after.extensions }
  }
  if (patch.resources !== undefined) {
    next = { ...next, resources: [...patch.resources.after] }
  }
  return replaceTarget(document, targetId, next)
}

function applyCharacterPatches(characters: ContentDocument[], patches: Record<string, { before: ContentDocument | null, after: ContentDocument | null }>): ContentDocument[] {
  let list = characters.filter(c => patches[c.id]?.after !== null || patches[c.id] === undefined)
  for (const [id, patch] of Object.entries(patches)) {
    if (patch.after === null) continue
    const index = list.findIndex(c => c.id === id)
    if (index >= 0) list = [...list.slice(0, index), patch.after, ...list.slice(index + 1)]
    else list = [...list, patch.after]
  }
  return list
}

/** 预览：head + 全部挂起补丁（AI 继续写时的基底）。 */
export function proposalPreview(document: ContentDocument, proposal: ProposalFile): ContentDocument {
  let next = document
  for (const [targetId, patch] of Object.entries(proposal.targets)) {
    try {
      next = applyTargetPatch(next, targetId, patch)
    } catch { /* 目标卡已被移除——这段补丁在 diff/accept 时自然失效 */ }
  }
  return next
}

/** 提案对外的变化清单（diff 路由 + GET 摘要 + 工具回执共用）。 */
export interface ProposalChange {
  readonly targetId: string
  readonly moduleId: string
  readonly name: string
  readonly kind: 'added' | 'removed' | 'changed' | 'moved'
  /** 人在提案挂起期间改过同一个模块——接受会覆盖人的编辑。 */
  readonly stale: boolean
}

export function proposalChanges(head: ContentDocument, proposal: ProposalFile): ProposalChange[] {
  const changes: ProposalChange[] = []
  for (const [targetId, patch] of Object.entries(proposal.targets)) {
    let target: ContentDocument | undefined
    try {
      target = findTarget(head, targetId)
    } catch {
      target = undefined
    }
    const headModules = new Map(target === undefined ? [] : flattenModules(target.modules).map(m => [m.id, m]))
    if (patch.card !== undefined) {
      const current = target === undefined ? undefined : surfaceOf(target)
      changes.push({ targetId, moduleId: targetId, name: patch.card.after.name, kind: 'changed', stale: current !== undefined && !sameJson(current, patch.card.before) })
    }
    if (patch.resources !== undefined) {
      changes.push({ targetId, moduleId: targetId, name: `${patch.resources.after.length} → 素材`, kind: 'changed', stale: target !== undefined && !sameJson(target.resources, patch.resources.before) })
    }
    for (const [moduleId, module] of Object.entries(patch.modules)) {
      const before = module.before
      const after = module.after
      const current = headModules.get(moduleId)
      const stale = (before === null) !== (current === undefined) || (before !== null && current !== undefined && !sameJson(before, current))
      const kind = before === null ? 'added' : after === null ? 'removed' : !sameJson(before, after) ? 'changed' : 'moved'
      changes.push({ targetId, moduleId, name: (after ?? before)?.name ?? moduleId, kind, stale })
    }
    for (const [characterId, character] of Object.entries(patch.characters)) {
      const current = target?.internalCharacters.find(c => c.id === characterId)
      const stale = (character.before === null) !== (current === undefined) || (character.before !== null && current !== undefined && !sameJson(character.before, current))
      const kind = character.before === null ? 'added' : character.after === null ? 'removed' : 'changed'
      changes.push({ targetId, moduleId: characterId, name: (character.after ?? character.before)?.name ?? characterId, kind, stale })
    }
  }
  return changes
}

function emptyProposal(baseRevision: number): ProposalFile {
  return { version: 1, baseRevision, source: 'AI', targets: {} }
}

function hasPatches(patch: TargetPatch): boolean {
  return Object.keys(patch.modules).length > 0 || Object.keys(patch.characters).length > 0 || patch.card !== undefined || patch.resources !== undefined
}

/**
 * 在挂起提案的预览上执行一次变换，并把「预览 vs head」的全量 diff 写回
 * proposal.json。人/工具走的都是这一条——AI 的每条命令天然叠在自己的
 * 提案上，块级期望（expectedContent）对预览生效。
 */
export async function proposeTransform(
  store: CardStore,
  cardId: string,
  transform: (preview: ContentDocument) => Promise<ContentDocument>,
): Promise<ProposalOutcome> {
  return store.exclusive(cardId, async () => {
    const head = await store.open(cardId)
    if (head === undefined) throw new Error('卡片不存在')
    const existing = await store.proposal(cardId) ?? emptyProposal(head.revision)
    const preview = proposalPreview(head.document, existing)
    const next = await transform(preview)
    const targets: Record<string, TargetPatch> = { ...existing.targets }
    const candidates = new Set([head.document.id, ...head.document.internalCharacters.map(c => c.id), ...next.internalCharacters.map(c => c.id)])
    for (const targetId of candidates) {
      const afterDoc = ((): ContentDocument | undefined => { try { return findTarget(next, targetId) } catch { return undefined } })()
      const beforeDoc = ((): ContentDocument | undefined => { try { return findTarget(head.document, targetId) } catch { return undefined } })()
      if (afterDoc === undefined || beforeDoc === undefined) {
        // 目标卡被移除（或本次新建的角色）：它自己的补丁随它消亡/不需要，
        // 移除/新增本身由根目标的 characters diff 整体记录。
        delete targets[targetId]
        continue
      }
      const patch = diffTarget(beforeDoc, afterDoc)
      if (patch === undefined || !hasPatches(patch)) delete targets[targetId]
      else targets[targetId] = patch
    }
    const proposal: ProposalFile = { ...existing, targets }
    await store.writeProposal(cardId, Object.keys(targets).length === 0 ? undefined : proposal)
    return { proposal, createdModuleIds: [], createdBlockIds: [] }
  })
}

/** 一条命令进提案（不提交）。 */
export async function proposeEdit(
  store: CardStore,
  cardId: string,
  targetId: string,
  command: EditorCommand,
): Promise<ProposalOutcome> {
  const createdModuleIds: string[] = []
  const createdBlockIds: string[] = []
  const outcome = await proposeTransform(store, cardId, async preview => {
    const result = await transformCard(store, cardId, preview, targetId, command)
    createdModuleIds.push(...result.createdModuleIds)
    createdBlockIds.push(...result.createdBlockIds)
    return result.root
  })
  return { ...outcome, createdModuleIds, createdBlockIds }
}

/**
 * 接受提案。moduleIds 省略 = 全部（含卡层补丁）；否则只接受这些模块的补丁，
 * 父补丁的 after 快照会连带其中的后代补丁（视为一并接受）。
 */
export async function acceptProposal(store: CardStore, cardId: string, moduleIds?: readonly string[]): Promise<SavedCard> {
  return store.exclusive(cardId, async () => {
    const head = await store.open(cardId)
    if (head === undefined) throw new Error('卡片不存在')
    const proposal = await store.proposal(cardId)
    if (proposal === undefined) throw new Error('没有挂起的提案')
    if (moduleIds === undefined) {
      const saved = await store.commitDocument(cardId, proposalPreview(head.document, proposal), 'AI')
      await store.writeProposal(cardId, undefined)
      return saved
    }
    const wanted = new Set(moduleIds)
    const targets: Record<string, TargetPatch> = {}
    let next = head.document
    for (const [targetId, patch] of Object.entries(proposal.targets)) {
      const picked: ModulePatch[] = []
      const rest: Record<string, ModulePatch> = {}
      for (const [moduleId, module] of Object.entries(patch.modules)) {
        if (wanted.has(moduleId)) picked.push(module)
        else rest[moduleId] = module
      }
      if (picked.length > 0) {
        // 只套模块补丁：卡层补丁和角色补丁留给接受全部。
        next = applyTargetPatch(next, targetId, {
          modules: Object.fromEntries(picked.map(p => [((p.after ?? p.before) as ContentModule).id, p])),
          characters: {},
        })
      }
      // 已接受的补丁快照连带其中的后代补丁一并消耗。
      const consumed = new Set(picked.flatMap(p => flattenModules([p.after ?? p.before as ContentModule]).map(m => m.id)))
      const kept: Record<string, ModulePatch> = {}
      for (const [moduleId, module] of Object.entries(rest)) {
        if (!consumed.has(moduleId)) kept[moduleId] = module
      }
      const remaining: TargetPatch = { ...patch, modules: kept }
      if (hasPatches(remaining)) targets[targetId] = remaining
    }
    const saved = await store.commitDocument(cardId, next, 'AI')
    await store.writeProposal(cardId, Object.keys(targets).length === 0 ? undefined : { ...proposal, targets })
    return saved
  })
}

/** 拒绝提案：丢弃对应补丁（连带其后代）；全部省略时整个提案作废。 */
export async function rejectProposal(store: CardStore, cardId: string, moduleIds?: readonly string[]): Promise<void> {
  return store.exclusive(cardId, async () => {
    const proposal = await store.proposal(cardId)
    if (proposal === undefined || moduleIds === undefined) {
      await store.writeProposal(cardId, undefined)
      return
    }
    const wanted = new Set(moduleIds)
    const targets: Record<string, TargetPatch> = {}
    for (const [targetId, patch] of Object.entries(proposal.targets)) {
      const cascade = new Set<string>()
      for (const [moduleId, module] of Object.entries(patch.modules)) {
        if (wanted.has(moduleId)) {
          for (const inner of flattenModules([module.after ?? module.before as ContentModule])) cascade.add(inner.id)
        }
      }
      const kept: Record<string, ModulePatch> = {}
      for (const [moduleId, module] of Object.entries(patch.modules)) {
        if (!wanted.has(moduleId) && !cascade.has(moduleId)) kept[moduleId] = module
      }
      const remaining: TargetPatch = { ...patch, modules: kept }
      if (hasPatches(remaining)) targets[targetId] = remaining
    }
    await store.writeProposal(cardId, Object.keys(targets).length === 0 ? undefined : { ...proposal, targets })
  })
}
