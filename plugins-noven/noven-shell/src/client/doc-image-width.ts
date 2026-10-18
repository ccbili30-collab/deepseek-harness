/**
 * 图片宽度约定（人机共用）：markdown 图片行的 title 位携带 `"w=45%"`。
 * 编辑器把缩放后的预览宽度写成它；AI 直接写同一语法即可。标准 markdown
 * 渲染器会忽略 title，不影响其它工具阅读。
 * @module noven-shell/client/doc-image-width
 */

/** 图片宽度（百分比，10–100 的整数）。 */
export type ImageWidth = number

/** 一张 markdown 图片：`![alt](url "title")`（title 可选）。 */
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g
const WIDTH_TITLE = /^w=(\d{1,3})%$/

/** @param value - 任意百分比 @returns 夹到 10–100 的整数 */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(10, Math.round(value)))
}

/**
 * 从 markdown 里剥离宽度 title，按图片出现顺序给出宽度。
 * @param markdown - 原文
 * @returns 清理后的 markdown 与每张图的宽度（无宽度 = undefined）
 */
export function extractImageWidths(markdown: string): { markdown: string; widths: readonly (number | undefined)[] } {
  const widths: (number | undefined)[] = []
  const text = markdown.replace(IMAGE, (whole, alt: string, url: string, title?: string) => {
    if (title === undefined) {
      widths.push(undefined)
      return whole
    }
    const match = WIDTH_TITLE.exec(title.trim())
    if (match === null) {
      widths.push(undefined)
      return whole
    }
    const parsed = Number(match[1])
    widths.push(Number.isFinite(parsed) ? clampPercent(parsed) : undefined)
    return `![${alt}](${url})`
  })
  return { markdown: text, widths }
}

/**
 * 按图片顺序把宽度写回 title；无宽度的图片保持原样（已有宽度 title 会被替换）。
 * @param markdown - 序列化后的 markdown
 * @param widths - 与图片顺序对应的宽度
 * @returns 带宽度 title 的 markdown
 */
export function applyImageWidths(markdown: string, widths: readonly (number | undefined)[]): string {
  let index = 0
  return markdown.replace(IMAGE, (whole, alt: string, url: string, title?: string) => {
    const width = widths[index]
    index += 1
    const keptTitle = title !== undefined && !WIDTH_TITLE.test(title.trim()) ? title : undefined
    if (width === undefined) return keptTitle === undefined ? whole : `![${alt}](${url} "${keptTitle}")`
    const merged = keptTitle === undefined ? `w=${String(clampPercent(width))}%` : `${keptTitle} w=${String(clampPercent(width))}%`
    return `![${alt}](${url} "${merged}")`
  })
}

/**
 * 百分比 → 像素（按编辑器内容宽度）。
 * @param percent - 宽度百分比
 * @param contentWidth - 编辑器正文可用宽度（px）
 * @returns 预览宽度（px）
 */
export function percentToPx(percent: number, contentWidth: number): number {
  return Math.max(24, Math.round((clampPercent(percent) / 100) * Math.max(120, contentWidth)))
}

/**
 * 像素 → 百分比（保存时用）。
 * @param px - 预览宽度（px）
 * @param contentWidth - 编辑器正文可用宽度（px）
 * @returns 宽度百分比
 */
export function pxToPercent(px: number, contentWidth: number): number {
  if (contentWidth <= 0) return 100
  return clampPercent((px / contentWidth) * 100)
}
