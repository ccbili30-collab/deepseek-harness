/**
 * 卡片编辑器 — the three-pane card editor: top bar (breadcrumb, dirty
 * status, preview/save), a module tree with 世界内角色 and 图片素材, the
 * module's rendered document, and the "交给 AI" side conversation.
 * Card storage is a later phase; this page renders the agreed layout over
 * fixtures.
 * @module noven-shell/client/pages/CardEditor
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import { EDITOR_MODULES, EDITOR_ROLES, asset } from '../data.ts'
import { glyph } from '../icons.tsx'

interface Props {
  readonly t: ShellT
  readonly cardTitle?: string
}

const TOOLBAR = ['B', 'I', '≡', '―', '☰'] as const

export function CardEditor({ t, cardTitle = '青玄门' }: Props) {
  const [selected, setSelected] = useState('e5')
  const [draft, setDraft] = useState('')

  return (
    <div className="nv-editor">
      <div className="nv-editor-top">
        <span className="crumb">{t('editor.crumb.me')} / {t('editor.crumb.world')} / <b>{cardTitle}</b></span>
        <div className="right">
          <span className="nv-dirty">{t('me.card.dirty')}</span>
          <button className="nv-btn-ghost" style={{ padding: '6px 16px' }}>{t('editor.preview')}</button>
          <button className="nv-btn-dark" style={{ padding: '6px 18px' }}>{t('editor.save')}</button>
        </div>
      </div>
      <div className="nv-editor-body">
        <div className="nv-editor-col">
          <div className="nv-editor-col-head">{t('editor.modules')}<span className="plus">+</span></div>
          {EDITOR_MODULES.map(m => (
            <button key={m.id} className="nv-tree-row" data-active={selected === m.id}
              style={{ paddingLeft: 16 + m.indent * 14 }} onClick={() => setSelected(m.id)}>
              <span className="nv-tree-chev">{m.indent === 0 ? (m.open ? '▾' : '▸') : ''}</span>
              {m.title}
            </button>
          ))}
          <div className="nv-tree-row" style={{ cursor: 'default' }}>
            <span className="nv-tree-chev">▾</span>{t('editor.roles')}
          </div>
          {EDITOR_ROLES.map(r => (
            <button key={r.name} className="nv-tree-role">
              <span className="nv-avatar"><img src={asset(r.name === '沈砚' ? 'avatar-shenyan.webp' : r.name === '云鹤' ? 'avatar-yunhe.webp' : 'cover-achi.webp')} alt="" /></span>
              {r.name}
              <small>· {r.role}</small>
            </button>
          ))}
          <div className="nv-tree-row" style={{ marginTop: 8, cursor: 'default' }}>
            <span className="nv-tree-chev">▸</span>{glyph.image(13)} {t('editor.assets')}
            <small style={{ marginLeft: 'auto', color: 'var(--nv-secondary-text)' }}>12</small>
          </div>
        </div>

        <div className="nv-editor-col">
          <div className="nv-doc">
            <div className="nv-doc-title">继任规则</div>
            <div className="nv-doc-toolbar">
              {TOOLBAR.map(b => <button key={b}>{b}</button>)}
              <button>{glyph.image(13)}</button>
            </div>
            <h3>继任需三位长老联署</h3>
            <p>掌门之位不由指定，需三位在任长老共同署名，缺一不可。</p>
            <h3>反对者</h3>
            <p>沈砚长老公开反对联署制度。二十年前，他就是被联署否决的那个人选。</p>
            <img src={asset('cover-qingxuan.webp')} alt="" />
          </div>
        </div>

        <div className="nv-editor-col">
          <div className="nv-side-tabs">
            <button className="nv-side-tab" data-active="true">{t('editor.side.tabs.chat')}</button>
            <button className="nv-side-tab">{t('editor.side.tabs.preview')}</button>
            <button className="nv-side-tab">{t('editor.side.tabs.gallery')}</button>
          </div>
          <div className="nv-side-chat">
            <div className="nv-side-head">
              <strong>{t('editor.sidechat.title')}</strong>
              <span className="nv-tag">{t('editor.sidechat.scope').replace('{card}', cardTitle)}</span>
            </div>
            <div className="nv-bubble" data-me="false">反对的理由再具体一点，和他的过去有关。</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--nv-primary-text)' }}>
              我给沈砚补了一段过去，写进「反对者」。
            </div>
            <div className="nv-receipt">
              <span className="ok">✓</span> {t('editor.receipt').replace('{module}', '继任规则')}
              <button className="nv-link">{t('editor.receipt.view')}</button>
            </div>
            <div style={{ marginTop: 'auto' }} className="nv-side-input">
              <input placeholder={t('editor.sidechat.hint').replace('{card}', cardTitle)}
                value={draft} onChange={e => setDraft(e.target.value)} />
              <button className="nv-send">{glyph.send(13)}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
