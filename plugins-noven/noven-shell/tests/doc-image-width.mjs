/**
 * 图片宽度约定自测：markdown 图片行 title 位 `"w=45%"` 的抽取/写回、幂等与
 * 百分比↔像素换算。人机共用同一约定——AI 写的宽度必须能被编辑器还原。
 * Run: node tests/doc-image-width.mjs（先 tsc）
 * @module noven-shell/tests/doc-image-width
 */
import { applyImageWidths, clampPercent, extractImageWidths, percentToPx, pxToPercent } from '../lib/client/doc-image-width.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const md = '# 标题\n\n![图一](a.png "w=45%")\n\n![图二](b.png)\n\n![图三](c.png "自定义")'
const extracted = extractImageWidths(md)
check(extracted.widths.length === 3, '三张图都入列')
check(extracted.widths[0] === 45 && extracted.widths[1] === undefined && extracted.widths[2] === undefined, '宽度按顺序：45/无/无（非宽度 title 不误读）')
check(extracted.markdown.includes('![图一](a.png)'), '宽度 title 被剥离')
check(extracted.markdown.includes('"自定义"'), '非宽度 title 保留')

const applied = applyImageWidths(extracted.markdown, extracted.widths)
check(applied.includes('![图一](a.png "w=45%")'), '宽度写回 title')
check(applied.includes('![图二](b.png)'), '无宽度不写 title')
check(applied.includes('![图三](c.png "自定义")'), '非宽度 title 原样保留')
check(applyImageWidths(applied, extracted.widths) === applied, '写回幂等')

const again = extractImageWidths(applied)
check(again.widths[0] === 45 && again.markdown === extracted.markdown, '抽取↔写回闭环')

check(clampPercent(5) === 10 && clampPercent(150) === 100, '宽度夹到 10–100')
check(percentToPx(40, 1000) === 400, '百分比→像素')
check(pxToPercent(400, 1000) === 40, '像素→百分比')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
