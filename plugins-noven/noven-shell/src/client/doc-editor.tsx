/**
 * 文稿富编辑器 —— BlockNote 底座（MPL-2.0）。界面所见即所得：选中加格式、
 * 斜杠插入、块拖拽；markdown 只是硬盘格式，打开时解析成块、存盘时序列化回 md。
 * 左侧标题树由块的 heading 实时生成，点条目跳到对应标题。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Block } from '@blocknote/core'
import { zh } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { BLOCKNOTE_CSS } from './doc-blocknote-css.ts'

/** 标题树的一项：块 id、层级与文字。 */
export interface OutlineItem {
  readonly id: string
  readonly level: number
  readonly text: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** 从行内内容里取纯文字（文本/链接/提及等容器的递归）。 */
function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const item of content) {
    if (!isRecord(item)) continue
    if (typeof item['text'] === 'string') text += item['text']
    else if (item['content'] !== undefined) text += inlineText(item['content'])
  }
  return text
}

/** 扫描文档块，产出标题树（只认 heading 块）。 */
function outlineOf(blocks: readonly Block[]): OutlineItem[] {
  const items: OutlineItem[] = []
  for (const block of blocks) {
    if (block.type !== 'heading') continue
    const props: unknown = block.props
    const rawLevel = isRecord(props) ? props['level'] : undefined
    const level = Number(rawLevel) >= 1 && Number(rawLevel) <= 6 ? Number(rawLevel) : 1
    const text = inlineText(block.content).trim()
    if (text !== '') items.push({ id: block.id, level, text })
  }
  return items
}

/** 全书共用一份样式，多页签只注入一次。 */
function useBlockNoteStyles(): void {
  useEffect(() => {
    if (document.querySelector('style[data-nv-blocknote]') !== null) return
    const style = document.createElement('style')
    style.setAttribute('data-nv-blocknote', '')
    style.textContent = BLOCKNOTE_CSS
    document.head.append(style)
  }, [])
}

/**
 * 富文本文稿体。
 * @param markdown - 打开时的磁盘内容（只用作首帧填充；之后的变更由本编辑器产生）。
 * @param outlineLabel - 标题树的标题文案（locale 归调用方）。
 * @param onChange - 防抖后的 markdown 快照。
 */
export function BlockNoteDocEditor({ markdown, onChange, onOutline, onActive }: {
  readonly markdown: string
  readonly onChange: (markdown: string) => void
  /** 标题树数据交给页签层渲染（树在页签右上角，不占编辑器列）。 */
  readonly onOutline: (items: readonly OutlineItem[]) => void
  /** 滚动时当前所在标题；undefined = 视口在第一个标题之上。 */
  readonly onActive: (id: string | undefined) => void
}) {
  useBlockNoteStyles()
  const editor = useCreateBlockNote({ dictionary: zh })
  const itemsRef = useRef<readonly OutlineItem[]>([])
  const scroller = useRef<HTMLDivElement | null>(null)
  const loaded = useRef(false)
  const last = useRef(markdown)
  const timer = useRef<number | undefined>(undefined)
  // 首帧灌入磁盘内容（layout 阶段，画面前完成，避免空文档闪一帧）。
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const blocks = editor.tryParseMarkdownToBlocks(markdown)
    if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks)
    const items = outlineOf(editor.document)
    itemsRef.current = items
    onOutline(items)
  }, [editor, markdown, onOutline])
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  const trackActive = useCallback(() => {
    const view = scroller.current
    if (view === null) return
    const top = view.getBoundingClientRect().top + 72
    let current: string | undefined
    for (const item of itemsRef.current) {
      const element = document.querySelector(`.nv-doc-bn .bn-block[data-id="${CSS.escape(item.id)}"]`)
      if (element === null) continue
      if (element.getBoundingClientRect().top <= top) current = item.id
      else break
    }
    onActive(current)
  }, [onActive])
  return (
    <div className="nv-doc-bn" ref={scroller} onScroll={trackActive}>
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          const items = outlineOf(editor.document)
          itemsRef.current = items
          onOutline(items)
          if (timer.current !== undefined) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            timer.current = undefined
            const text = editor.blocksToMarkdownLossy()
            if (text === last.current) return
            last.current = text
            onChange(text)
          }, 600)
        }}
      />
    </div>
  )
}
