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
}

/** 树里的一张卡：封面是 payload ref，`pending` 标记有挂起的 AI 提案。 */
export interface TreeCardRow {
  readonly cardId: string
  readonly name: string
  readonly kind: string
  readonly revision: number
  readonly pending: boolean
  readonly cover: string | null
  readonly modules: readonly TreeModuleRow[]
  readonly characters: readonly { readonly id: string; readonly name: string }[]
}

/** 树里的文稿行：`id` 为空表示文稿目录兜底扫到、未登记进作品清单。 */
export interface TreeDocRow {
  readonly id: string | null
  readonly path: string
  readonly title: string
  readonly mtime: number
}

/** 树里的作品行（kind 非 text 的登记作品）。 */
export interface TreeWorkRow {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly kind: string
  readonly mtime: number
}

/** `GET /api/noven-tree` 的完整载荷。 */
export interface NovenTree {
  readonly revision: string
  readonly cards: readonly TreeCardRow[]
  readonly docs: readonly TreeDocRow[]
  readonly works: readonly TreeWorkRow[]
  readonly files: { readonly count: number }
}

const POLL_MS = 2000

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
 * 一棵树的轮询源：首个订阅者到来时开始按 {@link POLL_MS} 轮询，最后一个
 * 退订即停。地址变了由调用方重建源（hook 绑定按源身份缓存，换源即重绑）。
 * @param addr - 会话或裸项目根；undefined 表示还没有项目，源停在 undefined。
 * @returns 可订阅快照加主动 refresh。
 */
export function novenTreeSource(addr: () => CardAddr | undefined): ObservableSnapshot<NovenTree | undefined> & { readonly refresh: () => void } {
  let snapshot: NovenTree | undefined
  let lastKey: string | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()
  const publish = (next: NovenTree | undefined): void => {
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) listener()
  }
  const poll = async (): Promise<void> => {
    const target = addr()
    const key = target === undefined ? undefined : api(target)
    // 地址换了或没了：上一份快照立刻作废——不留上一个项目的残影，
    // since token 也不跨项目带（不同项目同树撞哈希会假 304）。
    if (key !== lastKey) {
      lastKey = key
      publish(undefined)
    }
    if (target === undefined) return
    const next = await fetchNovenTree(target, snapshot?.revision)
    if (next === undefined || next === 'unchanged') return
    publish(next)
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
