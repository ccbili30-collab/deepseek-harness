/**
 * 模块 Markdown 解析（ModuleMarkdown 的写侧契约）：正文里独占一行的
 * `![说明](card-image:资源编号#图片块编号)` 是图片块；其余连续行归并为文字块。
 * 旧图片块带原编号则保留编号；新图片块用新编号。资源必须属于本卡。
 * @module noven-cards/markdown
 */

import { mintId, flattenModules, type ContentBlock, type ContentDocument } from './model.ts'

const IMAGE_LINE = /^!\[([^\]]*)\]\(card-image:([^)#\s]+?)(?:#([^\)\s]+))?(?:\s+"([^"]*)")?\)$/
const WIDTH_TITLE = /^w=(\d{1,3})%$/

/** @param title - 图片行 title @returns 宽度百分比（10–100）；非宽度 title 返回 undefined */
function widthOfTitle(title: string | undefined): number | undefined {
  if (title === undefined) return undefined
  const match = WIDTH_TITLE.exec(title.trim())
  if (match === null) return undefined
  return Math.min(100, Math.max(10, Math.round(Number(match[1]))))
}

/**
 * 把一段 Markdown 正文解析成块序列。
 * @param card - 所属卡（校验资源归属；定位旧图片块编号）。
 * @param text - Markdown 正文。
 * @param writeText - 正文落库回调，返回 ContentRef。
 * @returns 块序列（数组顺序即展示顺序）。
 */
export async function parseModuleMarkdown(
  card: ContentDocument,
  text: string,
  writeText: (text: string) => Promise<string>,
): Promise<ContentBlock[]> {
  const resourceIds = new Set(card.resources.map(resource => resource.id))
  const knownImageBlocks = new Map<string, string>()
  for (const module of flattenModules(card.modules)) {
    for (const block of module.blocks) {
      if (block.kind === 'image') knownImageBlocks.set(`${block.resourceId}#${block.id}`, block.id)
    }
  }
  const blocks: ContentBlock[] = []
  const lines = text.split('\n')
  let buffer: string[] = []
  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return
    const content = await writeText(buffer.join('\n'))
    blocks.push({ kind: 'text', id: mintId(), content })
    buffer = []
  }
  for (const line of lines) {
    const match = IMAGE_LINE.exec(line.trim())
    if (match === null) {
      buffer.push(line)
      continue
    }
    const [, caption, resourceId, blockIdHint, title] = match
    if (!resourceIds.has(resourceId)) throw new Error(`图片必须引用本卡资源：${resourceId}`)
    await flush()
    const reused = blockIdHint !== undefined
      ? knownImageBlocks.get(`${resourceId}#${blockIdHint}`)
      : undefined
    const captionRef = caption.length > 0 ? await writeText(caption) : undefined
    const width = widthOfTitle(title)
    blocks.push({
      kind: 'image',
      id: reused ?? blockIdHint ?? mintId(),
      resourceId,
      ...(captionRef !== undefined ? { caption: captionRef } : {}),
      ...(width !== undefined ? { width } : {}),
    })
  }
  await flush()
  return blocks
}
