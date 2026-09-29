/**
 * 卡片文件存储，ported from the mobile CardStore/CardDrafts (content-storage)
 * onto project-local files under `.noven/cards/`：
 *
 * ```
 * .noven/cards/<cardId>/
 *   card.json          ← head：{ revision, seq, document }
 *   draft.json         ← 草稿（无未保存编辑时不存在）
 *   contents/c1, c2…   ← 载荷（追加式，永不覆写；ContentRef 即文件名）
 *   revisions/r3.json  ← 每次提交的结构快照（载荷共享）
 *   deleted.json       ← 删除墓碑（软删除，卡可读回）
 * ```
 *
 * 版本即单调 seq：`v<seq>`。写操作必须带读取时的版本，冲突即拒（乐观锁）。
 * @module noven-cards/store
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertValid, type ContentDocument } from './model.ts'

/** 编辑来源：人工 / AI / 导入。 */
export type ChangeSource = 'HUMAN' | 'AI' | 'IMPORT'

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

/** 卡库根目录（项目内）。 */
export function cardsRoot(projectRoot: string): string {
  return join(projectRoot, '.noven', 'cards')
}

/** 保存卡目录布局。 */
interface HeadFile { revision: number, seq: number, source: ChangeSource, document: ContentDocument }
interface DraftFile { version: number, baseRevision: number, source: ChangeSource, document: ContentDocument }

/** 进程内按卡串行化：同一张卡的读改写不交错。 */
const chains = new Map<string, Promise<unknown>>()
function withCard<T>(cardId: string, work: () => Promise<T>): Promise<T> {
  const chain = chains.get(cardId) ?? Promise.resolve()
  const next = chain.then(work, work)
  chains.set(cardId, next.catch(() => {}))
  return next
}

export class CardStore {
  constructor(private readonly projectRoot: string) {}

  private dir(cardId: string): string {
    return join(cardsRoot(this.projectRoot), cardId)
  }

