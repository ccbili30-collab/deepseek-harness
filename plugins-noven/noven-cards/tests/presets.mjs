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
  // 地图模块由完整 FMG 编辑器在打开时生成空白世界，预设不再写旧 MapData 块。
  const emptyLeaves = all.filter(m => m.children.length === 0 && m.blocks.length === 0 && m.widget?.type !== 'overview' && m.widget?.type !== 'map')
  check(emptyLeaves.length === 0, `${file}: 除总览外无空模块（${emptyLeaves.map(m => m.name).join('/') || '全部有内容'}）`)
  check(!JSON.stringify(built.document).match(/玄天大陆|沈青梧|玄天宗|血刀门|北境|东海|南疆/), `${file}: 不含测试世界/角色数据`)
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
    check(all.length === 3, `world: 概述 + 时间线 + 地图（${all.length}）`)
    const overview = all.find(module => module.name === '概述')
    check(overview?.widget?.type === 'overview', 'world: 概述是聚合页')
    const timeline = all.find(module => module.name === '时间线' && module.widget?.type === 'timeline')
    const timelinePayload = JSON.parse(String(timeline?.blocks[0]?.content ?? '{}'))
    check(timeline !== undefined && (timelinePayload.noven?.events?.length ?? 0) === 0, 'world: 时间线默认空白')
    const mapModule = all.find(module => module.name === '地图' && module.widget?.type === 'map')
    check(mapModule !== undefined, 'world: 默认带地图')
    check(!all.some(module => ['世界档案', '地理', '势力', '种族', '文化', '规则', '关系'].includes(module.name)), 'world: 领域模块不再预置')
    check(built.document.resources.length === 0, `world: 默认不带图片资源（${built.document.resources.length}）`)
  }
  if (id === 'character') {
    check(all.length === 3, `character: 基本信息 + 关系 + 行动轨迹（${all.length}）`)
    check(all.every(m => m.children.length === 0), 'character: 章节不再拆成子模块')
    check(built.document.resources.length === 0, `character: 默认不带图片资源（${built.document.resources.length}）`)
    const profile = all.find(m => m.name === '基本信息')
    const profileData = profile === undefined ? undefined : JSON.parse(String(profile.blocks[0]?.content ?? '{}'))
    check(profileData?.noven?.view === 'profile' && profileData?.noven?.presentation?.contract === 'profile', 'character: 基本信息使用档案视图并带契约')
    check((profileData?.items?.length ?? 0) === 0, 'character: 基本信息默认空白')
    check(profileData?.noven?.fields?.some(f => f.name === '性格关键词' && f.type === 'chips') === true, 'character: 性格关键词是 chips 字段')
    const graph = all.find(m => m.name === '关系')
    const graphData = graph === undefined ? undefined : JSON.parse(String(graph.blocks[0]?.content ?? '{}'))
    check(graphData?.noven?.view === 'graph' && (graphData?.items?.length ?? 0) === 0, 'character: 关系默认空白')
    const diary = all.find(m => m.name === '行动轨迹')
    const diaryData = diary === undefined ? undefined : JSON.parse(String(diary.blocks[0]?.content ?? '{}'))
    check(diaryData?.noven?.view === 'diary' && diaryData?.noven?.calendar?.unit === '岁', 'character: 行动轨迹是纵向日记')
    check(!all.some(module => ['多形态', '语录', '能力', '装备', '图集', '角色档案'].includes(module.name)), 'character: 领域模块不再预置')
  }
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
