/**
 * docs-check — 三道校验：
 * 1. TOPICS 目录与 docs/ 文件一一对应（每个条目有文件、每个文件有条目、无重复 slug）
 * 2. USER_TOPICS（面向用户的手册）同样一一对应，且用户文档不得泄露工具名——
 *    满篇 `create_card_bulk` 的说明是写给模型的，用户看不懂
 * 3. 工具名漂移：模型手册里每个反引号包着的 snake_case 标识符必须是兄弟插件
 *    源码里真实存在的工具名，或落在 PARAMS 白名单——防手册悄悄写错名
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

const MODEL_SRC = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
const USER_SRC = readFileSync(join(ROOT, 'src', 'routes.ts'), 'utf8')

// ── 模型手册（help 工具）──
const slugs = [...MODEL_SRC.matchAll(/slug: '([a-z-]+)'/g)].map(m => m[1])
const files = [...MODEL_SRC.matchAll(/file: '([a-z-]+\.md)'/g)].map(m => m[1])
const onDisk = readdirSync(DOCS).filter(n => n.endsWith('.md'))

check(slugs.length === new Set(slugs).size, 'model: slug 无重复')
check(slugs.length === files.length, `model: TOPICS 条目齐（${slugs.length}）`)
for (const [i, file] of files.entries()) {
  check(onDisk.includes(file), `model: ${slugs[i]} → docs/${file} 存在`)
  const text = readFileSync(join(DOCS, file), 'utf8')
  check(text.startsWith('# '), `model: ${file} 有标题`)
}
for (const name of onDisk) check(files.includes(name), `model: docs/${name} 在 TOPICS 有条目`)

// ── 用户手册（说明书页签）──
const userSlugs = [...USER_SRC.matchAll(/slug: '([a-z-]+)'/g)].map(m => m[1])
const userFiles = [...USER_SRC.matchAll(/file: '([a-z/-]+\.md)'/g)].map(m => m[1])
check(userSlugs.length === new Set(userSlugs).size, 'user: slug 无重复')
check(userSlugs.length === userFiles.length, `user: USER_TOPICS 条目齐（${userSlugs.length}）`)
for (const [i, file] of userFiles.entries()) {
  const path = join(DOCS, file)
  check(existsSync(path), `user: ${userSlugs[i]} → docs/${file} 存在`)
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  check(text.startsWith('# '), `user: ${file} 有标题`)
}

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
// 卡编辑器命令（write_markdown/adopt_image 等）：文档里以命令名出现，同属真实 API 词汇。
const editorSrc = readFileSync(join(PLUGINS, 'noven-cards/src/editor.ts'), 'utf8')
for (const m of editorSrc.matchAll(/kind: '([a-z_]+)'/g)) tools.add(m[1])
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
// 用户手册反过来：不得出现工具名（那是模型手册的语言）
for (const file of userFiles) {
  const path = join(DOCS, file)
  if (!existsSync(path)) continue
  const text = readFileSync(path, 'utf8')
  const backticked = [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1])
  for (const token of backticked) {
    if (tools.has(token) || COMMANDS.has(token) || SKILLS.has(token)) {
      check(false, `user:${file}：泄露了工具名 \`${token}\`——用户手册只说人话`)
    }
  }
}
console.log(`工具名面：${tools.size} 个真名在册`)
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
