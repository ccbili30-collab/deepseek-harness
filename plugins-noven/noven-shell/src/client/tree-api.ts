/**
 * `/api/noven-tree` 的客户端侧：聚合内容树的类型镜像与轮询数据源。
 * `since` 携带上一轮的 revision token，未变回 304 时源不重发 —— 快照
 * 引用保持不变，订阅者不会重渲。
 * @module noven-shell/client/tree-api
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CardAddr } from './card-api.ts'

/** 树里的一行模块：type 是 widget 渲染器名，普通文档模块为 'document'。 */
export interface TreeModuleRow {
  readonly id: string
  readonly name: string
  readonly type: string
  readonly children: readonly TreeModuleRow[]
  /** 注入去向；'STANDBY' = 已归档（待命，不进上下文）。 */
  readonly routing?: string
}

/** 树里的一张卡：封面是 payload ref，`pending` 标记有挂起的 AI 提案。
    `dir` 是卡目录相对 `卡/` 的路径（可含架层，如 `大包/白起`），
    `shelf` 是它的父架路径（'' = 卡/ 顶层）；`hidden` 来自呈现轴元数据。 */
export interface TreeCardRow {
  readonly cardId: string
  readonly name: string
  readonly kind: string
  readonly revision: number
  readonly pending: boolean
  /** 提案碰过的页面 scope（{targetId, moduleId} 对）；无提案时空数组。 */
  readonly pendingScopes?: readonly { readonly targetId: string; readonly moduleId: string }[]
  readonly cover: string | null
  readonly dir: string
  readonly shelf: string
  readonly hidden?: boolean
  readonly modules: readonly TreeModuleRow[]
  readonly characters: readonly { readonly id: string; readonly name: string }[]
}

/** 提案是否碰过某页：模块页按 moduleId 匹配；概览页（moduleId 为空）收卡层变更
    （moduleId === 卡 id）与无处可去的无头变更。与卡页 banner 的 pageHasProposal
    同一条归属规则——灯和 banner 不许各算各的。 */
export function pagePending(card: TreeCardRow, moduleId: string | undefined): boolean {
  const scopes = card.pendingScopes
  if (scopes === undefined || scopes.length === 0) return false
  if (moduleId !== undefined) return scopes.some(s => s.moduleId === moduleId)
  const moduleIds = new Set<string>()
  const walk = (rows: readonly TreeModuleRow[]): void => {
    for (const row of rows) { moduleIds.add(row.id); walk(row.children) }
  }
  walk(card.modules)
  const charIds = new Set(card.characters.map(c => c.id))
  return scopes.some(s => s.moduleId === card.cardId
    || (s.targetId === card.cardId && !moduleIds.has(s.moduleId) && !charIds.has(s.moduleId)))
}

/** 树里的文稿行：`id` 为空表示文稿目录兜底扫到、未登记进作品清单。 */
export interface TreeDocRow {
  readonly id: null | string
  readonly path: string
  readonly title: string
  readonly mtime: number
  readonly hidden?: boolean
}

/** 树里的作品行（kind 非 text 的登记作品）。 */
export interface TreeWorkRow {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly kind: string
  readonly mtime: number
  readonly hidden?: boolean
}

/** 分组/架层里的文件行：`dir` 标记这行其实是目录（隐藏目录的占位行）。 */
export interface TreeSectionRow {
  readonly path: string
  readonly title: string
  readonly mtime: number
  readonly dir?: boolean
  readonly hidden?: boolean
}

/** 用户分组（顶层目录即分组）：卡/、文稿/ 出现时表示该内置分组已建。
    卡/ 的 rows 收架层散件；文稿/ rows 恒空（行由 docs 字段给）。
    `hidden` 来自根目录呈现轴元数据。 */
export interface TreeSection {
  readonly name: string
  readonly rows: readonly TreeSectionRow[]
  readonly hidden?: boolean
}

/** `GET /api/noven-tree` 的完整载荷。 */
export interface NovenTree {
  readonly revision: string
  readonly cards: readonly TreeCardRow[]
  readonly docs: readonly TreeDocRow[]
  readonly works: readonly TreeWorkRow[]
  readonly sections: readonly TreeSection[]
  readonly files: { readonly count: number }
}

