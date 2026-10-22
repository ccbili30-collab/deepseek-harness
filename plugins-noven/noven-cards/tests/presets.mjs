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
    const payloadOf = name => {
      const module = all.find(candidate => candidate.name === name)
      return module === undefined ? undefined : JSON.parse(String(module.blocks[0]?.content ?? '{}'))
    }
    check(all.length === 10, `world: 九页内容 + 总览（${all.length}）`)
    const profile = payloadOf('世界档案')
    check(profile?.noven?.view === 'profile' && profile?.noven?.presentation?.contract === 'worldProfile', 'world: 世界档案带窗口契约')
    check((profile?.items?.length ?? 0) === 0, 'world: 世界档案默认空白')
    check(profile?.noven?.fields?.some(field => field.name === '世界类型') === true, 'world: 世界档案有世界类型字段')
    check(!profile?.noven?.fields?.some(field => ['年龄', '阵营', '出身', '性格关键词'].includes(field.name)), 'world: 世界档案不含角色字段')
    for (const [name, view, aspect] of [['地理', 'cards', 'landscape'], ['势力', 'cards', 'square'], ['种族', 'cards', 'portrait'], ['文化', 'cards', 'landscape']]) {
      const payload = payloadOf(name)
      check(payload?.noven?.view === view && payload?.noven?.cardAspect === aspect && (payload?.items?.length ?? 0) === 0, `world: ${name} 默认空白`)
    }
    const rulesModule = all.find(module => module.name === '规则')
    check(rulesModule !== undefined && rulesModule.widget === undefined && rulesModule.blocks.length > 0, 'world: 规则是文稿模块')
    const relation = payloadOf('关系')
    check(relation?.noven?.view === 'graph' && (relation?.items?.length ?? 0) === 0, 'world: 关系默认空白')
    const timeline = all.find(module => module.name === '时间线' && module.widget?.type === 'timeline')
    const timelinePayload = JSON.parse(String(timeline?.blocks[0]?.content ?? '{}'))
    check(timeline !== undefined && (timelinePayload.noven?.events?.length ?? 0) === 0, 'world: 时间线默认空白')
    const mapModule = all.find(module => module.name === '地图' && module.widget?.type === 'map')
    check(mapModule !== undefined, 'world: 默认带地图')
    check(built.document.resources.length === 0, `world: 默认不带图片资源（${built.document.resources.length}）`)
  }
  if (id === 'character') {
    check(all.length === 9, `character: 八页内容 + 总览（${all.length}）`)
    check(all.every(m => m.children.length === 0), 'character: 章节不再拆成子模块')
    check(built.document.resources.length === 0, `character: 默认不带图片资源（${built.document.resources.length}）`)
    const profile = all.find(m => m.name === '角色档案')
    const profileData = profile === undefined ? undefined : JSON.parse(String(profile.blocks[0]?.content ?? '{}'))
    check(profileData?.noven?.view === 'profile' && profileData?.noven?.presentation?.contract === 'profile', 'character: 角色档案使用档案视图并带契约')
    check((profileData?.items?.length ?? 0) === 0, 'character: 角色档案默认空白')
    check(profileData?.noven?.fields?.some(f => f.name === '性格关键词' && f.type === 'chips') === true, 'character: 性格关键词是 chips 字段')
    const graph = all.find(m => m.name === '关系')
    const graphData = graph === undefined ? undefined : JSON.parse(String(graph.blocks[0]?.content ?? '{}'))
    check(graphData?.noven?.view === 'graph' && (graphData?.items?.length ?? 0) === 0, 'character: 关系默认空白')
    const diary = all.find(m => m.name === '行动轨迹')
    const diaryData = diary === undefined ? undefined : JSON.parse(String(diary.blocks[0]?.content ?? '{}'))
    check(diaryData?.noven?.view === 'diary' && diaryData?.noven?.calendar?.unit === '岁', 'character: 行动轨迹是纵向日记')
    const gallery = all.find(m => m.name === '多形态')
    const galleryData = gallery === undefined ? undefined : JSON.parse(String(gallery.blocks[0]?.content ?? '{}'))
    check(galleryData?.noven?.view === 'cards' && (galleryData?.items?.length ?? 0) === 0, 'character: 多形态默认空白')
    check(galleryData?.noven?.source?.moduleName === '角色档案' && galleryData?.noven?.presentation?.contract === 'multiForm', 'character: 多形态直接引用角色档案并带契约')
    check(['身份', '年龄', '阵营', '出身'].every(name => galleryData?.noven?.fields?.some(field => field.name === name)), 'character: 多形态带覆写字段')
    for (const name of ['语录', '能力', '装备', '图集']) {
      const module = all.find(m => m.name === name)
      const data = module === undefined ? undefined : JSON.parse(String(module.blocks[0]?.content ?? '{}'))
      check(module !== undefined && (data?.items?.length ?? 0) === 0, `character: ${name} 默认空白`)
    }
  }
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
