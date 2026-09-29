/**
 * 创作 — the creation surface: an AI co-writing prompt card, three entry
 * tiles (new world / new character / import card), the desktop-only pro
 * tools row, and the unfinished-drafts list.
 * @module noven-shell/client/pages/Create
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import { glyph } from '../icons.tsx'

interface Props {
  readonly t: ShellT
  /** Starts a new session seeded with the prompt — placeholder until wired. */
  readonly onStartPrompt?: (prompt: string) => void
  /** Opens the card editor on a blank card — placeholder until wired. */
  readonly onNewCard?: (kind: 'world' | 'character') => void
}

const DRAFTS = [
  { id: 'd1', title: '青玄门', detail: '继任规则 · 2 处未保存的修改' },
  { id: 'd2', title: '雾岛邮局的收信人', detail: 'AI 从会话里整理出的角色，待确认' },
] as const

export function Create({ t, onStartPrompt, onNewCard }: Props) {
  const [prompt, setPrompt] = useState('')

  const tiles = [
    { id: 'world', title: t('create.newWorld'), sub: t('create.newWorld.sub'), icon: glyph.planet(20), onClick: () => onNewCard?.('world') },
    { id: 'character', title: t('create.newCharacter'), sub: t('create.newCharacter.sub'), icon: glyph.user(20), onClick: () => onNewCard?.('character') },
    { id: 'import', title: t('create.import'), sub: t('create.import.sub'), icon: glyph.upload(20), onClick: undefined },
  ]

  return (
    <div className="nv-page">
      <div className="nv-page-inner" style={{ maxWidth: 860 }}>
        <div className="nv-h1">{t('nav.create')}</div>

        <div className="nv-card nv-create-hero">
          <textarea
            className="nv-input"
            rows={3}
            placeholder={t('create.hero.placeholder')}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <div className="nv-create-hero-foot">
            <span className="nv-tag">{glyph.sparkle(13)} Nova</span>
            <button className="nv-btn-primary" onClick={() => onStartPrompt?.(prompt)} disabled={!prompt.trim()}>
              {t('create.hero.send')}
            </button>
          </div>
        </div>

        <div className="nv-tiles">
          {tiles.map(tile => (
            <button key={tile.id} className="nv-card nv-tile" onClick={tile.onClick} disabled={tile.onClick === undefined}>
              <span className="nv-tile-icon">{tile.icon}</span>
              <span><strong>{tile.title}</strong><small>{tile.sub}</small></span>
            </button>
          ))}
        </div>

        <div className="nv-tools">
          <button className="nv-tool">{glyph.book(15)} {t('create.tools.research')}</button>
          <button className="nv-tool">{glyph.map(15)} {t('create.tools.map')}</button>
          <button className="nv-tool">{glyph.image(15)} {t('create.tools.comic')}</button>
        </div>

        <div>
          <div className="nv-h2" style={{ margin: '4px 0 10px' }}>{t('create.drafts')}</div>
          <div className="nv-card">
            {DRAFTS.map(d => (
              <div key={d.id} className="nv-draft">
                <span className="nv-draft-thumb">{d.title.slice(0, 1)}</span>
                <div>
                  <strong style={{ fontSize: 13 }}>{d.title}</strong>
                  <div style={{ fontSize: 12, color: 'var(--nv-secondary-text)', marginTop: 2 }}>{d.detail}</div>
                </div>
                <button className="nv-btn-ghost" style={{ marginLeft: 'auto' }}>{t('ctx.open')}</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
