/**
 * 卡片文件存储，ported from the mobile CardStore/CardDrafts (content-storage)
 * onto the project's visible `卡/` directory：
 *
 * ```
 * 卡/<卡名>/
 *   card.json          ← head：{ revision, seq, document }（document.id 是卡编号）
 *   draft.json         ← 草稿（无未保存编辑时不存在）
 *   contents/c1, c2…   ← 载荷（追加式，永不覆写；ContentRef 即文件名）
 *   revisions/r3.json  ← 每次提交的结构快照（载荷共享）
 *   deleted.json       ← 删除墓碑（软删除，卡可读回）
 * ```
 *
 * 目录名是卡名的 Finder 可见投影，编号才是身份：Finder 里改目录名 → 扫描时
 * 卡名跟随（外部改动接管）；应用内 rename_card → 提交后目录跟随。旧版
 * `.noven/cards/<id>/` 在首次访问时按卡名迁入 `卡/`。
 *
 * 版本即单调 seq：`v<seq>`。写操作必须带读取时的版本，冲突即拒（乐观锁）。
 * @module noven-cards/store
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { cardsDir, legacyCardsDir, sanitizeDirName, uniqueDirName } from 'noven-ledger'
import { assertValid, type CardAppearance, type CardResource, type ContentDocument, type ContentModule, type ContentRef } from './model.ts'

/** 编辑来源：人工 / AI / 导入。 */
export type ChangeSource = 'HUMAN' | 'AI' | 'IMPORT'

// ---------- AI 提案（proposal.json） ----------

/**
 * 单个模块的提案补丁：`before`/`after` 是整棵模块子树的快照——
 * null 分别表示「AI 新增」与「AI 删除」。`parentId`/`beforeId` 记
 * `after` 在父级里的位置：parentId null = 卡根部模块列；index = 在兄弟
 * 中的序号（移动检测用）；beforeId = 后继兄弟 id（插到它前面，null =
 * 队尾，重新插入的锚点）。
 * 同一提案内的快照取自同一棵预览树，天然自洽。
 */
export interface ModulePatch {
  readonly before: ContentModule | null
  readonly after: ContentModule | null
  readonly parentId?: string | null
  readonly index?: number
  readonly beforeId?: string | null
}

/** 世界内角色的整卡补丁（before null = 新增角色，after null = 移除）。 */
export interface CharacterPatch {
  readonly before: ContentDocument | null
  readonly after: ContentDocument | null
}

/** 卡层字段（名字、外观、扩展）快照。 */
export interface CardSurface {
  readonly name: string
  readonly appearance: CardAppearance
  readonly extensions: Record<string, ContentRef>
}

export interface SurfacePatch {
  readonly before: CardSurface
  readonly after: CardSurface
}

/** 素材资源整表快照；资源只随卡级命令增减，不做逐项合并。 */
export interface ResourcePatch {
  readonly before: readonly CardResource[]
  readonly after: readonly CardResource[]
}

/** 一个目标卡（根卡或某个内部角色）上的全部补丁。 */
export interface TargetPatch {
  readonly modules: Record<string, ModulePatch>
  readonly characters: Record<string, CharacterPatch>
  readonly card?: SurfacePatch
  readonly resources?: ResourcePatch
}

/** proposal.json：挂起的 AI 提案 = 目标卡 → 补丁集。预览 = head + 补丁。 */
export interface ProposalFile {
  readonly version: 1
  readonly baseRevision: number
  readonly source: 'AI'
  readonly targets: Record<string, TargetPatch>
}

/** 一张已保存的卡。 */
export interface SavedCard {
  readonly cardId: string
  readonly revision: number
  readonly version: string
  readonly document: ContentDocument
  readonly source: ChangeSource
}

/** 一份草稿：未提交的编辑 + 基线修订号。 */
export interface CardDraft {
  readonly cardId: string
  readonly version: string
  readonly baseRevision: number
  readonly document: ContentDocument
  readonly source: ChangeSource
}

/** 卡库根目录（项目内，Finder 可见）。 */
export function cardsRoot(projectRoot: string): string {
  return cardsDir(projectRoot)
}

/** 保存卡目录布局。 */
interface HeadFile { revision: number, seq: number, source: ChangeSource, document: ContentDocument }
interface DraftFile { version: number, baseRevision: number, source: ChangeSource, document: ContentDocument }
/** 撤销游标：at = 逻辑当前所处的修订号；redo = 可重做的修订号栈（栈顶先重做）。 */
interface UndoFile { at: number, redo: number[] }

