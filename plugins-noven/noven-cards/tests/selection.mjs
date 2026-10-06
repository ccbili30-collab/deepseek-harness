/**
 * 选中上下文标签（契约 C4）自测：format/parse 往返、转义、引文截断、
 * 数量上限、无效标签留在正文、未知类型向前兼容、标签必须在开头。
 *
 * Run: node tests/selection.mjs（或 pnpm test）
 * @module noven-cards/tests/selection
 */
import { formatSelectionTag, isKnownSelectionType, parseSelectionTags, QUOTE_MAX, SELECTION_MAX, stripSelectionTags } from '../lib/selection.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

// 1. 全类型往返
const cases = [
  { type: 'card', card: 'c-1', label: '蛮荒-404' },
  { type: 'module', card: 'c-1', module: 'm-9', label: '时间线' },
  { type: 'timeline.event', card: 'c-1', target: 'char-2', module: 'm-9', item: 'ev-3', label: '迁都' },
  { type: 'timeline.era', card: 'c-1', module: 'm-9', item: 'era-1', label: '第一纪' },
  { type: 'collection.item', card: 'c-1', module: 'm-4', item: 'it-7', label: '碎星草' },
  { type: 'doc.range', card: 'c-1', module: 'm-1', block: 'b-5', start: 12, end: 47, quote: '大江东去', label: '选段' },
  { type: 'overview.tile', card: 'c-1', item: 't-2', label: '地图小块' },
]
for (const sel of cases) {
  const tag = formatSelectionTag(sel)
  const parsed = parseSelectionTags(`${tag}\n正文`)
  check(parsed.length === 1 && JSON.stringify(parsed[0]) === JSON.stringify({ ...sel, ...(sel.quote === undefined ? {} : {}) })
    , `往返一致 ${sel.type}`)
}

// 2. 转义：label 带引号/与号，quote 带换行
const tricky = { type: 'module', card: 'c"1&', module: 'm<x>', label: '名"称&<特殊>', quote: '第一行\n第二行' }
const parsedT = parseSelectionTags(formatSelectionTag(tricky) + '\n问这个')
check(parsedT.length === 1 && parsedT[0].card === 'c"1&' && parsedT[0].module === 'm<x>' && parsedT[0].label === '名"称&<特殊>' && parsedT[0].quote === '第一行\n第二行', '属性转义/还原（引号、与号、尖括号、换行）')

// 3. quote 截到 QUOTE_MAX
const long = formatSelectionTag({ type: 'doc.range', card: 'c', block: 'b', start: 0, end: 1, quote: '字'.repeat(QUOTE_MAX + 50) })
check(parseSelectionTags(long)[0].quote.length === QUOTE_MAX, `引文截到 ${QUOTE_MAX} 字`)

// 4. 最多 SELECTION_MAX 个；多出来的留在正文
const four = Array.from({ length: SELECTION_MAX + 1 }, (_, i) => formatSelectionTag({ type: 'card', card: `c-${String(i)}` })).join('\n')
const parsed4 = parseSelectionTags(`${four}\n说点什么`)
check(parsed4.length === SELECTION_MAX, `最多解析 ${SELECTION_MAX} 个标签`)
check(stripSelectionTags(`${four}\n说点什么`).startsWith('<noven-selection'), '第 4 个标签留在正文里')

// 5. 无效标签（缺 card）原样留在正文
const broken = '<noven-selection type="card"/>\n这句话'
check(parseSelectionTags(broken).length === 0 && stripSelectionTags(broken) === broken, '缺 card 的标签不消费、原样留正文')

// 6. 未知类型照样解析（向前兼容）；isKnown 只负责提示
const future = formatSelectionTag({ type: 'map.region', card: 'c-1', item: 'r-9', label: '北境' })
const parsedF = parseSelectionTags(future)
check(parsedF.length === 1 && parsedF[0].type === 'map.region' && !isKnownSelectionType(parsedF[0].type), '未知类型解析不拒，isKnown 回报 false')

// 7. 不在开头的标签不算选中（正文里的字面量不消费）
const inline = '先看这句 <noven-selection type="card" card="c-1"/>'
check(parseSelectionTags(inline).length === 0 && stripSelectionTags(inline) === inline, '正文中间的标签字面量不解析')

// 8. 标签后没有换行也能解析（用户直接接着写）
const noNewline = formatSelectionTag({ type: 'card', card: 'c-1' }) + '直接接话'
check(parseSelectionTags(noNewline).length === 1, '标签后无换行也解析')

console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
