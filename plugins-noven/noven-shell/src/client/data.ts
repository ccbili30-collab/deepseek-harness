/**
 * Demo fixtures for the Noven shell pages. The community feed and the local
 * card library have no backend yet (card format port is a separate phase);
 * these records keep the designed screens reviewable until real data lands.
 * Cover art ships in the plugin's `assets/` directory, served by the host
 * route `/api/noven-assets`.
 * @module noven-shell/client/data
 */

/** URL for a packaged demo illustration (host route in src/index.ts). */
export const asset = (name: string): string => `/api/noven-assets?name=${name}`

/** One community work card on the home feed. */
export interface FeedCard {
  readonly id: string
  readonly title: string
  readonly desc: string
  readonly kind: 'world' | 'character'
  readonly author: string
  readonly enterable: boolean
  readonly forks: number
  /** Cover asset name; absent → the text-card variant. */
  readonly cover?: string
  readonly roles?: readonly string[]
  readonly modules?: readonly { title: string; preview: string }[]
}

export const FEED: readonly FeedCard[] = [
  {
    id: 'f1', title: '云上第七天', kind: 'world', author: '山也', enterable: true, forks: 128,
    cover: 'cover-yunshang.webp',
    desc: '一座只在每周第七天出现的云上车站。检票员记得每一位乘客的名字，却没人记得他的。',
    roles: ['检票员', '第七天的猫', '临时站长'],
    modules: [
      { title: '车站', preview: '站台悬在云海上，铁轨在日出时才会显形。' },
      { title: '规则', preview: '车票只能用“一件不再需要的回忆”来购买。' },
    ],
  },
  {
    id: 'f2', title: '青玄门', kind: 'world', author: '临渊', enterable: true, forks: 342,
    cover: 'cover-qingxuan.webp',
    desc: '云雾山门里的修仙门派，藏经峰上封存着不许再提的往事。掌门将逝，继任未定。',
    roles: ['沈砚', '云鹤', '林晚'],
    modules: [
      { title: '门派史', preview: '二十年前的那场联署否决，写进了门规的空白处。' },
      { title: '继任规则', preview: '掌门之位不由血亲继承，由寒潭试炼决定。' },
    ],
  },
  {
    id: 'f3', title: '海边的最后一班车', kind: 'world', author: '远岸', enterable: false, forks: 56,
    desc: '末班车驶出站台时，海潮会倒着涨。短篇集，已完结。',
  },
  {
    id: 'f4', title: '阿迟', kind: 'character', author: '桃坞', enterable: true, forks: 89,
    cover: 'cover-achi.webp',
    desc: '慢半拍的占卜师，说话之前总要先看一眼自己的手心。',
  },
  {
    id: 'f5', title: '末日备忘录', kind: 'world', author: '夜航', enterable: true, forks: 203,
    cover: 'cover-mori.webp',
    desc: '文明崩塌后的档案馆里，一个 AI 还在逐条回复没人再看的留言。',
  },
  {
    id: 'f6', title: '今晚，你替月亮值班', kind: 'world', author: '半各', enterable: true, forks: 12,
    cover: 'cover-yueban.webp',
    desc: '你的第一位访客，是一个想退还昨天的人。',
    roles: ['守夜人', '退信的人', '猫'],
    modules: [
      { title: '值班室', preview: '月亮底下的一间小屋，桌上只有一盏灯和一本登记簿。' },
      { title: '访客簿', preview: '每一位来客都能寄存一样东西，天亮前必须取走或放弃。' },
    ],
  },
]

/** My own card rows on the 我的 → 世界/角色 grids. */
export interface MyCard {
  readonly id: string
  readonly title: string
  readonly kind: 'world' | 'character'
  readonly roles: number
  readonly chats: number
  readonly dirty: boolean
  readonly desc?: string
  readonly cover?: string
}