/** 进程内按卡串行化：同一张卡的读改写不交错。 */
const chains = new Map<string, Promise<unknown>>()
/** 当前异步链已持有的卡锁；持锁者再进同一张卡直接执行，不排队（可重入）。 */
const held = new AsyncLocalStorage<ReadonlySet<string>>()
function withCard<T>(cardId: string, work: () => Promise<T>): Promise<T> {
  const mine = held.getStore()
  if (mine?.has(cardId) === true) return work()
  const run = (): Promise<T> => held.run(new Set([...(mine ?? []), cardId]), work)
  const chain = chains.get(cardId) ?? Promise.resolve()
  const next = chain.then(run, run)
  chains.set(cardId, next.catch(() => {}))
  return next
}

export class CardStore {
  constructor(private readonly projectRoot: string) {}

  /**
   * 在这张卡的串行链里执行一整段读改写（可重入：块内的 store 调用不再排队）。
   * 不同模块的编辑因此不会互相丢更新，也不需要整卡版本号。
   * @param cardId - 卡编号。
   * @param work - 读改写过程。
   */
  exclusive<T>(cardId: string, work: () => Promise<T>): Promise<T> {
    return withCard(cardId, work)
  }

  /** cardId → `卡/` 下的目录名；扫描时构建并缓存（实例随请求短命）。 */
  private index?: Map<string, string>

