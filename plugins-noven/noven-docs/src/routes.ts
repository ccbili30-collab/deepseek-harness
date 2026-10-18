/**
 * /api/noven-docs — the built-in manual's HTTP face for the app UI. GET
 * without a query returns the user-facing topic index; GET ?slug= returns
 * one document's Markdown. The model keeps its own `help` tool over the
 * full TOPICS set; this route serves the smaller user audience so tool
 * names never leak into screens meant for people.
 * @module noven-docs/routes
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'

const DOCS_DIR = fileURLToPath(new URL('../docs/', import.meta.url))

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
}

/** 一篇面向用户的手册文档；模型手册（docs/*.md）不经此路由。 */
export interface UserTopic {
  /** 已打开页签的稳定标识。 */
  readonly slug: string
  /** docs/ 下的相对路径。 */
  readonly file: string
  /** 页签标题与目录条目名。 */
  readonly title: string
  /** 一句话说明，出现在目录里。 */
  readonly summary: string
}

/** 用户可以翻阅的手册目录；tests/docs-check.mjs 校验它与文件一一对应。 */
export const USER_TOPICS: readonly UserTopic[] = [
  { slug: 'getting-started', file: 'user/getting-started.md', title: '新手使用说明', summary: '两个入口、卡是什么、东西都在哪——第一次打开先看这篇' },
]

/** Register the manual's read-only HTTP route. */
export function registerDocsRoutes(ctx: Context): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-docs',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    async fetch(request: Request): Promise<Response> {
      const slug = new URL(request.url).searchParams.get('slug')
      if (slug === null) {
        return new Response(JSON.stringify({
          topics: USER_TOPICS.map(topic => ({ slug: topic.slug, title: topic.title, summary: topic.summary })),
        }), { headers: JSON_HEADERS })
      }
      const topic = USER_TOPICS.find(candidate => candidate.slug === slug)
      if (topic === undefined) {
        return new Response(JSON.stringify({ error: `no such topic: ${slug}` }), { status: 404, headers: JSON_HEADERS })
      }
      const content = await readFile(join(DOCS_DIR, topic.file), 'utf8')
      return new Response(JSON.stringify({ slug: topic.slug, title: topic.title, content }), { headers: JSON_HEADERS })
    },
  }), 'noven-docs: /api/noven-docs')
}
