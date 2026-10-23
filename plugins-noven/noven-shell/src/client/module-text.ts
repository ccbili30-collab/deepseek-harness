/**
 * Helpers shared by the module page and the setting page: module text as
 * markdown, and the overview-module predicate.
 * @module noven-shell/client/module-text
 */
import type { CardBlockView, CardModuleDoc } from './card-api.ts'

/** Module blocks → markdown: text as-is, images as card-image lines. */
export function moduleMarkdown(blocks: readonly CardBlockView[]): string {
  return blocks.map(block => block.kind === 'text'
    ? block.text ?? ''
    : `![${block.caption ?? ''}](card-image:${block.resourceId ?? ''}#${block.id}${block.width === undefined ? '' : ` "w=${String(Math.round(block.width))}%"`})`).join('\n\n')
}

/** 「总览」模块的判定：起手模块带 widget.type='overview'；旧卡退化为约定名。 */
export function isOverviewModule(module: CardModuleDoc): boolean {
  return module.widget?.type === 'overview' || module.name === '设定总览' || module.name === '概述'
}