  /**
   * 建/刷编号→目录索引。顺带做三件自愈：旧 `.noven/cards/<id>` 目录迁进
   * `卡/`；Finder 侧改过的目录名接管为卡名；复制的目录（同 id）领新编号。
   */
  private async scan(): Promise<Map<string, string>> {
    if (this.index !== undefined) return this.index
    const map = new Map<string, string>()
    const target = cardsRoot(this.projectRoot)
    await this.liftLegacy(target)
    let entries: { name: string; dir: string }[] = []
    try {
      entries = (await readdir(target, { withFileTypes: true }))
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({ name: e.name, dir: join(target, e.name) }))
    } catch { /* no card store yet */ }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    const seenIds = new Set<string>()
    for (const entry of entries) {
      const head = await this.readHead(entry.dir).catch(() => undefined)
      if (head === undefined) {
        // 未提交的导入草稿：只有 draft.json 的目录也是卡——head 没写之前
        // commit/discard 换进程、换实例也要找得到它。
        const draft = await this.readDraftFile(entry.dir).catch(() => undefined)
        const draftId = draft?.document.id
        if (draft !== undefined && typeof draftId === 'string' && draftId.length > 0 && !seenIds.has(draftId)) {
          seenIds.add(draftId)
          map.set(draftId, entry.name)
        }
        continue // 非卡目录（用户随手放的文件夹）不认领
      }
      let id = head.document.id
      if (typeof id !== 'string' || id.length === 0 || seenIds.has(id)) {
        id = randomUUID()
        head.document = { ...head.document, id }
        await writeFileAtomic(join(entry.dir, 'card.json'), `${JSON.stringify(head, null, 2)}\n`).catch(() => {})
      }
      seenIds.add(id)
      map.set(id, entry.name)
      // Finder 改名接管：目录名与卡名分叉时以目录名为准（sanitize 差异不算分叉）。
      const expected = sanitizeDirName(head.document.name)
      if (entry.name !== expected) {
        head.document = { ...head.document, name: entry.name }
        await writeFileAtomic(join(entry.dir, 'card.json'), `${JSON.stringify(head, null, 2)}\n`).catch(() => {})
        const draft = join(entry.dir, 'draft.json')
        try {
          const d = JSON.parse(await readFile(draft, 'utf8')) as DraftFile
          await writeFileAtomic(draft, `${JSON.stringify({ ...d, document: { ...d.document, name: entry.name } }, null, 2)}\n`)
        } catch { /* 无草稿或不可读——下次提交时自然对齐 */ }
      }
    }
    this.index = map
    return map
  }

  /** 旧 `.noven/cards/<id>/` → `卡/<卡名>/`，一次性、幂等。 */
  private async liftLegacy(target: string): Promise<void> {
    let entries: string[] = []
    try {
      entries = (await readdir(legacyCardsDir(this.projectRoot), { withFileTypes: true }))
        .filter(e => e.isDirectory()).map(e => e.name)
    } catch { /* no legacy store */ }
    for (const id of entries) {
      const src = join(legacyCardsDir(this.projectRoot), id)
      const head = await this.readHead(src).catch(() => undefined)
      const base = head === undefined ? id : sanitizeDirName(head.document.name)
      const name = await uniqueDirName(target, base)
      await mkdir(target, { recursive: true })
      try {
        await rename(src, join(target, name))
      } catch {
        await cp(src, join(target, name), { recursive: true }).catch(() => {})
        await rm(src, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  private async readHead(dir: string): Promise<HeadFile | undefined> {
    const head = JSON.parse(await readFile(join(dir, 'card.json'), 'utf8')) as HeadFile
    if (typeof head?.document !== 'object' || head.document === null) return undefined
    return head
  }

  /** 读目录里的草稿文件（识别未提交导入的卡目录用）。 */
  private async readDraftFile(dir: string): Promise<DraftFile | undefined> {
    const draft = JSON.parse(await readFile(join(dir, 'draft.json'), 'utf8')) as DraftFile
    return typeof draft?.document === 'object' && draft.document !== null ? draft : undefined
  }

  /**
   * 解析卡的目录；不存在返回 undefined。索引指向的目录已被（另一实例
   * 或 Finder）挪走时作废缓存重扫一次——改名/搬家换实例后仍找得到。
   */
  private async dirFor(cardId: string): Promise<string | undefined> {
    const name = (await this.scan()).get(cardId)
    if (name !== undefined) {
      const dir = join(cardsRoot(this.projectRoot), name)
      try {
        if ((await stat(dir)).isDirectory()) return dir
      } catch { /* 索引指向的目录已挪走——作废缓存重扫 */ }
    }
    this.index = undefined
    const rescanned = (await this.scan()).get(cardId)
    return rescanned === undefined ? undefined : join(cardsRoot(this.projectRoot), rescanned)
  }

  /** 卡的目录名（`卡/` 下的一级目录，客户端拼媒体路径用）。 */
  async dirName(cardId: string): Promise<string | undefined> {
    const name = (await this.scan()).get(cardId)
    if (name !== undefined) return name
    this.index = undefined
    return (await this.scan()).get(cardId)
  }

  /** 列出库内全部卡 id（不含已删除）。 */
  async list(): Promise<string[]> {
    const map = await this.scan()
    const existing: string[] = []
    for (const id of map.keys()) {
      if (!await this.isDeleted(id)) existing.push(id)
    }
    return existing
  }

  async isDeleted(cardId: string): Promise<boolean> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return false
    try {
      await readFile(join(dir, 'deleted.json'), 'utf8')
      return true
    } catch {
      return false
    }
  }

  /** 打开 head；不存在（或已删除）返回 undefined。 */
  async open(cardId: string): Promise<SavedCard | undefined> {
    if (await this.isDeleted(cardId)) return undefined
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      const head = JSON.parse(await readFile(join(dir, 'card.json'), 'utf8')) as HeadFile
      return { cardId, revision: head.revision, version: `v${String(head.seq)}`, document: head.document, source: head.source }
    } catch {
      return undefined
    }
  }

  /** 读历史修订。 */
  async history(cardId: string, revision: number): Promise<SavedCard | undefined> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      const snapshot = JSON.parse(await readFile(join(dir, 'revisions', `r${String(revision)}.json`), 'utf8')) as HeadFile
      return { cardId, revision: snapshot.revision, version: `v${String(snapshot.seq)}`, document: snapshot.document, source: snapshot.source }
    } catch {
      return undefined
    }
  }

  /** 读当前草稿（无草稿返回 undefined）。 */
  async draft(cardId: string): Promise<CardDraft | undefined> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      const draft = JSON.parse(await readFile(join(dir, 'draft.json'), 'utf8')) as DraftFile
      return { cardId, version: `v${String(draft.version)}`, baseRevision: draft.baseRevision, document: draft.document, source: draft.source }
    } catch {
      return undefined
    }
  }

  /** 确保草稿存在：没有就以 head（或全新卡）开一份。返回草稿。 */
  async ensureDraft(cardId: string, source: ChangeSource, fresh?: { kind: 'WORLD' | 'CHARACTER', name: string, document: ContentDocument }): Promise<CardDraft> {
    return withCard(cardId, async () => {
      const existing = await this.draft(cardId)
      if (existing !== undefined) return existing
      let base: HeadFile
      if (fresh !== undefined) {
        base = { revision: 0, seq: 0, source, document: fresh.document }
        const dir = await this.allocateDir(fresh.name)
        this.index?.set(cardId, basename(dir))
        await mkdir(join(dir, 'contents'), { recursive: true })
        await writeFileAtomic(join(dir, 'draft.json'), `${JSON.stringify({ version: base.seq, baseRevision: base.revision, source, document: base.document } satisfies DraftFile, null, 2)}\n`)
        return { cardId, version: 'v0', baseRevision: 0, document: base.document, source }
      }
      const head = await this.open(cardId)
      if (head === undefined) throw new Error('草稿不存在')
      base = { revision: head.revision, seq: Number(head.version.slice(1)), source: head.source, document: head.document }
      const dir = await this.dirFor(cardId)
      if (dir === undefined) throw new Error('卡片不存在')
      const next: DraftFile = { version: base.seq, baseRevision: base.revision, source, document: base.document }
      await mkdir(join(dir, 'contents'), { recursive: true })
      await writeFileAtomic(join(dir, 'draft.json'), `${JSON.stringify(next, null, 2)}\n`)
      return { cardId, version: `v${String(next.version)}`, baseRevision: next.baseRevision, document: next.document, source: next.source }
    })
  }

  /**
   * 更新草稿；返回新草稿。传了期望版本就必须匹配（导入流程用），省略则落在当前草稿上。
   * @param next - 变换后的整卡结构（已通过校验）。
   */
  async updateDraft(cardId: string, expectedVersion: string | undefined, next: ContentDocument, source: ChangeSource): Promise<CardDraft> {
    return withCard(cardId, async () => {
      const dir = await this.dirFor(cardId)
      if (dir === undefined) throw new Error('卡片不存在')
      const draft = await this.draft(cardId)
      if (draft === undefined) throw new Error('草稿不存在')
      if (expectedVersion !== undefined && draft.version !== expectedVersion) throw new DraftConflict(draft.version)
      const seq = Number(draft.version.slice(1)) + 1
      const file: DraftFile = { version: seq, baseRevision: draft.baseRevision, source, document: next }
      await writeFileAtomic(join(dir, 'draft.json'), `${JSON.stringify(file, null, 2)}\n`)
      return { cardId, version: `v${String(seq)}`, baseRevision: draft.baseRevision, document: next, source }
    })
  }

  /**
   * 提交草稿为正式修订。写 revision 快照 + 更新 head；传了期望版本就必须匹配
   * （用户确认导入草稿时用），省略则提交当前草稿。
   * 卡名变了就把目录一起改名（应用侧改名 → 目录跟随）。
   */
  async commit(cardId: string, expectedVersion?: string): Promise<SavedCard> {
    return withCard(cardId, async () => {
      const dir = await this.dirFor(cardId)
      if (dir === undefined) throw new Error('卡片不存在')
      const draft = await this.draft(cardId)
      if (draft === undefined) throw new Error('草稿不存在')
      if (expectedVersion !== undefined && draft.version !== expectedVersion) throw new DraftConflict(draft.version)
      const seq = Number(draft.version.slice(1)) + 1
      const revision = draft.baseRevision + 1
      const head: HeadFile = { revision, seq, source: draft.source, document: draft.document }
      await mkdir(join(dir, 'revisions'), { recursive: true })
      await writeFileAtomic(join(dir, 'revisions', `r${String(revision)}.json`), `${JSON.stringify(head, null, 2)}\n`)
      await writeFileAtomic(join(dir, 'card.json'), `${JSON.stringify(head, null, 2)}\n`)
      await rm(join(dir, 'draft.json'), { force: true })
      await rm(join(dir, 'undo.json'), { force: true })
      await this.syncDirName(cardId, dir, head.document.name)
      return { cardId, revision, version: `v${String(seq)}`, document: head.document, source: head.source }
    })
  }

  /** 读一份历史修订快照（`revisions/r<N>.json`）；不存在/损坏返回 undefined。 */
  async revisionSnapshot(cardId: string, revision: number): Promise<SavedCard | undefined> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      const head = JSON.parse(await readFile(join(dir, 'revisions', `r${String(revision)}.json`), 'utf8')) as HeadFile
      if (typeof head?.document !== 'object' || head.document === null) return undefined
      return { cardId, revision: head.revision, version: `v${String(head.seq)}`, document: head.document, source: head.source }
    } catch {
      return undefined
    }
  }

  /** 撤销游标（无文件返回 undefined）。 */
  async undoState(cardId: string): Promise<UndoFile | undefined> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      return JSON.parse(await readFile(join(dir, 'undo.json'), 'utf8')) as UndoFile
    } catch {
      return undefined
    }
  }

  /** 把一份历史文档追加为新修订（undone 游标的承载写；调用方须持有该卡串行链）。 */
  private async commitSnapshot(cardId: string, document: ContentDocument, source: ChangeSource): Promise<SavedCard> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) throw new Error('卡片不存在')
    const head = await this.open(cardId)
    if (head === undefined) throw new Error('卡片不存在')
    const seq = Number(head.version.slice(1)) + 1
    const revision = head.revision + 1
    const next: HeadFile = { revision, seq, source, document }
    await mkdir(join(dir, 'revisions'), { recursive: true })
    await writeFileAtomic(join(dir, 'revisions', `r${String(revision)}.json`), `${JSON.stringify(next, null, 2)}\n`)
    await writeFileAtomic(join(dir, 'card.json'), `${JSON.stringify(next, null, 2)}\n`)
    await this.syncDirName(cardId, dir, document.name)
    return { cardId, revision, version: `v${String(seq)}`, document, source }
  }

  /** 撤销一步：把上一修订的文档追加为最新 head（快照只增不改），游标回退。无可撤销返回 undefined。 */
  async undo(cardId: string): Promise<SavedCard | undefined> {
    return withCard(cardId, async () => {
      const head = await this.open(cardId)
      if (head === undefined) return undefined
      const state = await this.undoState(cardId)
      const at = state?.at ?? head.revision
      if (at <= 1) return undefined
      const snap = await this.history(cardId, at - 1)
      if (snap === undefined) return undefined
      const saved = await this.commitSnapshot(cardId, snap.document, 'HUMAN')
      const next: UndoFile = { at: at - 1, redo: [...(state?.redo ?? []), at] }
      const dir = await this.dirFor(cardId)
      if (dir !== undefined) await writeFileAtomic(join(dir, 'undo.json'), `${JSON.stringify(next, null, 2)}\n`)
      return saved
    })
  }

  /** 重做一步：恢复游标栈顶记载的修订。无可重做返回 undefined。 */
  async redo(cardId: string): Promise<SavedCard | undefined> {
    return withCard(cardId, async () => {
      const head = await this.open(cardId)
      if (head === undefined) return undefined
      const state = await this.undoState(cardId)
      const target = state?.redo.at(-1)
      if (state === undefined || target === undefined) return undefined
      const snap = await this.history(cardId, target)
      if (snap === undefined) return undefined
      const saved = await this.commitSnapshot(cardId, snap.document, 'HUMAN')
      const rest = state.redo.slice(0, -1)
      const next: UndoFile = { at: target, redo: rest }
      const dir = await this.dirFor(cardId)
      if (dir !== undefined) await writeFileAtomic(join(dir, 'undo.json'), `${JSON.stringify(next, null, 2)}\n`)
      return saved
    })
  }

  /** 丢弃未提交草稿；没有草稿是空操作。 */
  async discardDraft(cardId: string): Promise<void> {
    return withCard(cardId, async () => {
      const dir = await this.dirFor(cardId)
      if (dir !== undefined) await rm(join(dir, 'draft.json'), { force: true })
    })
  }

  // ---------- AI 提案 ----------

  /** 读挂起的提案；没有返回 undefined。 */
  async proposal(cardId: string): Promise<ProposalFile | undefined> {
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return undefined
    try {
      const raw = JSON.parse(await readFile(join(dir, 'proposal.json'), 'utf8')) as ProposalFile
      return raw.version === 1 && typeof raw.targets === 'object' && raw.targets !== null ? raw : undefined
    } catch {
      return undefined
    }
  }

  /** 写提案（undefined = 清除）；始终在卡的串行链里调用。 */
  async writeProposal(cardId: string, proposal: ProposalFile | undefined): Promise<void> {
    return withCard(cardId, async () => {
      const dir = await this.dirFor(cardId)
      if (dir === undefined) throw new Error('卡片不存在')
      if (proposal === undefined || Object.keys(proposal.targets).length === 0) {
        await rm(join(dir, 'proposal.json'), { force: true })
        return
      }
      await writeFileAtomic(join(dir, 'proposal.json'), `${JSON.stringify(proposal, null, 2)}\n`)
    })
  }

  /**
   * 把一份完整文档提交为新修订（接受提案用）：校验 + 修订快照 + head +
   * 目录跟随。与 commit 的区别：不走 draft.json，不碰撤销游标。
   */
  async commitDocument(cardId: string, document: ContentDocument, source: ChangeSource): Promise<SavedCard> {
    assertValid(document)
    return this.commitSnapshot(cardId, document, source)
  }

  /** 软删除（保留目录与历史，可读回）。 */
  async delete(cardId: string): Promise<void> {
    const head = await this.open(cardId)
    const revision = head?.revision ?? 0
    const dir = await this.dirFor(cardId)
    if (dir === undefined) return
    await mkdir(dir, { recursive: true })
    await writeFileAtomic(join(dir, 'deleted.json'), `${JSON.stringify({ revision, deletedAt: new Date().toISOString() }, null, 2)}\n`)
  }

  /** 新分配一个载荷文件名并写入字节（追加式，永不覆写）。 */
  async receivePayload(cardId: string, bytes: Uint8Array): Promise<string> {
    return withCard(cardId, async () => {
      const dir = await this.dirFor(cardId)
      if (dir === undefined) throw new Error('卡片不存在')
      const contents = join(dir, 'contents')
      await mkdir(contents, { recursive: true })
      let max = 0
      try {
        for (const name of await readdir(contents)) {
          const match = /^c(\d+)$/.exec(name)
          if (match !== null) max = Math.max(max, Number(match[1]))
        }
      } catch { /* empty */ }
      const ref = `c${String(max + 1)}`
      await writeFileAtomic(join(contents, ref), bytes)
      return ref
    })
  }

  /** 读一个载荷；不存在抛错。 */
  async readPayload(cardId: string, ref: string): Promise<Uint8Array> {
    if (!/^c\d+$/.test(ref)) throw new Error('内容引用不合法')
    const dir = await this.dirFor(cardId)
    if (dir === undefined) throw new Error('卡片不存在')
    return new Uint8Array(await readFile(join(dir, 'contents', ref)))
  }

  /** 载荷绝对路径（供平台 read_image 等直接读文件）。 */
  async payloadPath(cardId: string, ref: string): Promise<string> {
    if (!/^c\d+$/.test(ref)) throw new Error('内容引用不合法')
    const dir = await this.dirFor(cardId)
    if (dir === undefined) throw new Error('卡片不存在')
    return join(dir, 'contents', ref)
  }

  /** 载荷 SHA-256（交换包清单用）。 */
  async payloadSha256(cardId: string, ref: string): Promise<string> {
    const bytes = await this.readPayload(cardId, ref)
    return createHash('sha256').update(bytes).digest('hex')
  }

  /** 校验并落一份新卡（导入/建卡用）：写 head r1，目录按卡名分配。 */
  async saveNew(document: ContentDocument, source: ChangeSource): Promise<SavedCard> {
    assertValid(document)
    return withCard(document.id, async () => {
      const dir = await this.allocateDir(document.name)
      return this.writeNewHead(dir, document, source)
    })
  }

  /**
   * 一次性建卡（宏通道）：先按卡名分配目录，回调用 receive 把载荷写进它的
   * contents/ 并产出整卡文档，校验通过后写 head r1。回调或校验失败时清掉
   * 整个目录——建卡失败不落半个目录。
   * @param name - 卡名（决定目录名）。
   * @param source - 编辑来源。
   * @param build - 产出整卡文档；receive 返回载荷引用（c1、c2…）。
   */
  async create(name: string, source: ChangeSource, build: (receive: (bytes: Uint8Array) => Promise<string>) => Promise<ContentDocument>): Promise<SavedCard> {
    const dir = await this.allocateDir(name)
    const contents = join(dir, 'contents')
    await mkdir(contents, { recursive: true })
    let counter = 0
    const receive = async (bytes: Uint8Array): Promise<string> => {
      counter += 1
      const ref = `c${String(counter)}`
      await writeFileAtomic(join(contents, ref), bytes)
      return ref
    }
    let document: ContentDocument
    try {
      document = await build(receive)
      assertValid(document)
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      throw error
    }
    return withCard(document.id, async () => this.writeNewHead(dir, document, source))
  }

  /** 写新卡 head r1 并登记索引；调用方须持有该卡串行链。 */
  private async writeNewHead(dir: string, document: ContentDocument, source: ChangeSource): Promise<SavedCard> {
    this.index?.set(document.id, basename(dir))
    const head: HeadFile = { revision: 1, seq: 2, source, document }
    await mkdir(join(dir, 'revisions'), { recursive: true })
    await mkdir(join(dir, 'contents'), { recursive: true })
    await writeFileAtomic(join(dir, 'revisions', 'r1.json'), `${JSON.stringify(head, null, 2)}\n`)
    await writeFileAtomic(join(dir, 'card.json'), `${JSON.stringify(head, null, 2)}\n`)
    return { cardId: document.id, revision: 1, version: 'v2', document, source }
  }

  /**
   * 跨项目搬家：整目录移到目标工作区的 `卡/`，载荷、修订快照、草稿、
   * 撤销游标原样随行——同一张卡换项目，不是复制出新卡。
   * @param cardId - 要搬的卡。
   * @param targetRoot - 目标项目根；目标已有同编号卡时报错，不合并。
   */
  async moveTo(cardId: string, targetRoot: string): Promise<void> {
    if (targetRoot === this.projectRoot) throw new Error('卡已在这个项目里')
    return withCard(cardId, async () => {
      const src = await this.dirFor(cardId)
      if (src === undefined || await this.open(cardId) === undefined) throw new Error('unknown card')
      const target = new CardStore(targetRoot)
      if (await target.dirFor(cardId) !== undefined) throw new Error('目标项目已有同编号卡')
      const dstDir = cardsRoot(targetRoot)
      await mkdir(dstDir, { recursive: true })
      const dst = join(dstDir, await uniqueDirName(dstDir, basename(src)))
      try {
        await rename(src, dst)
      } catch {
        // rename 跨设备失败时退回复制 + 删除；内容不可变所以逐文件复制是安全的。
        await copyTree(src, dst)
        await rm(src, { recursive: true, force: true })
      }
      this.index?.delete(cardId)
    })
  }

  /** 新卡目录分配：`卡/<净化卡名>`，撞名自动加序。 */
  private async allocateDir(name: string): Promise<string> {
    const parent = cardsRoot(this.projectRoot)
    await mkdir(parent, { recursive: true })
    const taken = new Set(await readdir(parent).catch(() => [] as string[]))
    return join(parent, await uniqueDirName(parent, sanitizeDirName(name), taken))
  }

  /** 卡名变化后把目录改名跟随（提交路径内调用，目录名与卡名保持同向）。 */
  private async syncDirName(cardId: string, dir: string, name: string): Promise<void> {
    const wanted = sanitizeDirName(name)
    if (basename(dir) === wanted) return
    const parent = cardsRoot(this.projectRoot)
    const taken = new Set((await readdir(parent).catch(() => [] as string[])).filter(n => n !== basename(dir)))
    const target = join(parent, await uniqueDirName(parent, wanted, taken))
    try {
      await rename(dir, target)
      this.index?.set(cardId, basename(target))
    } catch { /* 目录被占用（Finder 打开等）——下次扫描时按目录名接管 */ }
  }
}

/** 版本冲突：显式传入的草稿版本已过期（只出现在导入确认这类"确认某一版"的流程）。 */
export class DraftConflict extends Error {
  constructor(readonly currentVersion: string) {
    super(`版本已变化（当前 ${currentVersion}），请重新 read_card 后再修改`)
    this.name = 'DraftConflict'
  }
}

/** 编辑冲突：同一个文字块在读取之后被别人改过。只拦这一个块，卡里其他模块不受影响。 */
export class EditConflict extends Error {
  constructor(message: string, readonly moduleId?: string, readonly blockId?: string) {
    super(message)
    this.name = 'EditConflict'
  }
}

/** 临时文件 + 改名，落盘原子。 */
async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = `${path}.noven-tmp`
  await writeFile(temp, data)
  await rename(temp, path)
}

/** 整目录复制（moveTo 的跨设备回退路径）。 */
async function copyTree(src: string, dst: string): Promise<void> {
  await cp(src, dst, { recursive: true })
}
