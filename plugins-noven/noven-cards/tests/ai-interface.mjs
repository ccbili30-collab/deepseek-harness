/**
 * AI interface check — the desktop tool surface must expose the card templates,
 * module presets/custom definitions/references, structured collection/timeline/
 * relation reads, and the HTML navigation bridge that the UI/server already
 * support. Run after build: node tests/ai-interface.mjs.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerCardTools } from '../lib/tools.js'
import { setAiTrust } from '../lib/trust.js'

const root = mkdtempSync(join(tmpdir(), 'noven-cards-ai-interface-'))
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const registered = new Map()
registerCardTools({ tools: { register: def => { registered.set(def.name, def) } } })
const exec = { agent: { session: { id: 'sess-ai-interface', header: { cwd: root } } } }
const call = (name, args) => registered.get(name).execute(args, exec)

try {
  const cardPresets = await call('list_card_presets', {})
  check(cardPresets.status === 'read' && cardPresets.presets.some(p => p.id === 'character' && p.kind === 'CHARACTER'), 'list_card_presets 列出角色卡模板')
  check(cardPresets.presets.some(p => p.id === 'world' && p.kind === 'WORLD'), 'list_card_presets 列出世界卡模板')

  const modulePresets = await call('list_module_presets', {})
  check(modulePresets.status === 'read'
    && modulePresets.presets.some(p => p.id === 'profile' && p.widget === 'collection' && p.fields?.some(f => f.name === '姓名')),
  'list_module_presets 带字段/视图')
  check(modulePresets.presets.some(p => p.id === 'diary' && p.widget === 'timeline' && p.timeline_view === 'diary'), 'list_module_presets 暴露日记时间线')

  const created = await call('create_card_from_preset', { template: 'character', name: '接口角色' })
  check(created.status === 'saved' && created.card_kind === 'CHARACTER', 'create_card_from_preset 落标准角色卡')
  const cardId = created.root_id
  await setAiTrust(root, cardId, 'auto')

  const read = await call('read_card', { root_id: cardId, target_id: cardId })
  const modules = read.card.modules
  const profile = modules.find(module => module.name === '角色档案')
  const multi = modules.find(module => module.name === '多形态')
  const diary = modules.find(module => module.name === '行动轨迹')
  const relation = modules.find(module => module.name === '关系')
  check(profile !== undefined && multi !== undefined && diary !== undefined && relation !== undefined, '模板卡带角色档案/多形态/行动轨迹/关系')

  const multiData = await call('collection_describe', { root_id: cardId, target_id: cardId, module_id: multi.id })
  check(multiData.source?.moduleName === '角色档案', 'collection_describe 读出多形态 source')
  check(multiData.presentation?.contract === 'multiForm', 'collection_describe 读出多形态呈现契约')
  check(multiData.fields.some(field => field.name === '身份'), 'collection_describe 读出覆写字段')

  const diaryData = await call('timeline_describe', { root_id: cardId, target_id: cardId, module_id: diary.id })
  check(diaryData.view === 'diary' && diaryData.calendar?.unit === '岁', 'timeline_describe 读出纵向日记')

  const relationWidget = await call('add_child_module', {
    root_id: cardId, target_id: cardId, name: '人物图', widget: 'relation',
  })
  const relationWidgetId = relationWidget.created_module_ids[0]
  await call('widget_set_data', {
    root_id: cardId, target_id: cardId, module_id: relationWidgetId, widget: 'relation',
    data: {
      nodes: [{ name: '甲', note: '甲说明', x: 0.2, y: 0.3 }, { name: '乙', note: '', x: 0.7, y: 0.6 }],
      edges: [],
    },
  })
  const relationData = await call('relation_describe', { root_id: cardId, target_id: cardId, module_id: relationWidgetId })
  check(Array.isArray(relationData.nodes) && relationData.nodes.length === 2 && Array.isArray(relationData.edges), 'relation_describe 读出节点/连线')

  const history = await call('add_module_preset', {
    root_id: cardId, target_id: cardId, name: '世界年表', preset: 'history',
  })
  check(history.status === 'saved' && history.created_module_ids.length === 1, 'add_module_preset 用内置预设落模块')
  const historyData = await call('timeline_describe', {
    root_id: cardId, target_id: cardId, module_id: history.created_module_ids[0],
  })
  check(historyData.view !== 'diary' && historyData.calendar?.unit === '年', 'add_module_preset 的 history 是横向年表')

  const definition = {
    name: '导航名册', shape: 'collection', view: 'cards',
    fields: [{ name: '名称', type: 'text' }, { name: '说明', type: 'longtext' }],
  }
  const savedModule = await call('save_user_module', { definition })
  check(savedModule.status === 'saved' && savedModule.module?.id !== undefined, 'save_user_module 保存定义')
  const userModules = await call('list_user_modules', {})
  check(userModules.modules.some(module => module.name === '导航名册'), 'list_user_modules 回读用户模块')

  const custom = await call('add_module_custom', {
    root_id: cardId, target_id: cardId, name: '导航名册', definition: savedModule.module,
  })
  check(custom.status === 'saved' && custom.created_module_ids.length === 1, 'add_module_custom 把定义直接落到卡上')
  const customData = await call('collection_describe', {
    root_id: cardId, target_id: cardId, module_id: custom.created_module_ids[0],
  })
  check(customData.fields.some(field => field.name === '说明') && customData.view === 'cards', 'add_module_custom 落出字段/视图')

  const referenced = await call('add_module_ref', {
    root_id: cardId, target_id: cardId, name: '引用角色档案',
    source_card_id: cardId, source_module_id: profile.id,
  })
  check(referenced.status === 'saved' && referenced.created_module_ids.length === 1, 'add_module_ref 新建引用模块')
  const afterRef = await call('read_card', { root_id: cardId, target_id: cardId })
  const refModule = afterRef.card.modules.find(module => module.id === referenced.created_module_ids[0])
  check(refModule?.widget?.type === 'ref', '引用模块的 widget type 是 ref')

  const htmlDescription = registered.get('add_child_module').parameters.properties.widget.description
  check(htmlDescription.includes('NOVEN_FRAME.openCard') && htmlDescription.includes('NOVEN_FRAME.openModule')
    && htmlDescription.includes('NOVEN_FRAME.navigate'), 'HTML 工具说明包含 openCard/openModule/navigate')

  console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
  process.exitCode = failures === 0 ? 0 : 1
} finally {
  rmSync(root, { recursive: true, force: true })
}
