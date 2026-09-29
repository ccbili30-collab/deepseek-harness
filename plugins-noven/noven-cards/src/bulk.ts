/**
 * 宏通道树解析（CardBulk 的契约）：先整包校验、再原子落库——任何节点不
 * 合法一个字都不写，错误信息精确到 JSON 路径（modules[2].children[0].name）。
 * 上限：200 模块 / 4 层 / 单块 6 万字 / 总量 24 万字。
 * @module noven-cards/bulk
 */

import { randomUUID } from 'node:crypto'
import type { ContentBlock, ContentModule, ModuleRouting, ModuleTemporality } from './model.ts'

export interface BulkModuleNode {
  name: string
  text?: string
  children: BulkModuleNode[]
  routing?: ModuleRouting
  temporality?: ModuleTemporality
}

export const MAX_MODULES = 200
export const MAX_DEPTH = 4
export const MAX_TEXT_CHARS = 60_000
export const MAX_TOTAL_TEXT_CHARS = 240_000

const ROUTINGS: readonly ModuleRouting[] = ['DEFAULT', 'PER_TURN', 'STYLE', 'STANDBY']
const TEMPORALITIES: readonly ModuleTemporality[] = ['CONSTANT', 'SNAPSHOT']

function decodeEnum<T extends string>(raw: unknown, allowed: readonly T[], what: string): T {
  const value = typeof raw === 'string' ? raw.trim().toUpperCase() : raw
  const found = allowed.find(candidate => candidate === value)
  if (found === undefined) throw new Error(`${what} 无效：${String(raw)}`)
  return found
}

/**
 * 解析并整包校验一棵模块树（容忍数组被整体编码成字符串——模型/中转实测高
 * 发；真缺/真坏时报错附最小正确示例，照抄即对）。
 * @param raw - 工具参数里的 modules 值（数组或 JSON 字符串）。
 * @param key - 字段名（错误信息用）。
 */
export function parseBulkTree(raw: unknown, key: string): BulkModuleNode[] {
  const array: unknown = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? safeJsonParse(raw)
      : undefined
  if (!Array.isArray(array)) {
    throw new Error(`${key} 缺失或不是 JSON 数组（不要整体加引号）。正确形状：\"${key}\":[{\"name\":\"模块名\",\"text\":\"正文\"}]`)
  }
  const nodes = parseArray(array, key)
  const total = nodes.reduce((sum, node) => sum + textLength(node), 0)
  if (total > MAX_TOTAL_TEXT_CHARS) throw new Error(`${key} 正文总量 ${String(total)} 超过上限 ${String(MAX_TOTAL_TEXT_CHARS)}，请拆成多次 add_module_bulk`)
  return nodes
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function textLength(node: BulkModuleNode): number {
  return (node.text?.length ?? 0) + node.children.reduce((sum, child) => sum + textLength(child), 0)
}

function parseArray(array: readonly unknown[], path: string): BulkModuleNode[] {
  if (array.length === 0) throw new Error(`${path} 至少要有一个模块`)
  const out: BulkModuleNode[] = []
  let count = 0
  for (const [index, entry] of array.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${path}[${String(index)}] 不是对象`)
    const node = entry as Record<string, unknown>
    const name = typeof node.name === 'string' ? node.name.trim() : ''
    if (name.length === 0) throw new Error(`${path}[${String(index)}].name 不能为空`)
    if (name.length > 120) throw new Error(`${path}[${String(index)}].name 超过 120 字`)
    const text = typeof node.text === 'string' && node.text.trim().length > 0 ? node.text : undefined
    if (text !== undefined && text.length > MAX_TEXT_CHARS) throw new Error(`${path}[${String(index)}].text 超过 ${String(MAX_TEXT_CHARS)} 字，请拆分模块`)
    count += 1
    const children = Array.isArray(node.children) ? parseArray(node.children, `${path}[${String(index)}].children`) : []
    count += countNodes(children)
    const routing = node.routing !== undefined ? decodeEnum(node.routing, ROUTINGS, `${path}[${String(index)}].routing`) : undefined
    const temporality = node.temporality !== undefined ? decodeEnum(node.temporality, TEMPORALITIES, `${path}[${String(index)}].temporality`) : undefined
    out.push({ name, text, children, routing, temporality })
  }
  if (count > MAX_MODULES) throw new Error(`模块总数 ${String(count)} 超过上限 ${String(MAX_MODULES)}`)
  return out
}

function countNodes(nodes: readonly BulkModuleNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
}

/**
 * 把校验过的树构建为模块（编号 bulk- 前缀 + 随机盐——同卡多次宏操作不撞号，
 * 对话实测教训：确定性编号在第二次插入时与首次产物冲突）。
 * @param nodes - 校验过的节点树。
 * @param writeText - 正文落库回调。
 */
export async function buildBulkModules(
  nodes: readonly BulkModuleNode[],
  writeText: (text: string) => Promise<string>,
): Promise<{ modules: ContentModule[], createdModuleIds: string[], createdBlockIds: string[] }> {
  const salt = randomUUID().slice(0, 4)
  let counter = 0
  const createdModuleIds: string[] = []
  const createdBlockIds: string[] = []
  const build = async (items: readonly BulkModuleNode[], depth: number): Promise<ContentModule[]> => {
    if (depth > MAX_DEPTH) throw new Error(`模块嵌套超过 ${String(MAX_DEPTH)} 层（第 ${String(depth)} 层）`)
    const modules: ContentModule[] = []
    for (const node of items) {
      const index = counter++
      const id = `bulk-m${salt}-${String(index)}`
      createdModuleIds.push(id)
      let blocks: ContentBlock[] = []
      if (node.text !== undefined) {
        const blockId = `bulk-b${salt}-${String(index)}`
        createdBlockIds.push(blockId)
        blocks = [{ kind: 'text', id: blockId, content: await writeText(node.text) }]
      }
      modules.push({
        id,
        name: node.name,
        blocks,
        tags: [],
        children: node.children.length > 0 ? await build(node.children, depth + 1) : [],
        layout: 'VERTICAL',
        characterIds: [],
        ...(node.routing !== undefined ? { routing: node.routing } : {}),
        ...(node.temporality !== undefined ? { temporality: node.temporality } : {}),
      })
    }
    return modules
  }
  const modules = await build(nodes, 1)
  return { modules, createdModuleIds, createdBlockIds }
}