export const MY_CARDS: readonly MyCard[] = [
  { id: 'm1', title: '住在云上的第七天', kind: 'world', roles: 3, chats: 5, dirty: false, cover: 'cover-yunshang.webp' },
  { id: 'm2', title: '青玄门', kind: 'world', roles: 8, chats: 2, dirty: true, desc: '掌门将逝，继任未定。', cover: 'cover-qingxuan.webp' },
  { id: 'm3', title: '海边的最后一班车', kind: 'world', roles: 4, chats: 1, dirty: false, cover: 'cover-haibian.webp' },
  { id: 'm4', title: '今晚，你替月亮值班', kind: 'world', roles: 2, chats: 3, dirty: false, desc: '你的第一位访客，是一个想退还昨天的人。', cover: 'cover-yueban.webp' },
  { id: 'm5', title: '雾岛邮局', kind: 'world', roles: 2, chats: 0, dirty: false, cover: 'cover-wudao.webp' },
  { id: 'm6', title: '沈砚', kind: 'character', roles: 0, chats: 1, dirty: false, cover: 'avatar-shenyan.webp' },
  { id: 'm7', title: '云鹤', kind: 'character', roles: 0, chats: 0, dirty: true, cover: 'avatar-yunhe.webp' },
  { id: 'm8', title: '阿迟', kind: 'character', roles: 0, chats: 2, dirty: false, cover: 'cover-achi.webp' },
]

/** Workbench cards in 我的 → 创作库. */
export interface WorkbenchCard {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly files: string
  readonly badge: string
  readonly cover?: string
  readonly worldCard?: string
}

export const WORKBENCHES: readonly WorkbenchCard[] = [
  { id: 'w1', title: '青玄门', project: '青玄门', files: '32 个文件', badge: '地图首页', cover: 'wb-map.webp', worldCard: '青玄门' },
  { id: 'w2', title: '继任夜', project: '青玄门', files: '12 页', badge: '漫画', cover: 'wb-comic.webp' },
  { id: 'w3', title: '云上车站的人们', project: '住在云上的第七天', files: '8 个文件', badge: '人物志', cover: 'wb-renwuzhi.webp', worldCard: '住在云上的第七天' },
  { id: 'w4', title: '海边小镇考据', project: '海边的最后一班车', files: '8 份资料', badge: '研究资料' },
]

/** Demo card binding for a sidebar session row, matched on the session title. */
export interface SessionBinding {
  readonly context: string
  readonly cover?: string
}

const SESSION_BINDINGS: readonly { readonly match: RegExp; readonly binding: SessionBinding }[] = [
  { match: /青玄门/, binding: { context: '管理 · 青玄门', cover: 'cover-qingxuan.webp' } },
  { match: /第七天|云上|检票/, binding: { context: '住在云上的第七天 · GM', cover: 'cover-yunshang.webp' } },
  { match: /阿迟|访谈/, binding: { context: '阿迟 · 扮演', cover: 'cover-achi.webp' } },
  { match: /末日/, binding: { context: '末日备忘录 · GM', cover: 'cover-mori.webp' } },
  { match: /月亮|值班/, binding: { context: '今晚，你替月亮值班 · GM', cover: 'cover-yueban.webp' } },
]

/** Fixture context line and cover for a session title; unbound sessions get the Nova assistant label. */
export function sessionBinding(title: string): SessionBinding {
  return SESSION_BINDINGS.find(entry => entry.match.test(title))?.binding ?? { context: 'Nova' }
}

export const RECENT_OUTPUTS = [
  { id: 'r1', name: '藏经峰.md', icon: 'doc', from: '青玄门继任设定整理', ago: '10 分钟前' },
  { id: 'r2', name: '山门地图', icon: 'image', from: '青玄门继任设定整理', ago: '12 分钟前' },
  { id: 'r3', name: '第七站站台.png', icon: 'image', from: '云上车站的检票员', ago: '昨天' },
] as const

/** Card-editor fixture: module tree + roles + the module's body. */
export const EDITOR_MODULES = [
  { id: 'e1', title: '概述', indent: 0, open: false },
  { id: 'e2', title: '山门与地理', indent: 0, open: false },
  { id: 'e3', title: '门规', indent: 0, open: true },
  { id: 'e4', title: '日常戒律', indent: 1, open: false },
  { id: 'e5', title: '继任规则', indent: 1, open: false },
] as const

export const EDITOR_ROLES = [
  { name: '云鹤', role: '掌门' },
  { name: '沈砚', role: '长老' },
  { name: '林晚', role: '弟子' },
] as const