  /** 列出库内全部卡 id（不含已删除）。 */
  async list(): Promise<string[]> {
    try {
      const entries = await readdir(cardsRoot(this.projectRoot), { withFileTypes: true })
      const ids: string[] = []
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        ids.push(entry.name)
      }
      const existing: string[] = []
      for (const id of ids) {
        if (!await this.isDeleted(id)) existing.push(id)
      }
      return existing
    } catch {
      return []
    }
  }

  async isDeleted(cardId: string): Promise<boolean> {
    try {
      await readFile(join(this.dir(cardId), 'deleted.json'), 'utf8')
      return true
    } catch {
      return false
    }
  }

  /** 打开 head；不存在（或已删除）返回 undefined。 */
  async open(cardId: string): Promise<SavedCard | undefined> {
    if (await this.isDeleted(cardId)) return undefined
    try {
      const head = JSON.parse(await readFile(join(this.dir(cardId), 'card.json'), 'utf8')) as HeadFile
      return { cardId, revision: head.revision, version: `v${String(head.seq)}`, document: head.document, source: head.source }
    } catch {
      return undefined
    }
  }

  /** 读历史修订。 */
  async history(cardId: string, revision: number): Promise<SavedCard | undefined> {
    try {
      const snapshot = JSON.parse(await readFile(join(this.dir(cardId), 'revisions', `r${String(revision)}.json`), 'utf8')) as HeadFile
      return { cardId, revision: snapshot.revision, version: `v${String(snapshot.seq)}`, document: snapshot.document, source: snapshot.source }
    } catch {
      return undefined
    }
  }

  /** 读当前草稿（无草稿返回 undefined）。 */
  async draft(cardId: string): Promise<CardDraft | undefined> {
    try {
      const draft = JSON.parse(await readFile(join(this.dir(cardId), 'draft.json'), 'utf8')) as DraftFile
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
      }
      else {
        const head = await this.open(cardId)
        if (head === undefined) throw new Error('草稿不存在')
        base = { revision: head.revision, seq: Number(head.version.slice(1)), source: head.source, document: head.document }
      }
      const next: DraftFile = { version: base.seq, baseRevision: base.revision, source, document: base.document }
      await mkdir(join(this.dir(cardId), 'contents'), { recursive: true })
      await writeFileAtomic(join(this.dir(cardId), 'draft.json'), `${JSON.stringify(next, null, 2)}\n`)
      return { cardId, version: `v${String(next.version)}`, baseRevision: next.baseRevision, document: next.document, source: next.source }
    })
  }

  /**
   * 更新草稿（版本必须等于期望值）；返回新草稿。乐观锁在这里。
   * @param next - 变换后的整卡结构（已通过校验）。
   */
  async updateDraft(cardId: string, expectedVersion: string, next: ContentDocument, source: ChangeSource): Promise<CardDraft> {
    return withCard(cardId, async () => {
      const draft = await this.draft(cardId)
      if (draft === undefined) throw new Error('草稿不存在')
      if (draft.version !== expectedVersion) throw new DraftConflict(draft.version)
      const seq = Number(expectedVersion.slice(1)) + 1
      const file: DraftFile = { version: seq, baseRevision: draft.baseRevision, source, document: next }
      await writeFileAtomic(join(this.dir(cardId), 'draft.json'), `${JSON.stringify(file, null, 2)}\n`)
      return { cardId, version: `v${String(seq)}`, baseRevision: draft.baseRevision, document: next, source }
    })
  }

  /**
   * 提交草稿为正式修订（版本必须等于期望值）。写 revision 快照 + 更新 head。
   */
  async commit(cardId: string, expectedVersion: string): Promise<SavedCard> {
    return withCard(cardId, async () => {
      const draft = await this.draft(cardId)
      if (draft === undefined) throw new Error('草稿不存在')
      if (draft.version !== expectedVersion) throw new DraftConflict(draft.version)
      const seq = Number(expectedVersion.slice(1)) + 1
      const revision = draft.baseRevision + 1
      const head: HeadFile = { revision, seq, source: draft.source, document: draft.document }
      await mkdir(join(this.dir(cardId), 'revisions'), { recursive: true })
      await writeFileAtomic(join(this.dir(cardId), 'revisions', `r${String(revision)}.json`), `${JSON.stringify(head, null, 2)}\n`)
      await writeFileAtomic(join(this.dir(cardId), 'card.json'), `${JSON.stringify(head, null, 2)}\n`)
      await rm(join(this.dir(cardId), 'draft.json'), { force: true })
      return { cardId, revision, version: `v${String(seq)}`, document: head.document, source: head.source }
    })
  }

  /** 软删除（保留目录与历史，可读回）。 */
  async delete(cardId: string): Promise<void> {
    const head = await this.open(cardId)
    const revision = head?.revision ?? 0
    await mkdir(this.dir(cardId), { recursive: true })
    await writeFileAtomic(join(this.dir(cardId), 'deleted.json'), `${JSON.stringify({ revision, deletedAt: new Date().toISOString() }, null, 2)}\n`)
  }

  /** 新分配一个载荷文件名并写入字节（追加式，永不覆写）。 */
  async receivePayload(cardId: string, bytes: Uint8Array): Promise<string> {
    return withCard(cardId, async () => {
      const contents = join(this.dir(cardId), 'contents')
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
    return new Uint8Array(await readFile(join(this.dir(cardId), 'contents', ref)))
  }

  /** 载荷绝对路径（供平台 read_image 等直接读文件）。 */
  payloadPath(cardId: string, ref: string): string {
    if (!/^c\d+$/.test(ref)) throw new Error('内容引用不合法')
    return join(this.dir(cardId), 'contents', ref)
  }

  /** 载荷 SHA-256（交换包清单用）。 */
  async payloadSha256(cardId: string, ref: string): Promise<string> {
    const bytes = await this.readPayload(cardId, ref)
    return createHash('sha256').update(bytes).digest('hex')
  }

  /** 校验并落一份新卡（导入/建卡用）：写 head r1。 */
  async saveNew(document: ContentDocument, source: ChangeSource): Promise<SavedCard> {
    assertValid(document)
    return withCard(document.id, async () => {
      const head: HeadFile = { revision: 1, seq: 2, source, document }
      await mkdir(join(this.dir(document.id), 'revisions'), { recursive: true })
      await mkdir(join(this.dir(document.id), 'contents'), { recursive: true })
      await writeFileAtomic(join(this.dir(document.id), 'revisions', 'r1.json'), `${JSON.stringify(head, null, 2)}\n`)
      await writeFileAtomic(join(this.dir(document.id), 'card.json'), `${JSON.stringify(head, null, 2)}\n`)
      return { cardId: document.id, revision: 1, version: 'v2', document, source }
    })
  }
}

/** 版本冲突：读取时的草稿版本已过期。 */
export class DraftConflict extends Error {
  constructor(readonly currentVersion: string) {
    super(`版本已变化（当前 ${currentVersion}），请重新 read_card 后再修改`)
    this.name = 'DraftConflict'
  }
}

/** 临时文件 + 改名，落盘原子。 */
async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = `${path}.noven-tmp`
  await writeFile(temp, data)
  await rename(temp, path)
}