/**
 * 树的写面：`mkdir` 新建顶层分组目录，`rmdir` 连内容一起删（递归）。
 * @param addr - 会话或裸项目根。
 * @param op - 分组名校验、冲突（409）与不存在（404）由路由负责。
 * @returns 是否成功。
 */
export async function treeOp(addr: CardAddr, op: { readonly op: 'mkdir' | 'rmdir'; readonly name: string }): Promise<boolean> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  }).catch(() => undefined)
  return response?.ok === true
}

/** Outcome of a file-level tree write: refused ops carry the route's message. */
export interface FileOpResult {
  readonly ok: boolean
  /** HTTP status; 0 when the request never completed. */
  readonly status: number
  /** Route explanation for a refused op. */
  readonly error?: string
}

/**
 * 树的散文件写面：`rm` 删一个文件（目录会被拒），`rename` 原地改名
 * （name 是不含分隔符的新文件名）。卡/ 目录内部由 CardStore 独管，路由拒收。
 * @param addr - 会话或裸项目根。
 * @param op - path 的项目相对路径校验与冲突由路由负责。
 * @returns ok 与 HTTP 状态；拒绝时带服务端原文（404 = 文件已不在）。
 */
export async function fileOp(addr: CardAddr, op: { readonly op: 'rm' | 'rename'; readonly path: string; readonly name?: string }): Promise<FileOpResult> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  }).catch(() => undefined)
  if (response === undefined) return { ok: false, status: 0 }
  if (response.ok) return { ok: true, status: response.status }
  const error = await response.text()
  return { ok: false, status: response.status, ...(error === '' ? {} : { error }) }
}

/**
 * 呈现轴写面：把节点标成 'hidden' 或恢复 'file'（缺省=按文件展示）。
 * 元数据落在父目录的 `.noven.json`，跟着目录走。
 * @param addr - 会话或裸项目根。
 * @param path - 项目相对路径；卡目录内部的节点会被路由拒收。
 * @param view - 'hidden' 隐藏 / 'file' 恢复默认展示。
 * @returns 是否成功。
 */
export async function presentNode(addr: CardAddr, path: string, view: 'hidden' | 'file'): Promise<boolean> {
  const response = await fetch(api(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'present', path, view }),
  }).catch(() => undefined)
  return response?.ok === true
}

/** `/api/noven-import` 的分析报告（只拆报不消化）。 */
export interface ImportReport {
  readonly kind: 'single' | 'pack' | 'file'
  readonly cards: readonly { readonly name: string; readonly cardKind: string; readonly from: string }[]
  readonly files: readonly { readonly path: string; readonly size: number }[]
  readonly suggestion: string
}

/** commit 落位报告里的一件：path 是项目相对落点，live=false 表示成了裸卡目录。 */
export interface ImportLanded {
  readonly type: 'card' | 'file'
  readonly name: string
  readonly path: string
  readonly live?: boolean
  readonly cardId?: string
}

const importApi = (addr: CardAddr): string => addr.sessionId !== undefined
  ? `/api/noven-import?session=${encodeURIComponent(addr.sessionId)}`
  : `/api/noven-import?root=${encodeURIComponent(addr.root ?? '')}`

