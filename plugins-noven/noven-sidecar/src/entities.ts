/**
 * 设定管理员的实体工具——preset 作用域里的 function plugin，只挂在
 * noven-sidecar preset 的会话上。工具直接落实体库（同一 SidecarStore，
 * 与消化派发、pane 人工操作串行），不再走"回复末行 ops:"的文本协议。
 * @module noven-sidecar/entities
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { applyOps } from './model.ts'
import { withEntityStore } from './shared.ts'

export const name = 'noven-sidecar-entities'
export const inject = ['tools']

/** 任何可落 JSON 的值（工具返回值契约）。 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const RESULT_SCHEMA = { type: 'object' as const, additionalProperties: true as const }

/** 模型面的结果就是结构化值的 JSON——实体清单、落库回执全靠它回传。 */
function render(_args: unknown, value: JsonValue): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 工具执行体的会话 cwd——实体库按项目目录分库。 */
function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

/** 工具执行体的当前会话 seq——实体记的是它出自哪一轮。 */
function sessionSeq(exec: { agent?: { session: { seq?: number } } }): number {
  return exec.agent?.session.seq ?? 0
}

const KIND_PARAM = {
  type: 'string' as const, required: true as const,
  enum: ['character', 'place', 'system', 'item', 'other'] as const,
  description: '实体类别：character 人物 / place 地点 / system 体系 / item 物品 / other 其他',
}

/** Register the admin's entity tools into the preset scope's tools layer. */
export function apply(ctx: Context): void {
  const tools = ctx.tools

  tools.register(defineTool({
    name: 'list_entities',
    description: '列出设定实体库的全部实体（名字、类别、一句话设定、草稿/已确认状态）与关系。',
    parameters: {},
    output: { schema: RESULT_SCHEMA, render },
    async execute(_args, exec) {
      const cwd = sessionCwd(exec)
      const rows = await withEntityStore(cwd, data => ({
        entities: data.entities.filter(e => e.status !== 'dismissed')
          .map(e => ({ id: e.id, kind: e.kind, name: e.name, note: e.note, status: e.status })),
        relations: data.relations.map(r => ({
          from: data.entities.find(e => e.id === r.from)?.name ?? r.from,
          to: data.entities.find(e => e.id === r.to)?.name ?? r.to,
          label: r.label,
        })),
      }))
      return { status: 'read', ...rows }
    },
  }))

  tools.register(defineTool({
    name: 'upsert_entity',
    description: '登记一个新实体（先进草稿，等作者确认），或给已有实体补充一句话设定。',
    parameters: {
      kind: KIND_PARAM,
      name: { type: 'string' as const, required: true as const, description: '实体名' },
      note: { type: 'string' as const, description: '一句话设定；同名实体已有时表示补充' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const result = await withEntityStore(sessionCwd(exec), data =>
        applyOps(data, [{ op: 'upsert', kind: String(args.kind), name: String(args.name), ...(args.note !== undefined ? { note: String(args.note) } : {}) }], sessionSeq(exec)))
      return { status: 'saved', applied: result.applied, touched: [...result.touched] }
    },
  }))

  tools.register(defineTool({
    name: 'note_entity',
    description: '改写一个已有实体的一句话设定。',
    parameters: {
      name: { type: 'string' as const, required: true as const, description: '已有实体名' },
      note: { type: 'string' as const, required: true as const, description: '改写后的一句话设定' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const result = await withEntityStore(sessionCwd(exec), data =>
        applyOps(data, [{ op: 'note', name: String(args.name), note: String(args.note) }], sessionSeq(exec)))
      if (result.applied === 0) throw new Error('没有这个名字的实体（先 list_entities）')
      return { status: 'saved', applied: result.applied, touched: [...result.touched] }
    },
  }))

  tools.register(defineTool({
    name: 'link_entities',
    description: '给两个已知实体记一条关系（如「师徒」「栖于」）。',
    parameters: {
      from: { type: 'string' as const, required: true as const, description: '关系起点的实体名' },
      to: { type: 'string' as const, required: true as const, description: '关系终点的实体名' },
      label: { type: 'string' as const, required: true as const, description: '关系名' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args, exec) {
      const result = await withEntityStore(sessionCwd(exec), data =>
        applyOps(data, [{ op: 'link', from: String(args.from), to: String(args.to), label: String(args.label) }], sessionSeq(exec)))
      if (result.applied === 0) throw new Error('关系没落成：两端必须是已知实体，且这条关系没记过')
      return { status: 'saved', applied: result.applied, touched: [...result.touched] }
    },
  }))
}
