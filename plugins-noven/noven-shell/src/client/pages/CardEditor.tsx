/**
 * 卡片编辑器 — the three-pane card editor skeleton: module tree, the
 * module's Markdown body, and the "交给 AI" side conversation. Card storage
 * is a later phase; this page renders the agreed layout over a fixture.
 * @module noven-shell/client/pages/CardEditor
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import { EDITOR_MODULES, EDITOR_DOC } from '../data.ts'
import { glyph } from '../icons.tsx'

interface Props { readonly t: ShellT }

export function CardEditor({ t }: Props) {
  const [selected, setSelected] = useState('e3')
  const [doc, setDoc] = useState(EDITOR_DOC)
  const [draft, setDraft] = useState('')

  return (
    <div className="nv-editor">
      <div className="nv-editor-col">
        <div className="nv-editor-col-head">{t('editor.modules')}</div>
        {EDITOR_MODULES.map(m => (
          <button key={m.id} className="nv-tree-row" data-active={selected === m.id}
            style={{ paddingLeft: 14 + m.indent * 16 }} onClick={() => setSelected(m.id)}>
            {glyph.file(14)} {m.title}
          </button>
        ))}
        <div className="nv-editor-col-head" style={{ marginTop: 'auto' }}>{t('editor.roles')}</div>
        {['沈砚', '云鹤'].map(r => (
          <button key={r} className="nv-tree-row"><span className="nv-avatar">{r.slice(0, 1)}</span> {r}</button>
        ))}
        <div className="nv-editor-col-head">{t('editor.assets')}</div>
        <button className="nv-tree-row">{glyph.image(14)} 山门.png</button>
      </div>

      <div className="nv-editor-col">
        <div className="nv-editor-col-head" style={{ display: 'flex', alignItems: 'center' }}>
          继任规则.md
          <button className="nv-btn-ghost" style={{ marginLeft: 'auto', padding: '3px 12px', fontSize: 12 }}>{t('editor.save')}</button>
        </div>
        <div className="nv-editor-doc">
          <textarea value={doc} onChange={e => setDoc(e.target.value)} spellCheck={false} />
        </div>
      </div>

      <div className="nv-editor-col">
        <div className="nv-editor-col-head">{t('editor.sidechat.title')}</div>
        <div className="nv-editor-chat">
          <div className="nv-bubble" data-me="true">把“寒潭试炼”的由来补一段，和门派史呼应。</div>
          <div className="nv-bubble" data-me="false">已在「继任规则」末尾加了一段，引用门派史的联署事件。</div>
          <div className="nv-receipt"><span className="ok">✓</span> {t('editor.receipt').replace('{card}', '青玄门')}</div>
          <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
            <textarea className="nv-input" rows={2} placeholder={t('editor.sidechat.hint')}
              value={draft} onChange={e => setDraft(e.target.value)}
              style={{ flex: 1, background: 'var(--nv-surface)', border: '0.5px solid var(--nv-divider)', borderRadius: 10, padding: '8px 10px' }} />
            <button className="nv-btn-primary" style={{ alignSelf: 'flex-end' }}>{glyph.send(14)}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