const postImport = async (addr: CardAddr, body: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(importApi(addr), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  return (await response.json()) as unknown
}

/**
 * 分析一个待导入文件：认出卡形/散件清单，不落盘。
 * @param addr - 会话或裸项目根。
 * @param name - 文件名。
 * @param file - 文件字节（base64）。
 * @returns 报告；请求失败返回 undefined。
 */
export async function importAnalyze(addr: CardAddr, name: string, file: string): Promise<ImportReport | undefined> {
  const body = await postImport(addr, { op: 'analyze', name, file })
  return body === undefined ? undefined : body as ImportReport
}

/**
 * 按落点落位：单卡走活卡直通道；包展成文档架（认出卡形的落成卡目录
 * 挪进落点，散件原样写文件）。
 * @param addr - 会话或裸项目根。
 * @param name - 原文件名。
 * @param file - 文件字节（base64）。
 * @param target - 项目相对落点目录（'' = 项目根）。
 * @returns 落位清单；请求失败返回 undefined。
 */
export async function importCommit(addr: CardAddr, name: string, file: string, target: string): Promise<{ landed: readonly ImportLanded[]; skipped?: readonly string[] } | undefined> {
  const body = await postImport(addr, { op: 'commit', name, file, target })
  return body === undefined ? undefined : body as { landed: readonly ImportLanded[], skipped?: readonly string[] }
}

const POLL_MS = 2000

/**
 * Cold-layer bridge: the in-session cache forgets everything on reload, so a
 * page reload would wait for a fresh round-trip before showing the drawer.
 * These hooks are assigned by the shell (tree-cache.ts reads/writes
 * localStorage); the source stays storage-agnostic for tests.
 */
let coldRead: ((scope: string) => unknown) | undefined
let coldWrite: ((scope: string, tree: NovenTree) => void) | undefined

/** Wire the persistent tree cache in (called once from the shell). */
export function bindTreeColdCache(hooks: {
  readonly read?: (scope: string) => unknown
  readonly write?: (scope: string, tree: NovenTree) => void
}): void {
  coldRead = hooks.read
  coldWrite = hooks.write
}

const api = (addr: CardAddr): string => addr.sessionId !== undefined
  ? `/api/noven-tree?session=${encodeURIComponent(addr.sessionId)}`
  : `/api/noven-tree?root=${encodeURIComponent(addr.root ?? '')}`

/**
 * 拉一次树；`since` 与远端 token 相同返回 'unchanged'，路由缺失或请求
 * 失败返回 undefined（订阅者保留上一份快照）。
 * @param addr - 会话或裸项目根。
 * @param since - 上一轮拿到的 revision token。
 * @returns 新树、'unchanged' 或 undefined。
 */
export async function fetchNovenTree(addr: CardAddr, since?: string): Promise<NovenTree | 'unchanged' | undefined> {
  const url = since === undefined ? api(addr) : `${api(addr)}&since=${encodeURIComponent(since)}`
  const response = await fetch(url).catch(() => undefined)
  if (response === undefined) return undefined
  if (response.status === 304) return 'unchanged'
  if (!response.ok) return undefined
  return (await response.json()) as NovenTree
}

/**
 * 内容树轮询源，按项目留快照（设计理念 §14）：首个订阅者到来时开始按
 * {@link POLL_MS} 轮询，最后一个退订即停。切到另一个项目时立刻发布那个
 * 项目上次的快照（没有才是 undefined），再后台轮询覆盖——不清屏、不串项目。
 * @param addr - 当前要看的项目地址（请求用）；`scope` 是它的留存键（项目根优先）；undefined 表示还没有项目。
 * @returns 可订阅快照 + 手动刷新。
 */
export function novenTreeSource(addr: () => (CardAddr & { readonly scope?: string }) | undefined): ObservableSnapshot<NovenTree | undefined> & { readonly refresh: () => void } {
  let snapshot: NovenTree | undefined
  let lastKey: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  /** 每个项目最近一份树；since token 只在同项目内带，不同项目同树撞哈希不会假 304。 */
  const byScope = new Map<string, NovenTree>()
  const listeners = new Set<() => void>()
  const publish = (next: NovenTree | undefined): void => {
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const poll = async (): Promise<void> => {
    const target = addr()
    const key = target === undefined ? undefined : target.scope ?? api(target)
    if (key !== lastKey) {
      lastKey = key
      // Cold layer first: after a reload the in-memory map is empty, so seed
      // the first paint from the persisted snapshot instead of showing an
      // empty drawer until the first round-trip lands.
      const cold = key === undefined ? undefined : byScope.get(key) ?? (coldRead?.(key) as NovenTree | undefined)
      publish(key === undefined ? undefined : cold)
    }
    if (target === undefined || key === undefined) return
    const next = await fetchNovenTree(target, byScope.get(key)?.revision)
    if (next === undefined || next === 'unchanged') return
    byScope.set(key, next)
    coldWrite?.(key, next)
    // 请求在飞期间可能已切走：只在仍是同一项目时发布。
    if (lastKey === key) publish(next)
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      if (timer === undefined) {
        void poll()
        timer = setInterval(() => { void poll() }, POLL_MS)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
    refresh: () => { void poll() },
  }
}
