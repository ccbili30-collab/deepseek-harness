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
  const emptyLeaves = all.filter(m => m.children.length === 0 && m.blocks.length === 0)
  check(emptyLeaves.length === 0, `${file}: 无空模块（${emptyLeaves.map(m => m.name).join('/') || '全部有内容'}）`)
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
    const mapModule = all.find(m => m.name === '地图' && m.widget?.type === 'map')
    check(mapModule !== undefined, 'world: 地图模块存在（可编辑地图工具）')
    check(mapModule?.blocks.some(b => b.kind === 'image') === true, 'world: 地图带虚构世界底图')
    const mapPayload = JSON.parse(String(mapModule?.blocks.find(b => b.kind === 'text')?.content ?? '{}'))
    check(mapPayload.noven?.markers?.length === 6, `world: 地图 6 个标记（${mapPayload.noven?.markers?.length ?? 0}）`)
    const relModule = all.find(m => m.name === '关系图' && m.widget?.type === 'relation')
    const relPayload = JSON.parse(String(relModule?.blocks[0]?.content ?? '{}'))
    check(relPayload.noven?.nodes?.length === 4 && relPayload.noven?.edges?.length === 5, 'world: 关系图 4 节点 5 边')
    check(built.document.resources.length === 1, `world: 地图底图资源落盘（${built.document.resources.length}）`)
    const collectCells = (moduleName, fieldName) => {
      const module = all.find(m => m.name === moduleName)
      const payload = JSON.parse(String(module?.blocks[0]?.content ?? '{}'))
      const field = payload.noven?.fields?.find(f => f.name === fieldName)
      return { field, items: payload.items ?? [], values: payload.noven?.values ?? {} }
    }
    const station = collectCells('势力名录', '驻地')
    const refs = station.items.map(item => station.values[item.id]?.[station.field?.id])
    check(station.field?.type === 'place', 'world: 驻地字段类型 = place')
    check(refs.length === 4 && refs.every(v => typeof v === 'object' && v !== null && typeof v.cardId === 'string' && typeof v.itemId === 'string'), `world: 驻地落成同卡引用（${refs.filter(v => typeof v === 'object').length}/4）`)
    const dist = collectCells('种族名录', '分布')
    check(Object.values(dist.values).every(cells => { const v = cells[dist.field?.id ?? '']; return typeof v !== 'string' || v === '' }), 'world: 分布全部落成引用')
  }
  if (id === 'character') {
    check(built.document.resources.length === 9, `character: 立绘/表单头像/关系头像资源落盘（${built.document.resources.length}）`)
    check(built.document.resources.every(r => r.mediaType === 'image/jpeg'), 'character: 资源媒体类型正确')
    const forms = all.find(m => m.name === '基本信息')
    const formData = forms === undefined ? undefined : JSON.parse(String(forms.blocks[0]?.content ?? '{}'))
    check(formData?.noven?.view === 'form', 'character: 基本信息默认表单视图')
    check(formData?.noven?.fields?.some(f => f.name === '性格关键词' && f.type === 'chips') === true, 'character: 性格关键词是 chips 字段')
    const gallery = all.find(m => m.name === '多形态')
    const galleryData = gallery === undefined ? undefined : JSON.parse(String(gallery.blocks[0]?.content ?? '{}'))
    check(galleryData?.noven?.view === 'cards', 'character: 多形态默认图鉴视图')
    check(galleryData?.items?.every(item => typeof item.visualKey === 'string'), 'character: 形态条目带主图（visualKey）')
    const relModule = all.find(m => m.name === '关系图' && m.widget?.type === 'relation')
    const relPayload = JSON.parse(String(relModule?.blocks[0]?.content ?? '{}'))
    check(relPayload.noven?.nodes?.length === 5 && relPayload.noven?.edges?.length === 5, 'character: 关系图 5 节点 5 边')
    check(relPayload.noven?.nodes?.every(node => typeof node.avatar === 'string'), 'character: 关系节点带头像资源')
  }
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILURES`)
process.exit(failed === 0 ? 0 : 1)
