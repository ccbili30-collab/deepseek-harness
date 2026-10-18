/**
 * presets-check — the shipped preset files must parse, instantiate, and carry
 * their sample content: module tree depth, collection schemas, seed rows,
 * timeline events, and image resources all land in the produced document.
 * Run after build: node tests/presets.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { loadPreset, buildPresetDocument } from '../lib/presets.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIR = join(ROOT, 'presets')

let failed = 0
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  if (!ok) failed += 1
}

const files = readdirSync(DIR).filter(name => name.endsWith('.json'))
check(files.length >= 5, `预设施文件在册（${files.length}）`)

let refSeq = 0
const io = {
  // 测试里正文引用直接回传文本，便于断言落盘内容；真实引用由 store 生成。
  writeText: async text => text,
  writePayload: async bytes => { refSeq += 1; return `bin-ref-${refSeq}:${bytes.length}` },
}

const collect = (modules, out = []) => {
  for (const module of modules) { out.push(module); collect(module.children, out) }
  return out
}

for (const file of files) {
  const id = file.replace(/\.json$/, '')
  const preset = await loadPreset(id)
  check(preset !== undefined, `${file}: 解析通过`)
  if (preset === undefined) continue
  check(preset.id === id, `${file}: id 与文件名一致`)
  const built = await buildPresetDocument(preset, preset.defaultName ?? '未命名', io)
  const all = collect(built.document.modules)
  check(all.length > 0, `${file}: 落出模块（${all.length}）`)
  check(new Set(all.map(m => m.id)).size === all.length, `${file}: 模块 id 唯一`)
  for (const module of all) {
    if (module.widget?.type === 'collection') {
      const block = module.blocks.find(b => b.kind === 'text')
      check(block !== undefined, `${file}/${module.name}: 集合有数据块`)
      const payload = JSON.parse(String(block?.content ?? '{}'))
      check(Array.isArray(payload.noven?.fields), `${file}/${module.name}: 集合列定义落盘`)
    }
    if (module.widget?.type === 'timeline') {
      check(module.blocks.length > 0, `${file}/${module.name}: 时间线有数据块`)
    }
  }
  if (id === 'world') {
    const fields = all.find(m => m.name === '势力名录')?.blocks[0]
    check(fields !== undefined, 'world: 势力名录存在')
    check(all.some(m => m.name === '时间线' && m.widget?.type === 'timeline'), 'world: 时间线模块存在')
    check(all.some(m => m.name === '地图' && m.widget?.type === 'map'), 'world: 地图模块存在')
  }
  if (id === 'character') {
    check(built.document.resources.length === 3, `character: 三张立绘资源落盘（${built.document.resources.length}）`)
    check(built.document.resources.every(r => r.mediaType === 'image/jpeg'), 'character: 资源媒体类型正确')
  }
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
