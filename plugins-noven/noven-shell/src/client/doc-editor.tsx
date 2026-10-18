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
import { wordCount } from './editor.tsx'
import { applyImageWidths, extractImageWidths, percentToPx, pxToPercent } from './doc-image-width.ts'
import { BLOCKNOTE_CSS } from './doc-blocknote-css.ts'

/** 右缘刻度：标题在全文中的相对位置（0..1，按可滚动高度归一）。 */
export interface OutlineMark {
  readonly id: string
  readonly top: number
}

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

/** 文档顺序里的图片块（含递归子块）——宽度桥按此顺序与 markdown 图片行对齐。 */
function imageBlocksOf(blocks: readonly Block[]): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    if (block.type === 'image') out.push(block)
    out.push(...imageBlocksOf(block.children))
  }
  return out
}

/** 图片块当前的预览宽度（px）；非图片 / 未设置返回 undefined。 */
function previewWidthOf(block: Block): number | undefined {
  const props: unknown = block.props
  if (!isRecord(props)) return undefined
  const width = props['previewWidth']
  return typeof width === 'number' && width > 0 ? width : undefined
}

/** 文档全部块的平面文字（含递归子块），供实时字数统计。 */
function plainTextOf(blocks: readonly Block[]): string {
  let text = ''
  for (const block of blocks) {
    text += `${inlineText(block.content)}\n`
    text += plainTextOf(block.children)
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
export function BlockNoteDocEditor({ markdown, onChange, onOutline, onActive, onWordCount, onMarks, zoom, onZoom }: {
  readonly markdown: string
  readonly onChange: (markdown: string) => void
  /** 当前缩放（1 = 100%），Ctrl/Cmd + 滚轮调整，页签层负责持久化。 */
  readonly zoom: number
  readonly onZoom: (zoom: number) => void
  /** 每次内容变化后的实时字数（页签头显示，不依赖存盘）。 */
  readonly onWordCount: (count: number) => void
  /** 标题树数据交给页签层渲染（树在页签右上角，不占编辑器列）。 */
  readonly onOutline: (items: readonly OutlineItem[]) => void
  /** 滚动时当前所在标题；undefined = 视口在第一个标题之上。 */
  readonly onActive: (id: string | undefined) => void
  /** 右缘刻度的位置（随内容与滚动更新）。 */
  readonly onMarks: (marks: readonly OutlineMark[]) => void
}) {
  useBlockNoteStyles()
  const editor = useCreateBlockNote({ dictionary: zh })
  const itemsRef = useRef<readonly OutlineItem[]>([])
  const scroller = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const loaded = useRef(false)
  const last = useRef(markdown)
  const timer = useRef<number | undefined>(undefined)
  /** 首帧的程序化载入不算用户编辑：ready 之前不存盘，避免"打开即改写"（AI 内容尤其）。 */
  const ready = useRef(false)
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  // Ctrl/Cmd + 滚轮缩放；普通滚轮照常滚动。
  useEffect(() => {
    const view = scroller.current
    if (view === null) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = Math.min(2, Math.max(0.5, Math.round((zoomRef.current + (event.deltaY > 0 ? -0.1 : 0.1)) * 10) / 10))
      if (next !== zoomRef.current) onZoom(next)
    }
    view.addEventListener('wheel', onWheel, { passive: false })
    return () => { view.removeEventListener('wheel', onWheel) }
  }, [onZoom])
  /** 上报刻度位置：标题块顶部相对可滚动高度的比例。 */
  const reportMarks = useCallback(() => {
    const view = scroller.current
    if (view === null) return
    const viewTop = view.getBoundingClientRect().top
    const total = Math.max(1, view.scrollHeight)
    const marks: OutlineMark[] = []
    for (const item of itemsRef.current) {
      const element = document.querySelector(`.nv-doc-bn .bn-block[data-id="${CSS.escape(item.id)}"]`)
      if (element === null) continue
      const offset = element.getBoundingClientRect().top - viewTop + view.scrollTop
      marks.push({ id: item.id, top: Math.min(1, Math.max(0, offset / total)) })
    }
    onMarks(marks)
  }, [onMarks])
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
    reportMarks()
  }, [onActive, reportMarks])
  // 首帧灌入磁盘内容（layout 阶段，画面前完成，避免空文档闪一帧）。
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    // 宽度约定：title 里的 w= 先剥离，块落地后按正文宽度还原成 previewWidth。
    const extracted = extractImageWidths(markdown)
    const blocks = editor.tryParseMarkdownToBlocks(extracted.markdown)
    if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks)
    window.setTimeout(() => {
      const contentWidth = Math.max(120, (scroller.current?.clientWidth ?? 860) - 96)
      imageBlocksOf(editor.document).forEach((block, index) => {
        const width = extracted.widths[index]
        if (width === undefined) return
        editor.updateBlock(block.id, { type: 'image', props: { previewWidth: percentToPx(width, contentWidth) } })
      })
      ready.current = true
    }, 120)
    const items = outlineOf(editor.document)
    itemsRef.current = items
    onOutline(items)
    onWordCount(wordCount(plainTextOf(editor.document)))
    reportMarks()
  }, [editor, markdown, onOutline, onWordCount, reportMarks])
  return (
    <div className="nv-doc-bn" ref={scroller} onScroll={trackActive}
      style={{ ['--nv-doc-zoom' as string]: String(zoom) }}>
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          const items = outlineOf(editor.document)
          itemsRef.current = items
          onOutline(items)
          onWordCount(wordCount(plainTextOf(editor.document)))
          reportMarks()
          if (timer.current !== undefined) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            timer.current = undefined
            if (!ready.current) return
            const contentWidth = Math.max(120, (scroller.current?.clientWidth ?? 860) - 96)
            const widths = imageBlocksOf(editor.document).map(block => {
              const width = previewWidthOf(block)
              return width === undefined ? undefined : pxToPercent(width, contentWidth)
            })
            const text = applyImageWidths(editor.blocksToMarkdownLossy(), widths)
            if (text === last.current) return
            last.current = text
            onChange(text)
          }, 600)
        }}
      />
    </div>
  )
}

