/**
 * 正文编辑的共用小件：MarkdownText 的本地化标签、meta 行拼手与字数统计。
 * （旧的分块可编辑组件已下线——文稿与卡内模块统一走 BlockNote。）
 * @module noven-shell/client/editor
 */

/** MarkdownText 的本地化 chrome（代码块按钮、脚注）。 */
export interface MdLabels {
  readonly code: {
    readonly copyLabel: string
    readonly copiedLabel: string
    readonly toolbarLabels: { readonly codeLabel: string; readonly wrapLabel: string; readonly unwrapLabel: string }
  }
  readonly footnotes: string
}

/** 「文稿 · 草稿 · 3,284 字」式 meta 行的拼手。 */
export function metaOf(parts: readonly (string | undefined)[]): string {
  return parts.filter((p): p is string => p !== undefined && p !== '').join(' · ')
}

/** 编辑器保存回执：成功 / 冲突 / 失败。 */
export type EditorSaveResult = 'ok' | 'conflict' | 'error'

/** 字数：CJK 按字、拉丁按词。 */
export function wordCount(text: string): number {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/gu) ?? []).length
  const latin = (text.replace(/[㐀-鿿豈-﫿]/gu, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length
  return cjk + latin
}
