/**
 * docs-check — 两道校验：
 * 1. TOPICS 目录与 docs/ 文件一一对应（每个条目有文件、每个文件有条目、无重复 slug）
 * 2. 工具名漂移：文档里每个反引号包着的 snake_case 标识符必须是兄弟插件源码里
 *    真实存在的工具名，或落在 PARAMS 白名单（参数名/字段名）——防手册悄悄写错名。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PLUGINS = join(ROOT, '..')
const DOCS = join(ROOT, 'docs')

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

const src = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
const slugs = [...src.matchAll(/slug: '([a-z-]+)'/g)].map(m => m[1])
const files = [...src.matchAll(/file: '([a-z-]+\.md)'/g)].map(m => m[1])
const onDisk = readdirSync(DOCS).filter(n => n.endsWith('.md'))

check(slugs.length === new Set(slugs).size, 'slug 无重复')
check(slugs.length === files.length, `TOPICS 条目齐（${slugs.length}）`)
for (const [i, file] of files.entries()) {
  check(onDisk.includes(file), `${slugs[i]} → docs/${file} 存在`)
  const text = readFileSync(join(DOCS, file), 'utf8')
  check(text.startsWith('# '), `${file} 有标题`)
}
for (const name of onDisk) check(files.includes(name), `docs/${name} 在 TOPICS 有条目`)

// ── 工具名漂移校验 ──
// 从各插件源码刮 `name: 'x'` / `registerEditTool(tools, 'x'` 真名
const TOOL_SOURCES = [
  'noven-cards/src/tools.ts',
  'noven-sidecar/src/entities.ts',
  'noven-workbench/src/index.ts',
  'noven-library/src/index.ts',
  'noven-image/src/index.ts',
]
const tools = new Set(['help'])
for (const rel of TOOL_SOURCES) {
  const text = readFileSync(join(PLUGINS, rel), 'utf8')
  for (const m of text.matchAll(/name: '([a-z_]+)'/g)) tools.add(m[1])
  for (const m of text.matchAll(/registerEditTool\(tools, '([a-z_]+)'/g)) tools.add(m[1])
}
// 命令与技能（name 是常量引用，源码里刮不到字面量）
const COMMANDS = new Set(['/draw-comic', '/study'])
const SKILLS = new Set(['noven-draw-comic', 'noven-study'])
// 文档里会出现的合法 snake_case 非工具标识符（参数名/字段名/概念名）
const PARAMS = new Set([
  'root_id', 'target_id', 'draft_version', 'next_draft_version', 'modules_json',
  'card_id', 'to_project', 'card_dir', 'project_root', 'per_turn', 'content_ref',
])

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/
for (const name of onDisk) {
  const text = readFileSync(join(DOCS, name), 'utf8')
  const backticked = [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1])
  for (const token of backticked) {
    if (tools.has(token) || COMMANDS.has(token) || SKILLS.has(token) || PARAMS.has(token)) continue
    if (!SNAKE.test(token)) continue // 单词、路径、文件名不是工具名候选
    check(false, `${name}：\`${token}\` 不是已知工具名/参数名（漂移？）`)
  }
}
console.log(`工具名面：${tools.size} 个真名在册`)
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
