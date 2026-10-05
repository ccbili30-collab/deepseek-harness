/**
 * 实体库的"读-改-写"串行链：消化派发、实体工具、pane 人工操作可能
 * 同时改 entities.json，同 root 的调用排队执行避免互相覆盖。
 * @module noven-sidecar/shared
 */
import type { SidecarData } from './model.ts'
import { SidecarStore } from './store.ts'

const chains = new Map<string, Promise<unknown>>()

/**
 * 对一个 workspace 的实体库做一次"读-改-写"，同一 root 的调用排队执行。
 * @param root - workspace 目录。
 * @param mutate - 拿到刚 load 出来的 data，就地改；返回值作为调用结果。
 */
export async function withEntityStore<T>(root: string, mutate: (data: SidecarData) => T | Promise<T>): Promise<T> {
  const prev = chains.get(root) ?? Promise.resolve()
  const run = prev.then(async () => {
    const store = new SidecarStore(root)
    const data = store.load()
    const result = await mutate(data)
    store.save(data)
    return result
  })
  chains.set(root, run.catch(() => {}))
  return run
}
