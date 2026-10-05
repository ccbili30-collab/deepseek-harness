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
  readonly likes: number
  /** Cover asset name; absent → the text-card variant. */
  readonly cover?: string
  readonly roles?: readonly string[]
  readonly modules?: readonly { title: string; preview: string }[]
}

export const FEED: readonly FeedCard[] = [
  {
    id: 'f1', title: '云上第七天', kind: 'world', author: '山也', enterable: true, forks: 128, likes: 512,
    cover: 'cover-yunshang.webp',
    desc: '一座只在每周第七天出现的云上车站。检票员记得每一位乘客的名字，却没人记得他的。',
    roles: ['检票员', '第七天的猫', '临时站长'],
    modules: [
      { title: '车站', preview: '站台悬在云海上，铁轨在日出时才会显形。' },
      { title: '规则', preview: '车票只能用“一件不再需要的回忆”来购买。' },
    ],
  },
  {
    id: 'f2', title: '青玄门', kind: 'world', author: '临渊', enterable: true, forks: 342, likes: 1204,
    cover: 'cover-qingxuan.webp',
    desc: '云雾山门里的修仙门派，藏经峰上封存着不许再提的往事。掌门将逝，继任未定。',
    roles: ['沈砚', '云鹤', '林晚'],
    modules: [
      { title: '门派史', preview: '二十年前的那场联署否决，写进了门规的空白处。' },
      { title: '继任规则', preview: '掌门之位不由血亲继承，由寒潭试炼决定。' },
    ],
  },
  {
    id: 'f3', title: '海边的最后一班车', kind: 'world', author: '远岸', enterable: false, forks: 56, likes: 89,
    desc: '末班车驶出站台时，海潮会倒着涨。短篇集，已完结。',
  },
  {
    id: 'f4', title: '阿迟', kind: 'character', author: '桃坞', enterable: true, forks: 89, likes: 356,
    cover: 'cover-achi.webp',
    desc: '慢半拍的占卜师，说话之前总要先看一眼自己的手心。',
  },
  {
    id: 'f5', title: '末日备忘录', kind: 'world', author: '夜航', enterable: true, forks: 203, likes: 918,
    cover: 'cover-mori.webp',
    desc: '文明崩塌后的档案馆里，一个 AI 还在逐条回复没人再看的留言。',
  },
  {
    id: 'f6', title: '今晚，你替月亮值班', kind: 'world', author: '半各', enterable: true, forks: 12, likes: 45,
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
