/**
 * 文稿富编辑器 —— BlockNote 底座（MPL-2.0）。界面是所见即所得：选中加格式、
 * 斜杠插入、块拖拽；markdown 只是硬盘格式——打开时把 md 解析成块，存盘时
 * 序列化回 md。样式由构建期打平的字符串注入一次（插件构建盒不处理 CSS import）。
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { BLOCKNOTE_CSS } from './doc-blocknote-css.ts'

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
 * @param onChange - 防抖后的 markdown 快照（空值不写：空稿与"还没加载"不可区分）。
 */
export function BlockNoteDocEditor({ markdown, onChange }: {
  readonly markdown: string
  readonly onChange: (markdown: string) => void
}) {
  useBlockNoteStyles()
  const editor = useCreateBlockNote()
  const loaded = useRef(false)
  const last = useRef(markdown)
  const timer = useRef<number | undefined>(undefined)
  // 首帧灌入磁盘内容（layout 阶段，画面前完成，避免空文档闪一帧）。
  useLayoutEffect(() => {
    if (loaded.current) return
    loaded.current = true
    const blocks = editor.tryParseMarkdownToBlocks(markdown)
    if (blocks.length > 0) editor.replaceBlocks(editor.document, blocks)
  }, [editor, markdown])
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  return (
    <div className="nv-doc-bn">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
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
