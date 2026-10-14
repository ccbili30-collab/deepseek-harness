/**
 * Sidecar 的实体模型：消化循环与人工操作共用的 ops 词汇。
 * 实体是 proto-card——草稿态进列表，确认后可转正成卡。
 * @module noven-sidecar/model
 */

export type EntityKind = 'character' | 'place' | 'system' | 'item' | 'other'
export type EntityStatus = 'draft' | 'confirmed' | 'dismissed'

export interface SidecarEntity {
  readonly id: string
  readonly kind: EntityKind
  readonly name: string
  note: string
  status: EntityStatus
  /** 产出过该实体的会话 seq。 */
  readonly sourceSeqs: number[]
  updatedAt: string
}

export interface SidecarRelation {
  readonly from: string
  readonly to: string
  readonly label: string
}

/** `sidecar/entities.json`（账本内）的落盘形态。 */
export interface SidecarData {
  revision: number
  nextId: number
  /** 旧的 workspace 级自动整理开关（迁移来源）；新开关按会话存 sessionPaused。 */
  paused?: boolean
  /** 每个会话消化到哪个事件 seq。 */
  cursors: Record<string, number>
  /** 会话级自动整理开关（契约 C9）：true = 该会话的消化循环空转（攒了也丢）。 */
  sessionPaused?: Record<string, boolean>
  entities: SidecarEntity[]
  relations: SidecarRelation[]
}

export function emptySidecarData(): SidecarData {
  return { revision: 0, nextId: 1, cursors: {}, entities: [], relations: [] }
}

const KINDS: ReadonlySet<string> = new Set(['character', 'place', 'system', 'item', 'other'])

/** 模型输出的实体操作：名字寻址，应用时解析成 id。 */
export type EntityOp =
  | { readonly op: 'upsert'; readonly kind: string; readonly name: string; readonly note?: string }
  | { readonly op: 'note'; readonly name: string; readonly note: string }
  | { readonly op: 'link'; readonly from: string; readonly to: string; readonly label: string }

export interface ApplyResult {
  readonly applied: number
  readonly touched: readonly string[]
}

const byName = (data: SidecarData, name: string): SidecarEntity | undefined =>
  data.entities.find(e => e.status !== 'dismissed' && e.name === name)

/**
 * 应用一批模型 ops：upsert 不存在的实体落成 draft，note 覆盖描述，
 * link 只连接两个已知名。返回落进库的条数与被触碰的实体名。
 */
export function applyOps(data: SidecarData, ops: readonly EntityOp[], seq: number): ApplyResult {
  const touched = new Set<string>()
  let applied = 0
  const now = new Date().toISOString()
  for (const op of ops) {
    if (op.op === 'upsert') {
      const kind = KINDS.has(op.kind) ? op.kind as EntityKind : 'other'
      const name = op.name.trim()
      if (name.length === 0 || name.length > 60) continue
      const existing = byName(data, name)
      if (existing !== undefined) {
        if (op.note !== undefined && op.note.trim().length > 0 && op.note !== existing.note) {
          existing.note = op.note.trim()
          existing.updatedAt = now
        }
        if (!existing.sourceSeqs.includes(seq)) existing.sourceSeqs.push(seq)
        touched.add(name); applied++
        continue
      }
      data.entities.push({
        id: `e${data.nextId++}`, kind, name,
        note: op.note?.trim() ?? '', status: 'draft',
        sourceSeqs: [seq], updatedAt: now,
      })
      touched.add(name); applied++
      continue
    }
    if (op.op === 'note') {
      const target = byName(data, op.name.trim())
      const note = op.note.trim()
      if (target === undefined || note.length === 0 || note === target.note) continue
      target.note = note
      target.updatedAt = now
      if (!target.sourceSeqs.includes(seq)) target.sourceSeqs.push(seq)
      touched.add(target.name); applied++
      continue
    }
    if (op.op === 'link') {
      const from = byName(data, op.from.trim())
      const to = byName(data, op.to.trim())
      const label = op.label.trim()
      if (from === undefined || to === undefined || from === to || label.length === 0 || label.length > 30) continue
      if (data.relations.some(r => r.from === from.id && r.to === to.id && r.label === label)) continue
      data.relations.push({ from: from.id, to: to.id, label })
      touched.add(from.name); touched.add(to.name); applied++
    }
  }
  if (applied > 0) data.revision++
  return { applied, touched: [...touched] }
}
