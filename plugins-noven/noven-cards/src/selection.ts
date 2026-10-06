/**
 * 选中上下文标签（契约 C4）：用户选中画布对象后，客户端把标签放在消息
 * 正文最前面，随后换行接用户的话。标签是用户消息的一部分，自然进会话
 * 日志——进模型的内容可重建；标签里的编号可直接用于工具调用。
 *
 * 纯字符串函数，零依赖，浏览器与后端共用同一份实现
 * （客户端经子路径 `noven-cards/selection` 引入）。
 * @module noven-cards/selection
 */

/** 已知的选中类型；解析时不拒未知值（向前兼容，客户端按通用 chip 渲染）。 */
export type SelectionType = 'card' | 'module' | 'timeline.event' | 'timeline.era' | 'collection.item' | 'doc.range' | 'overview.tile'

export interface Selection {
  /** 选中对象的种类（见 SelectionType）。 */
  readonly type: string
  /** 所在卡的编号。 */
  readonly card: string
  /** 目标卡编号（选中世界内角色或其模块时 = 角色编号；根卡可省略）。 */
  readonly target?: string
  /** 模块编号。 */
  readonly module?: string
  /** 条目级编号（事件/时代/条目/小块）。 */
  readonly item?: string
  /** doc.range：文字块编号。 */
  readonly block?: string
  /** doc.range：选区起止（字符偏移）。 */
  readonly start?: number
  readonly end?: number
  /** doc.range：引文，最多 QUOTE_MAX 字。 */
  readonly quote?: string
  /** 给用户看的一行名字（chip 文案）。 */
  readonly label?: string
}

export const QUOTE_MAX = 200
/** 一条消息最多携带的选中标签数。 */
export const SELECTION_MAX = 3

const KNOWN_TYPES = new Set<string>(['card', 'module', 'timeline.event', 'timeline.era', 'collection.item', 'doc.range', 'overview.tile'])

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '&#10;')

const unescapeAttr = (value: string): string =>
  value.replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/**
 * 把一个选中对象格式化为标签。必传 type/card；doc.range 另需
 * block/start/end（quote 截到 QUOTE_MAX）。type 不在已知集合也照写——
 * 新类型先落地再用比被卡住重要。
 */
export function formatSelectionTag(sel: Selection): string {
  const attrs: [string, string][] = [['type', sel.type], ['card', sel.card]]
  if (sel.target !== undefined) attrs.push(['target', sel.target])
  if (sel.module !== undefined) attrs.push(['module', sel.module])
  if (sel.item !== undefined) attrs.push(['item', sel.item])
  if (sel.block !== undefined) attrs.push(['block', sel.block])
  if (sel.start !== undefined) attrs.push(['start', String(sel.start)])
  if (sel.end !== undefined) attrs.push(['end', String(sel.end)])
  if (sel.quote !== undefined) attrs.push(['quote', sel.quote.slice(0, QUOTE_MAX)])
  if (sel.label !== undefined) attrs.push(['label', sel.label])
  return `<noven-selection ${attrs.map(([key, value]) => `${key}="${escapeAttr(value)}"`).join(' ')}/>`
}

const TAG_HEAD = /^<noven-selection\s+((?:[a-zA-Z]+="[^"]*"\s*)+)\/?>\r?\n?/
const ATTR = /([a-zA-Z]+)="([^"]*)"/g

/** 标签必须有 type 和 card 才算选中标签；否则留给正文原样显示。 */
function readAttrs(match: RegExpExecArray): Record<string, string> | undefined {
  const attrs: Record<string, string> = {}
  for (const attr of match[1].matchAll(ATTR)) attrs[attr[1]] = unescapeAttr(attr[2])
  return typeof attrs.type === 'string' && typeof attrs.card === 'string' ? attrs : undefined
}

/** 解析消息开头的选中标签；最多 SELECTION_MAX 个。识别不了的部分原样留在正文里。 */
export function parseSelectionTags(text: string): Selection[] {
  const selections: Selection[] = []
  let rest = text
  while (selections.length < SELECTION_MAX) {
    const match = TAG_HEAD.exec(rest)
    if (match === null) break
    const attrs = readAttrs(match)
    if (attrs === undefined) break
    const selection: Selection = {
      type: attrs.type, card: attrs.card,
      ...(attrs.target !== undefined ? { target: attrs.target } : {}),
      ...(attrs.module !== undefined ? { module: attrs.module } : {}),
      ...(attrs.item !== undefined ? { item: attrs.item } : {}),
      ...(attrs.block !== undefined ? { block: attrs.block } : {}),
      ...(attrs.start !== undefined ? { start: Number(attrs.start) } : {}),
      ...(attrs.end !== undefined ? { end: Number(attrs.end) } : {}),
      ...(attrs.quote !== undefined ? { quote: attrs.quote } : {}),
      ...(attrs.label !== undefined ? { label: attrs.label } : {}),
    }
    selections.push(selection)
    rest = rest.slice(match[0].length)
  }
  return selections
}

/** 消息正文里开头的标签段剥掉后剩下的用户文本（渲染气泡用）；与 parseSelectionTags 同一有效性判定。 */
export function stripSelectionTags(text: string): string {
  let rest = text
  for (let i = 0; i < SELECTION_MAX; i++) {
    const match = TAG_HEAD.exec(rest)
    if (match === null || readAttrs(match) === undefined) break
    rest = rest.slice(match[0].length)
  }
  return rest
}

/** 标签类型是否在本期已知集合内（未知类型按通用 chip 渲染，不报错）。 */
export function isKnownSelectionType(type: string): boolean {
  return KNOWN_TYPES.has(type)
}
