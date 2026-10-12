/**
 * 挂窗配对账本：`~/.noven/dock/<主线会话id>.json` → { dockId, forkAt }。
 * forkAt 是挂窗日志里 session/end-seed 的 seq——它之前的挂窗事件与主线
 * 共享（分叉继承的前缀），之后才是挂窗自己的内容；双向尾随的初始游标
 * 从它推。配对是内存索引 + 落盘备份，启动时整体载入。
 * @module noven-dock/ledger
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_HOME } from 'noven-ledger'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** 一条主线↔挂窗配对。 */
export interface DockPair {
  readonly dockId: SessionId
  /** 挂窗日志中 session/end-seed 的 seq——共享前缀的边界。 */
  readonly forkAt: number
}

const dir = (): string => join(APP_HOME, 'dock')
const file = (mainId: SessionId): string => join(dir(), `${mainId}.json`)

/** 读一条配对；缺文件或损坏返回 undefined。 */
export function loadPair(mainId: SessionId): DockPair | undefined {
  try {
    const raw = JSON.parse(readFileSync(file(mainId), 'utf8')) as Partial<DockPair>
    return typeof raw.dockId === 'string' && typeof raw.forkAt === 'number' && Number.isSafeInteger(raw.forkAt)
      ? { dockId: raw.dockId as SessionId, forkAt: raw.forkAt }
      : undefined
  } catch {
    return undefined
  }
}

/** 写一条配对（临时文件 + rename）。 */
export function savePair(mainId: SessionId, pair: DockPair): void {
  mkdirSync(dir(), { recursive: true })
  const tmp = `${file(mainId)}.tmp`
  writeFileSync(tmp, JSON.stringify(pair))
  renameSync(tmp, file(mainId))
}

/** 主线 id → 配对、挂窗 id → 主线 的双向索引，启动时从账本载入。 */
export class DockPairs {
  private readonly byMain = new Map<SessionId, DockPair>()
  private readonly byDock = new Map<SessionId, SessionId>()

  constructor() {
    let names: string[] = []
    try {
      names = readdirSync(dir()).filter(name => name.endsWith('.json'))
    } catch { /* 目录不存在 = 没有配对 */ }
    for (const name of names) {
      const mainId = name.slice(0, -5) as SessionId
      const pair = loadPair(mainId)
      if (pair !== undefined) this.add(mainId, pair)
    }
  }

  /** 记一条新配对，同时更新两个方向的索引。 */
  add(mainId: SessionId, pair: DockPair): void {
    this.byMain.set(mainId, pair)
    this.byDock.set(pair.dockId, mainId)
  }

  /** 忘掉一条配对（挂窗会话已不存在时重建前的清理）。 */
  drop(mainId: SessionId): void {
    const pair = this.byMain.get(mainId)
    if (pair !== undefined) this.byDock.delete(pair.dockId)
    this.byMain.delete(mainId)
  }

  /** 主线视角：这条会话有没有挂窗。 */
  dockOf(mainId: SessionId): DockPair | undefined {
    return this.byMain.get(mainId)
  }

  /** 挂窗视角：这条会话是谁的挂窗。 */
  mainOf(dockId: SessionId): { readonly main: SessionId; readonly pair: DockPair } | undefined {
    const main = this.byDock.get(dockId)
    const pair = main === undefined ? undefined : this.byMain.get(main)
    return main === undefined || pair === undefined ? undefined : { main, pair }
  }

  /** 在配对里扮演的角色；不在任何配对里返回 undefined。 */
  roleOf(sessionId: SessionId): { readonly role: 'main' | 'dock'; readonly pair: DockPair; readonly peer: SessionId } | undefined {
    const pair = this.byMain.get(sessionId)
    if (pair !== undefined) return { role: 'main', pair, peer: pair.dockId }
    const dock = this.mainOf(sessionId)
    return dock === undefined ? undefined : { role: 'dock', pair: dock.pair, peer: dock.main }
  }
}
