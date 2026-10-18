/**
 * 卡模块图片宽度自测：`write_markdown` 的图片行 title `"w=45%"` 要落成
 * 图片块的 width 字段（10–100 夹紧），供编辑器与 AI 共用同一约定。
 * Run: node tests/image-width.mjs（或 pnpm test）
 * @module noven-cards/tests/image-width
 */
import { parseModuleMarkdown } from '../lib/markdown.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const card = {
  id: 'card-x', kind: 'WORLD', name: '测试卡', modules: [], internalCharacters: [], extensions: {},
  appearance: { readingLayout: 'PAGED' },
  resources: [{ id: 'r1', content: 'c1', mediaType: 'image/png' }],
}
const writeText = async text => `ref:${text}`

const plain = await parseModuleMarkdown(card, '正文\n\n![图](card-image:r1 "w=45%")', writeText)
const image = plain.find(block => block.kind === 'image')
check(image !== undefined && image.width === 45, '宽度 title → 图片块 width=45')
check(image !== undefined && image.resourceId === 'r1', '资源编号保留')

const clamped = await parseModuleMarkdown(card, '![图](card-image:r1#b9 "w=5%")', writeText)
const low = clamped.find(block => block.kind === 'image')
check(low !== undefined && low.width === 10 && low.id === 'b9', '宽度夹到 10 且沿用旧块编号')

const noWidth = await parseModuleMarkdown(card, '![图](card-image:r1)', writeText)
const none = noWidth.find(block => block.kind === 'image')
check(none !== undefined && none.width === undefined, '无 title 不写宽度')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
