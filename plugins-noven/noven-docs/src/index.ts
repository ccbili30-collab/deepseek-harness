/**
 * noven-docs — 软件内置手册。随产品发行的 docs/ 文档集加一个 help 工具：
 * 不传 topic 回目录，传 topic 回对应文档全文。文档跟代码同版本发行，
 * 内容可以直接转述给用户；不写进常驻上下文，模型按需取。
 * @module noven-docs
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'noven-docs'
export const inject = ['tools']

const DOCS_DIR = fileURLToPath(new URL('../docs/', import.meta.url))

/** 任何可落 JSON 的值（工具返回值契约）。 */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const RESULT_SCHEMA = { type: 'object' as const, additionalProperties: true as const }

/** 模型面的结果就是结构化值的 JSON。 */
function render(_args: unknown, value: JsonValue): { type: 'text', text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

/** 一篇手册文档的目录条目；tests/docs-check.mjs 校验 TOPICS 与 docs/ 文件一一对应。 */
interface Topic {
  /** help 工具的 topic 参数值。 */
  readonly slug: string
  /** docs/ 下的文件名。 */
  readonly file: string
  /** 一句话说明，出现在目录里供模型挑主题。 */
  readonly summary: string
}

export const TOPICS: readonly Topic[] = [
  { slug: 'overview', file: 'overview.md', summary: '产品心智模型：项目、卡、挂载、工作台、创作库、设定管理员，东西都存在哪' },
  { slug: 'cards', file: 'cards.md', summary: '制卡工作流：建卡、模块树、版本接力、正文分页、导入导出' },
  { slug: 'projects', file: 'projects.md', summary: '项目与挂载：多项目、引用卡、跨项目读写、搬卡、绑定与权限' },
  { slug: 'workbench', file: 'workbench.md', summary: '工作台与创作库：把成果摆进侧栏、登记作品、阶段与历史版本' },
  { slug: 'sidecar', file: 'sidecar.md', summary: '设定管理员：每项目的常驻设定整理会话、实体库与草稿确认' },
  { slug: 'creation', file: 'creation.md', summary: '创作辅助：生图、交互地图、漫画、资料学习、内置技能' },
  { slug: 'troubleshooting', file: 'troubleshooting.md', summary: '排查与自愈：卡不存在、版本冲突、挂载异常时的诊断顺序' },
]

/** Register the help tool. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'help',
    description: '查阅本软件的内置手册。用户问「怎么用/这是什么功能」，或你不确定某个功能怎么工作时，先查这里再回答——别凭印象。不传 topic 返回目录，传 topic 返回对应文档全文，内容可以直接转述给用户。',
    parameters: {
      topic: { type: 'string' as const, description: '文档主题标识，取值见目录返回的 slug 列表' },
    },
    output: { schema: RESULT_SCHEMA, render },
    async execute(args): Promise<Record<string, JsonValue>> {
      if (args.topic === undefined) {
        return {
          status: 'index',
          topics: TOPICS.map(t => ({ slug: t.slug, summary: t.summary })),
          usage: 'help({ topic: "<slug>" }) 读对应文档全文',
        }
      }
      const topic = TOPICS.find(t => t.slug === args.topic)
      if (topic === undefined) {
        throw new Error(`没有这个主题：${String(args.topic)}。可选：${TOPICS.map(t => t.slug).join(' / ')}`)
      }
      const text = await readFile(join(DOCS_DIR, topic.file), 'utf8')
      return { status: 'doc', topic: topic.slug, content: text }
    },
  }))
}
