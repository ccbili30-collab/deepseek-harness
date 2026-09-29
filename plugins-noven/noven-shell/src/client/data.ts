/**
 * Demo fixtures for the Noven shell pages. The community feed and the local
 * card library have no backend yet (card format port is a separate phase);
 * these records keep the designed screens reviewable until real data lands.
 * @module noven-shell/client/data
 */

/** One community work card on the home feed. */
export interface FeedCard {
  readonly id: string
  readonly title: string
  readonly desc: string
  readonly kind: 'world' | 'character'
  readonly author: string
  readonly enterable: boolean
  readonly forks: number
  readonly ar: string
  readonly hue: number
  readonly roles?: readonly string[]
  readonly modules?: readonly { title: string; preview: string }[]
}

/** Placeholder cover: a soft two-tone gradient block standing in for art. */
export function coverStyle(hue: number, light = false): { background: string } {
  return {
    background: `linear-gradient(135deg, hsl(${hue} 40% ${light ? 88 : 74}%), hsl(${(hue + 40) % 360} 45% ${light ? 80 : 62}%))`,
  }
}

export const FEED: readonly FeedCard[] = [
  {
    id: 'f1', title: '云上第七天', kind: 'world', author: '山也', enterable: true, forks: 128,
    ar: '3/4', hue: 160,
    desc: '一座只在每周第七天出现的云上车站。检票员记得每一位乘客的名字，却没人记得他的。',
    roles: ['检票员', '第七天的猫', '临时站长'],
    modules: [
      { title: '车站', preview: '站台悬在云海上，铁轨在日出时才会显形。' },
      { title: '规则', preview: '车票只能用“一件不再需要的回忆”来购买。' },
    ],
  },
  {
    id: 'f2', title: '青玄门', kind: 'world', author: '临渊', enterable: true, forks: 342,
    ar: '4/3', hue: 140,
    desc: '云雾山门里的修仙门派，藏经峰上封存着不许再提的往事。',
    roles: ['沈砚', '云鹤'],
    modules: [
      { title: '门派史', preview: '二十年前的那场联署否决，写进了门规的空白处。' },
      { title: '继任规则', preview: '掌门之位不由血亲继承，由寒潭试炼决定。' },
    ],
  },
  {
    id: 'f3', title: '海边的最后一班车', kind: 'world', author: '远岸', enterable: false, forks: 56,
    ar: '1/1', hue: 205,
    desc: '末班车驶出站台时，海潮会倒着涨。短篇集，已完结。',
  },
  {
    id: 'f4', title: '阿迟', kind: 'character', author: '桃坞', enterable: true, forks: 89,
    ar: '4/5', hue: 30,
    desc: '慢半拍的占卜师，说话之前总要先看一眼自己的手心。',
  },
  {
    id: 'f5', title: '末日备忘录', kind: 'world', author: '夜航', enterable: true, forks: 203,
    ar: '4/3', hue: 0,
    desc: '文明崩塌后的档案馆里，一个 AI 还在逐条回复没人再看的留言。',
  },
  {
    id: 'f6', title: '雾岛邮局', kind: 'world', author: '山也', enterable: true, forks: 77,
    ar: '4/5', hue: 190,
    desc: '寄不出去的信都堆在这里。邮局职员的工作是替它们找到收信人。',
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
  readonly hue: number
}

export const MY_CARDS: readonly MyCard[] = [
  { id: 'm1', title: '青玄门', kind: 'world', roles: 6, chats: 2, dirty: true, hue: 140 },
  { id: 'm2', title: '住在云上的第七天', kind: 'world', roles: 3, chats: 5, dirty: false, hue: 205 },
  { id: 'm3', title: '海边的最后一班车', kind: 'world', roles: 2, chats: 1, dirty: false, hue: 215 },
  { id: 'm4', title: '沈砚', kind: 'character', roles: 0, chats: 1, dirty: false, hue: 150 },
  { id: 'm5', title: '云鹤', kind: 'character', roles: 0, chats: 0, dirty: true, hue: 170 },
]

/** Workbench cards in 我的 → 创作库. */
export interface WorkbenchCard {
  readonly id: string
  readonly title: string
  readonly project: string
  readonly files: number
  readonly worldCard?: string
  readonly hue: number
}

export const WORKBENCHES: readonly WorkbenchCard[] = [
  { id: 'w1', title: '山门地图', project: '青玄门', files: 4, worldCard: '青玄门', hue: 140 },
  { id: 'w2', title: '人物志', project: '青玄门', files: 6, worldCard: '青玄门', hue: 160 },
  { id: 'w3', title: '继任夜 · 漫画', project: '青玄门', files: 12, hue: 100 },
  { id: 'w4', title: '云上车站速写集', project: '住在云上的第七天', files: 9, worldCard: '住在云上的第七天', hue: 205 },
]

export const RECENT_OUTPUTS = [
  { id: 'r1', name: '沈砚.md', kind: '人物志', from: '青玄门继任设定整理' },
  { id: 'r2', name: '山门地图 v3.png', kind: '地图', from: '青玄门继任设定整理' },
  { id: 'r3', name: '继任夜-第4格.png', kind: '漫画', from: '第七天 · 另一条线' },
] as const

/** Card-editor fixture: module tree + side-chat transcript. */
export const EDITOR_MODULES = [
  { id: 'e1', title: '概览', indent: 0 },
  { id: 'e2', title: '门派史', indent: 0 },
  { id: 'e3', title: '继任规则', indent: 1 },
  { id: 'e4', title: '门规', indent: 1 },
  { id: 'e5', title: '藏经峰', indent: 0 },
] as const

export const EDITOR_DOC = `# 继任规则

掌门之位不由血亲继承。

每二十年，寒潭试炼开启一次。候选者须在潭底取回一件被上一任掌门封存的东西——它必须是一件“不许再提的往事”。

二十年前的那场联署否决之后，这条规则被加进了门规的空白处。没人记得是谁提议的，就像没人记得被否决的那个人选。`
