/**
 * 通用编辑器 — 画布里所有"正文型"对象共用：文稿、卡模块的正文都走它。
 * 形态按用户拍板：每一块平时渲染排版好的 Markdown，点中才变编辑态；
 * 保存粒度到块（模块走 write_text + blockId + expectedContent 的块级
 * 乐观锁，文稿切块保存整文）。对象登记里的每种正文对象只负责：给出
 * 块列表、翻译保存回调、决定图片怎么画。
 * @module noven-shell/client/editor
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from './pages/Home.tsx'

/** MarkdownText 的本地化 chrome（代码块按钮、脚注）。 */
export interface MdLabels {
  readonly code: {
    readonly copyLabel: string
    readonly copiedLabel: string
    readonly toolbarLabels: { readonly codeLabel: string; readonly wrapLabel: string; readonly unwrapLabel: string }
  }
  readonly footnotes: string
}

/** 通用编辑器认的一种块：text 可点编，image 只展示。 */
export interface EditableBlock {
  readonly id: string
  readonly kind: 'text' | 'image'
  readonly text?: string
  readonly imageUrl?: string
  readonly caption?: string
  /** 服务端比对的乐观锁指纹（内容引用）；缺省退回 text。 */
  readonly ref?: string
}

/** 保存结果：ok 已落盘；conflict 是这块被别处改过；error 其他失败。 */
export type EditorSaveResult = 'ok' | 'conflict' | 'error'

/**
 * 块级正文编辑器。`editing` 只容一块；点块进编辑、失焦保存、Esc 还原。
 * `onSaveBlock(id, text, expected)`：宿主把块改动翻译成一个写命令；
 * 传 `id === null` 时是"追加一块"。
 * @param props - 块列表、标签、保存与追加回调。
 * @returns 块栈。
 */
export function BlockEditor({ blocks, labels, t, onSaveBlock, onAdd }: {
  readonly blocks: readonly EditableBlock[]
  readonly labels: MdLabels
  readonly t: ShellT
  readonly onSaveBlock: (blockId: string, text: string, expected: string) => Promise<EditorSaveResult>
  readonly onAdd?: (text: string) => Promise<EditorSaveResult>
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState('')
  const [expected, setExpected] = useState('')
  const [conflict, setConflict] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => { if (editing !== null) areaRef.current?.focus() }, [editing])
  const commit = useCallback(() => {
    if (editing === null) return
    const id = editing
    const text = draft
    setEditing(null); setDraft('')
    if (id === 'new') {
      if (text.trim() === '' || onAdd === undefined) return
      void onAdd(text).then(r => { if (r === 'conflict') setConflict(true) })
      return
    }
    if (text === expected) return
    void onSaveBlock(id, text, expected).then(r => { if (r === 'conflict') setConflict(true) })
  }, [editing, draft, expected, onAdd, onSaveBlock])
  const startEdit = useCallback((block: EditableBlock) => {
    setConflict(false); setEditing(block.id); setDraft(block.text ?? ''); setExpected(block.ref ?? block.text ?? '')
  }, [])
  return (
    <div className="nv-blk" onMouseDown={e => {
      // 点到块间空白处也落焦到编辑提交，而不是穿透。
      if ((e.target as HTMLElement).tagName !== 'TEXTAREA' && editing !== null) commit()
    }}>
      {conflict && <div className="nv-canvas-conflict">{t('editor.conflict')}</div>}
      {blocks.length === 0 && editing === null && (
        <button type="button" className="nv-blk-empty" onClick={() => { setEditing('new'); setDraft('') }}>
          {t('editor.modEmpty')}
        </button>
      )}
      {blocks.map(block => {
        if (editing === block.id) {
          return (
            <textarea key={block.id} ref={areaRef} className="nv-blk-area" value={draft}
              onChange={e => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={e => { if (e.key === 'Escape') { setEditing(null); setDraft('') } }} />
          )
        }
        if (block.kind === 'image') {
          return (
            <figure key={block.id} className="nv-blk-figure">
              {block.imageUrl !== undefined && <img src={block.imageUrl} alt={block.caption ?? ''} />}
              {block.caption !== undefined && block.caption !== '' && <figcaption>{block.caption}</figcaption>}
            </figure>
          )
        }
        return (
          <button key={block.id} type="button" className="nv-blk-read" onClick={() => startEdit(block)}>
            <MarkdownText text={block.text ?? ''} labels={labels} />
          </button>
        )
      })}
      {editing === 'new' && (
        <textarea ref={areaRef} className="nv-blk-area" value={draft} placeholder={t('canvas.doc.placeholder')}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') { setEditing(null); setDraft('') } }} />
      )}
      {blocks.length > 0 && editing === null && onAdd !== undefined && (
        <button type="button" className="nv-blk-add" onClick={() => { setConflict(false); setEditing('new'); setDraft('') }}>
          ＋ {t('editor.module.addPara')}
        </button>
      )}
    </div>
  )
}

/** 字数：CJK 逐字计、拉丁按词计——「3,284 字」这种粗粒度足够。 */
export function wordCount(text: string): number {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/gu) ?? []).length
  const latin = (text.replace(/[㐀-鿿豈-﫿]/gu, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length
  return cjk + latin
}

/** 「文稿 · 草稿 · 3,284 字」式 meta 行的拼手。 */
export function metaOf(parts: readonly (string | undefined)[]): string {
  return parts.filter((p): p is string => p !== undefined && p !== '').join(' · ')
}
