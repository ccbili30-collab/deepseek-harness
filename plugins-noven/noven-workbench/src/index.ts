/**
 * noven-workbench — the workbench registration family and the image anchor,
 * ported from the legacy CreatX workbench/image-runtime packages onto plain
 * project files: registry state lives in `.noven/workbenches.json`, and the
 * anchor inserts a Markdown image reference into a document.
 * @module noven-workbench
 */

import { dirname, relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import { loadRegistry, mintId, saveRegistry, underRoot } from './registry.ts'
import type { WorkbenchRecord } from './registry.ts'

export const name = 'noven-workbench'
export const inject = ['tools']

/** Session cwd for one tool execution. */
function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

const HAND_EDIT_WARNING
  = 'Registry state lives in .noven/workbenches.json; never read or edit it by hand — use these tools.'

const REGISTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    folder: { type: 'string' },
    home: { type: 'string' },
    visible: { type: 'boolean' },
    count: { type: 'integer' },
  },
} as const

/** Throw with a stable message when an id does not resolve. */
function byId(registry: { workbenches: WorkbenchRecord[] }, id: string): WorkbenchRecord {
  const record = registry.workbenches.find(w => w.id === id)
  if (record === undefined) throw new Error(`unknown workbench id: ${id}（先 register_workbench）`)
  return record
}

/** Register the seven ported tools. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'register_workbench',
    description: `把项目内一个目录注册为工作台（侧栏可浏览的成果区）。${HAND_EDIT_WARNING}`,
    parameters: {
      title: { type: 'string', required: true, description: '工作台显示名，如「研究」「地图」。' },
      folder: { type: 'string', required: true, description: '工作台对应的目录（相对项目根）。' },
      home: { type: 'string', description: '打开工作台时首先展示的文件（相对该目录）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record: WorkbenchRecord = {
        id: mintId(args.title),
        title: args.title,
        folder: args.folder,
        ...(args.home !== undefined ? { home: args.home } : {}),
        visible: true,
      }
      registry.workbenches.push(record)
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rename_workbench',
    description: '修改一个已注册工作台的显示名。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      title: { type: 'string', required: true, description: '新的显示名。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      record.title = args.title
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'unregister_workbench',
    description: '注销一个工作台（只删注册记录，不删目录与文件）。',
    parameters: { id: { type: 'string', required: true, description: '工作台 id。' } },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      registry.workbenches = registry.workbenches.filter(w => w.id !== args.id)
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_workbench_home',
    description: '设置工作台打开时首先展示的文件。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      path: { type: 'string', required: true, description: '首页文件（相对工作台目录）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      record.home = args.path
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'set_workbench_visibility',
    description: '显示或隐藏一个工作台（隐藏不注销）。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      visible: { type: 'boolean', required: true, description: 'true 显示 / false 隐藏。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      record.visible = args.visible
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'show_in_workbench',
    description: '把一个文件置顶到工作台（记录为 pinned，供面板优先展示）。',
    parameters: {
      id: { type: 'string', required: true, description: '工作台 id。' },
      path: { type: 'string', required: true, description: '要展示的文件（相对项目根）。' },
    },
    output: { schema: REGISTRY_SCHEMA, render: (_args, value) => [{ type: 'text', text: `工作台已更新：${String((value as { title?: string }).title ?? '')}` }] },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const registry = await loadRegistry(root)
      const record = byId(registry, args.id)
      const pinned = [...(record.pinned ?? []).filter(p => p !== args.path), args.path]
      record.pinned = pinned.slice(-16)
      await saveRegistry(root, registry)
      return { ...record, count: registry.workbenches.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'attach_image_to_document',
    description: '把项目内一张图片以 Markdown 引用插入一篇文档：默认追加到文末；给 anchor 时插到该标题之后。',
    parameters: {
      image_path: { type: 'string', required: true, description: '图片路径（相对项目根）。' },
      document_path: { type: 'string', required: true, description: 'Markdown 文档路径（相对项目根）。' },
      anchor: { type: 'string', description: '锚点标题文本（不含 #）；缺省则追加到文末。' },
      alt: { type: 'string', description: '图片替代文本，默认用文件名。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          document_path: { type: 'string' },
          image_ref: { type: 'string' },
          line: { type: 'integer' },
        },
      },
      render: (_args: unknown, value: unknown) => {
        const record = (value ?? {}) as Record<string, unknown>
        return [{ type: 'text', text: `图片已插入：${String(record.document_path ?? '')}` }]
      },
    },
    async execute(args, exec) {
      const root = sessionCwd(exec)
      const documentPath = underRoot(root, args.document_path)
      const imagePath = underRoot(root, args.image_path)
      const { readFile, writeFile } = await import('node:fs/promises')
      const documentDir = dirname(documentPath)
      const ref = relative(documentDir, imagePath).replaceAll('\\', '/')
      const altText = (args.alt ?? '').trim()
      const alt = altText.length > 0 ? altText : args.image_path
      const line = `![${alt}](${ref})`
      const text = await readFile(documentPath, 'utf8')
      const lines = text.split('\n')
      let insertAt = lines.length
      if (args.anchor !== undefined && args.anchor.trim().length > 0) {
        const needle = args.anchor.trim()
        const index = lines.findIndex(candidate => /^#{1,6}\s+/u.test(candidate) && candidate.replace(/^#{1,6}\s+/u, '').trim() === needle)
        if (index >= 0) insertAt = index + 1
      }
      lines.splice(insertAt, 0, '', line)
      await writeFile(documentPath, lines.join('\n'))
      return { document_path: args.document_path, image_ref: line, line: insertAt + 1 }
    },
  }))
}
