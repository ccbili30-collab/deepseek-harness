/**
 * 内容树的本地快照缓存（设计理念 §14 的冷层）。
 *
 * 内存温层（tree-api.ts 的 byScope）只活在当前页面里，刷新即失，所以刷新后
 * 抽屉要再等一次 `/api/noven-tree` 往返才有内容。这里把每个项目根最近一份树
 * 快照放进 localStorage，按项目根存取：
 *  - 数据不是图片：存的是 JSON（树本身就是 JSON），每个项目一条记录；
 *  - 项目被移出（unregister）或其内容树删除时显式清掉，不残留；
 *  - 只作「回来时的第一眼」，后台轮询拿到新树后立刻覆盖；
 *  - 带版本号，结构不兼容时整条作废。
 */
import type { NovenTree } from './tree-api.ts'

/** localStorage 记录版本；NovenTree 结构不兼容时升级并自然丢弃旧记录。 */
const VERSION = 1
/** 单条树快照上限（树是压缩后的导航数据，2MB 足够；超出宁可不留也不撑爆存储）。 */
const MAX_ENTRY_BYTES = 2 * 1024 * 1024
/** 最多保留多少个项目的快照（LRU：最近访问在前）。 */
const MAX_PROJECTS = 40
const PREFIX = 'noven.tree.v'
const INDEX_KEY = `${PREFIX}${VERSION}.index`

interface CachedEntry {
  /** 项目根（缓存键）。 */
  readonly root: string
  /** 树快照。 */
  readonly tree: NovenTree
  /** 写入时的时间戳，用于 LRU。 */
  readonly at: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storeOf(store?: Store | null): Store | null {
  if (store !== undefined) return store
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function safeParse(raw: string | null): CachedEntry | undefined {
  if (raw === null) return undefined
  try {
    const value = JSON.parse(raw) as Partial<CachedEntry>
    if (typeof value?.root === 'string' && value.tree !== undefined && typeof value.at === 'number') {
      return { root: value.root, tree: value.tree as NovenTree, at: value.at }
    }
  } catch {
    // Corrupt record — treated as absent and overwritten on next save.
  }
  return undefined
}

/** Read the LRU index of cached project roots, most recently used first. */
function readIndex(store: Store): string[] {
  try {
    const value = JSON.parse(store.getItem(INDEX_KEY) ?? '[]') as unknown
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value as string[] : []
  } catch {
    return []
  }
}

function writeIndex(store: Store, roots: readonly string[]): void {
  try { store.setItem(INDEX_KEY, JSON.stringify(roots)) } catch { /* quota — reads still work */ }
}

/**
 * Read one project's cached tree.
 * @param root - project root.
 * @param store - storage override for tests.
 * @returns the cached snapshot, or undefined when absent.
 */
export function readCachedTree(root: string, store?: Store | null): NovenTree | undefined {
  const s = storeOf(store)
  if (s === null || root === '') return undefined
  return safeParse(s.getItem(`${PREFIX}${VERSION}:${root}`))?.tree
}

/**
 * Persist one project's latest tree and move it to the front of the LRU index.
 * Oversized or quota-failing writes are skipped silently — the cache is a
 * convenience, never a failure path.
 * @param root - project root.
 * @param tree - latest tree snapshot.
 * @param store - storage override for tests.
 */
export function writeCachedTree(root: string, tree: NovenTree, store?: Store | null): void {
  const s = storeOf(store)
  if (s === null || root === '') return
  const entry: CachedEntry = { root, tree, at: Date.now() }
  let serialized: string
  try { serialized = JSON.stringify(entry) } catch { return }
  if (serialized.length > MAX_ENTRY_BYTES) return
  const index = [root, ...readIndex(s).filter(item => item !== root)]
  try {
    s.setItem(`${PREFIX}${VERSION}:${root}`, serialized)
  } catch {
    return
  }
  // Evict least-recently-used projects when over the cap.
  while (index.length > MAX_PROJECTS) {
    const stale = index.pop()
    if (stale === undefined) break
    s.removeItem(`${PREFIX}${VERSION}:${stale}`)
  }
  writeIndex(s, index)
}

/**
 * Forget one project's cached tree (project unregistered/removed).
 * @param root - project root.
 * @param store - storage override for tests.
 */
export function forgetCachedTree(root: string, store?: Store | null): void {
  const s = storeOf(store)
  if (s === null || root === '') return
  s.removeItem(`${PREFIX}${VERSION}:${root}`)
  const index = readIndex(s).filter(item => item !== root)
  writeIndex(s, index)
}

/** Enumerate roots that currently have a cached snapshot (index order). */
export function cachedTreeRoots(store?: Store | null): string[] {
  const s = storeOf(store)
  return s === null ? [] : readIndex(s)
}