/**
 * 纯文本编辑面（代码/配置等非文稿文件）：不改写内容，原样进出。
 * markdown 文稿一律走上面的 BlockNote；这里只服务 json/yaml/代码类文件。
 */
export function PlainTextDocEditor({ text, onChange }: {
  readonly text: string
  readonly onChange: (text: string) => void
}) {
  const timer = useRef<number | undefined>(undefined)
  const last = useRef(text)
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  return (
    <textarea className="nv-doc-plain" defaultValue={text} spellCheck={false}
      onChange={event => {
        const value = event.currentTarget.value
        if (timer.current !== undefined) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = undefined
          if (value === last.current) return
          last.current = value
          onChange(value)
        }, 600)
      }} />
  )
}

/**
 * 卡内模块的正文编辑器：与文稿同一套 BlockNote，读写 markdown。
 * 卡系统按模块保存（write_markdown 整模块替换），所以这里只负责"文本 ↔ 块"；
 * 图片块以 `card-image:<resourceId>#<blockId>` 语法随行，保存时由卡系统还原成图片块。
 * @param markdown - 模块当前正文（图片行含 card-image 语法）。
 * @param onSave - 防抖后的整模块 markdown 快照。
 */
export function CardMarkdownEditor({ markdown, onSave }: {
  readonly markdown: string
  readonly onSave: (markdown: string) => void
}) {
  useBlockNoteStyles()
  const editor = useCreateBlockNote({ dictionary: zh })
  const loaded = useRef(false)
  const last = useRef(markdown)
  const timer = useRef<number | undefined>(undefined)
  const box = useRef<HTMLDivElement | null>(null)
  const ready = useRef(false)
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const extracted = extractImageWidths(markdown)
    const blocks = editor.tryParseMarkdownToBlocks(extracted.markdown)
    if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks)
    window.setTimeout(() => {
      const contentWidth = Math.max(120, (box.current?.clientWidth ?? 640) - 4)
      imageBlocksOf(editor.document).forEach((block, index) => {
        const width = extracted.widths[index]
        if (width === undefined) return
        editor.updateBlock(block.id, { type: 'image', props: { previewWidth: percentToPx(width, contentWidth) } })
      })
      ready.current = true
    }, 120)
  }, [editor, markdown])
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  return (
    <div className="nv-card-bn" ref={box}>
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          if (timer.current !== undefined) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            timer.current = undefined
            if (!ready.current) return
            const contentWidth = Math.max(120, (box.current?.clientWidth ?? 640) - 4)
            const widths = imageBlocksOf(editor.document).map(block => {
              const width = previewWidthOf(block)
              return width === undefined ? undefined : pxToPercent(width, contentWidth)
            })
            const text = applyImageWidths(editor.blocksToMarkdownLossy(), widths)
            if (text === last.current) return
            last.current = text
            onSave(text)
          }, 800)
        }}
      />
    </div>
  )
}
