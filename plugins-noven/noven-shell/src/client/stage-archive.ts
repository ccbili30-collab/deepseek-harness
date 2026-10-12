/**
 * 档案日志重放（r2 B6）：真相源是会话日志里锚定消息的 `novex-use` 信封；
 * `.stage.json` 只是可丢弃的开局种子/缓存。分叉隔离由日志天然提供——
 * PC 的 fork 只带祖先事件，兄弟分支的增量根本不进本会话事件流。
 * @module noven-shell/client/stage-archive
 */
import { renderBlocks } from './stage-artifacts.ts'

/** 帧 `deltas` 的窗口：最近 N 条增量（与 transcript 窗口同量级）。 */
export const DELTA_WINDOW = 50

/** 一条日志增量：锚定产生它的消息。 */
export interface StageDelta {
  /** 锚定消息 id：与 transcript 段的消息 id 同口径（PC = 事件 seq 字符串）。 */
  readonly messageId: string
  /** 事件序号：排序与分支截断的共同锚。 */
  readonly seq: number
  /** novex-use 信封的件名。 */
  readonly name: string
  /** 信封载荷（scene/hud/delta/events/fog/state 等自由字段）。 */
  readonly data: Record<string, unknown>
  readonly fullscreen: boolean
}

/** collectDeltas 的输入：转录消息（assistant 原文里含 novex-use 围栏）。 */
export interface DeltaMsgIn {
  readonly seq: number
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/**
 * 按事件序抽出 novex-use 增量——只收 assistant 消息（信封是模型产物）。
 * 同一条消息可带多个信封，按出现顺序展开。
 */
export function collectDeltas(messages: readonly DeltaMsgIn[]): StageDelta[] {
  const out: StageDelta[] = []
  for (const m of messages) {
    if (m.role !== 'assistant') continue
    for (const block of renderBlocks(m.text)) {
      if (block.type !== 'use' || block.use === undefined) continue
      out.push({ messageId: String(m.seq), seq: m.seq, name: block.use.name, data: block.use.data, fullscreen: block.use.fullscreen })
    }
  }
  return out
}

/** 物化后的档案：scene/fog 最新值，hud 浅并，实体按 domain+id 折叠，events 最新一轮。 */
export interface FoldedArchive {
  readonly scene?: string
  readonly hud: Record<string, unknown>
  /** domain（persons/armies/…）→ id → 字段集。 */
  readonly entities: Record<string, Record<string, Record<string, unknown>>>
  readonly fog?: Record<string, unknown>
  readonly events: readonly unknown[]
}

/** foldArchive 的种子：`.stage.json` 里的 archive/state（自由形）。 */
export interface ArchiveSeed {
  readonly archive?: unknown
  readonly state?: unknown
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** 从种子 archive 里认物化形（缺省/异形都按空起步——种子异形不当真相）。 */
function seedArchive(raw: unknown): { scene?: string; hud: Record<string, unknown>; entities: Record<string, Record<string, Record<string, unknown>>>; fog?: Record<string, unknown>; events: readonly unknown[] } {
  const base = isObj(raw) ? raw : {}
  const hud = isObj(base.hud) ? { ...base.hud } : {}
  const entities: Record<string, Record<string, Record<string, unknown>>> = {}
  if (isObj(base.entities)) {
    for (const [domain, rows] of Object.entries(base.entities)) {
      if (!isObj(rows)) continue
      entities[domain] = {}
      for (const [id, fields] of Object.entries(rows)) {
        if (isObj(fields)) entities[domain][id] = { ...fields }
      }
    }
  }
  const events = Array.isArray(base.events) ? base.events : []
  return {
    ...(typeof base.scene === 'string' ? { scene: base.scene } : {}),
    hud,
    entities,
    ...(isObj(base.fog) ? { fog: { ...base.fog } } : {}),
    events,
  }
}

/**
 * 在种子上按序折叠增量，产出当前 archive/state。
 * 合并语义 = **绝对值**（D4 拍板）：同 domain+id 的字段被信封值整体覆盖，
 * 不做相对加减——`"strength": -3000` 就是 -3000。相对值漏一条增量就无法
 * 自我纠正，绝对值重放永远收敛到日志真值。
 */
export function foldArchive(seed: ArchiveSeed, deltas: readonly StageDelta[]): { archive: FoldedArchive; state: Record<string, unknown> } {
  const acc = seedArchive(seed.archive)
  const state = isObj(seed.state) ? { ...seed.state } : {}
  for (const d of deltas) {
    const data = d.data
    if (typeof data.scene === 'string') acc.scene = data.scene
    if (isObj(data.hud)) Object.assign(acc.hud, data.hud)
    if (isObj(data.delta)) {
      for (const [domain, list] of Object.entries(data.delta)) {
        if (!Array.isArray(list)) continue
        const table = acc.entities[domain] ?? (acc.entities[domain] = {})
        for (const row of list) {
          if (!isObj(row) || typeof row.id !== 'string') continue
          const { id, ...fields } = row
          table[id] = { ...(table[id] ?? {}), ...fields }
        }
      }
    }
    if (isObj(data.fog)) acc.fog = { ...(acc.fog ?? {}), ...data.fog }
    if (Array.isArray(data.events)) acc.events = data.events
    if (isObj(data.state)) Object.assign(state, data.state)
  }
  return { archive: { ...acc, events: acc.events }, state }
}
