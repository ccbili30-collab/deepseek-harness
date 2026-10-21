/**
 * Default window contracts for collection modules. The same object is shipped
 * inside module data, so the reader, detail editor, and AI all read one spec.
 * @module noven-cards/collection-contracts
 */
import type { CollectionPresentation } from './formats.ts'

const contract = (value: CollectionPresentation): CollectionPresentation => value

const landscape = { id: 'card', role: '卡片场景图', ratio: '16:9', render: '211x119', export: '422x238' }
const detailHero = { id: 'detail', role: '详情头图', ratio: '16:9', render: '666x375', export: '1332x750' }
const square = { id: 'card', role: '方形卡片图', ratio: '1:1', render: '211x211', export: '422x422' }
const portrait = { id: 'card', role: '竖版肖像', ratio: '3:4', render: '211x281', export: '422x562' }
const emblem = { id: 'emblem', role: '徽记', ratio: '1:1', render: '96x96', export: '192x192' }
const icon = { id: 'icon', role: '技能图标', ratio: '1:1', render: '56x56', export: '112x112' }
const itemImage = { id: 'item', role: '器物图', ratio: '1:1', render: '360x360', export: '720x720' }

export const COLLECTION_CONTRACTS: Readonly<Record<string, CollectionPresentation>> = {
  profile: contract({
    contract: 'profile', layout: 'profile', core: ['姓名', '形象', '一句话', '档案'], optional: ['身份', '年龄', '阵营', '出身', '性格关键词'], detail: [],
    editor: { create: ['姓名', '形象'], detail: ['身份', '年龄', '阵营', '出身', '一句话', '性格关键词', '档案'] }, assets: [{ ...portrait, role: '角色形象' }], links: ['relation', 'timeline'],
  }),
  worldProfile: contract({
    contract: 'worldProfile', layout: 'profile', core: ['名称', '封面', '一句话', '档案'], optional: ['世界类型', '尺度', '规则', '历法', '关键词'], detail: [],
    editor: { create: ['名称', '封面'], detail: ['世界类型', '尺度', '规则', '历法', '关键词', '一句话', '档案'] }, assets: [{ ...landscape, id: 'cover', role: '世界封面', ratio: '2:1', render: '666x333', export: '1332x666' }], links: ['map', 'timeline'],
  }),
  geography: contract({
    contract: 'geography', layout: 'atlas', core: ['名称', '场景', '说明'], optional: ['地貌', '气候', '主要势力', '地图标记'], detail: [{ title: '地点', fields: ['地貌', '气候'] }, { title: '主要势力', fields: ['主要势力'] }, { title: '说明', fields: ['说明'] }],
    editor: { create: ['名称', '场景', '地貌'], detail: ['气候', '主要势力', '说明'] }, assets: [landscape, detailHero], links: ['map', 'timeline'],
  }),
  factions: contract({
    contract: 'factions', layout: 'heraldry', core: ['名称', '徽记', '说明'], optional: ['立场', '实力', '驻地', '首领'], detail: [{ title: '立场与实力', fields: ['立场', '实力'] }, { title: '驻地与首领', fields: ['驻地', '首领'] }, { title: '说明', fields: ['说明'] }],
    editor: { create: ['名称', '徽记', '立场'], detail: ['实力', '驻地', '首领', '说明'] }, assets: [emblem, square], links: ['place', 'relation'],
  }),
  races: contract({
    contract: 'races', layout: 'bestiary', core: ['名称', '形象', '特征'], optional: ['寿命', '分布'], detail: [{ title: '寿命与分布', fields: ['寿命', '分布'] }, { title: '特征', fields: ['特征'] }],
    editor: { create: ['名称', '形象', '寿命'], detail: ['分布', '特征'] }, assets: [portrait], links: ['place', 'relation'],
  }),
  culture: contract({
    contract: 'culture', layout: 'magazine', core: ['名称', '场景', '说明'], optional: ['类别', '场合', '日历'], detail: [{ title: '类别与场合', fields: ['类别', '场合'] }, { title: '日历', fields: ['日历'] }, { title: '说明', fields: ['说明'] }],
    editor: { create: ['名称', '场景', '类别'], detail: ['场合', '日历', '说明'] }, assets: [landscape, detailHero], links: ['place', 'timeline'],
  }),
  rules: contract({
    contract: 'rules', layout: 'rulebook', core: ['名称', '说明'], optional: ['类别', '详细说明'], detail: [{ title: '类别', fields: ['类别'] }, { title: '规则', fields: ['说明'] }, { title: '详细说明', fields: ['详细说明'] }],
    editor: { create: ['名称', '说明'], detail: ['详细说明'] }, assets: [], links: ['relation'],
  }),
  quotes: contract({
    contract: 'quotes', layout: 'quoteWall', core: ['语录', '场景'], optional: ['情绪', '对象'], detail: [{ title: '场景', fields: ['场景'] }, { title: '情绪与对象', fields: ['情绪', '对象'] }],
    editor: { create: ['语录', '场景'], detail: ['情绪', '对象'] }, assets: [], links: ['character', 'timeline'],
  }),
  abilities: contract({
    contract: 'abilities', layout: 'skillSheet', core: ['名称', '效果', '详细说明'], optional: ['类型', '代价', '冷却'], detail: [{ title: '效果', fields: ['效果'] }, { title: '详细说明', fields: ['详细说明'] }],
    editor: { create: ['名称', '类型', '效果'], detail: ['详细说明'] }, assets: [icon], links: ['character'],
  }),
  equipment: contract({
    contract: 'equipment', layout: 'armory', core: ['名称', '图片', '效果'], optional: ['类型', '归属', '详细说明'], detail: [{ title: '效果', fields: ['效果'] }, { title: '详细说明', fields: ['详细说明'] }],
    editor: { create: ['名称', '图片', '效果'], detail: ['类型', '归属', '详细说明'] }, assets: [itemImage], links: ['character'],
  }),
  gallery: contract({
    contract: 'gallery', layout: 'gallery', core: ['图片', '名称', '说明'], optional: [], detail: [{ title: '说明', fields: ['说明'] }],
    editor: { create: ['图片', '名称'], detail: ['说明'] }, assets: [{ id: 'thumb', role: '画廊缩略图', ratio: '4:3', render: '325x244', export: '650x488' }, { id: 'lightbox', role: '灯箱大图', ratio: '3:2', render: '1200x800', export: '2400x1600' }], links: ['character'],
  }),
  collection: contract({
    contract: 'collection', layout: 'list', core: ['名称', '说明'], optional: [], detail: [{ title: '说明', fields: ['说明'] }],
    editor: { create: ['名称', '说明'], detail: [] }, assets: [], links: [],
  }),
  relations: contract({
    contract: 'relations', layout: 'graph', core: ['从', '到', '关系'], optional: ['说明'], detail: [],
    editor: { create: ['从', '到', '关系'], detail: ['说明'] }, assets: [], links: ['character', 'place'],
  }),
  multiForm: contract({
    contract: 'multiForm', layout: 'multiForm', core: ['名称', '形象', '说明'], optional: ['身份', '年龄', '阵营', '出身'],
    detail: [{ title: '形态说明', fields: ['说明'] }, { title: '覆写字段', fields: ['身份', '年龄', '阵营', '出身'] }],
    editor: { create: ['名称', '形象', '身份', '年龄', '阵营', '出身'], detail: ['说明'] }, assets: [portrait], links: ['profile'],
  }),
}

/** Resolve a contract from a contract id or a legacy module name. */
export function contractFor(value: string | undefined): CollectionPresentation | undefined {
  if (value === undefined || value === '') return undefined
  if (COLLECTION_CONTRACTS[value] !== undefined) return COLLECTION_CONTRACTS[value]
  const byName: Record<string, string> = {
    世界档案: 'worldProfile', 角色档案: 'profile', 基本信息: 'profile', 地理: 'geography', 地区: 'geography',
    势力: 'factions', 种族: 'races', 文化: 'culture', 规则: 'rules', 语录: 'quotes', 能力: 'abilities',
    装备: 'equipment', 图集: 'gallery', 角色图集: 'gallery', 多形态: 'multiForm', 关系: 'relations',
    空白集合: 'collection',
  }
  return byName[value] === undefined ? undefined : COLLECTION_CONTRACTS[byName[value]!]
}
