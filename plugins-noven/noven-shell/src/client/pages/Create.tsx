/**
 * 创作 — the creation surface: title + subtitle, the AI co-writing hero card,
 * a three-segment entry bar (new world / new character / import), the
 * desktop pro-tools row, and the unfinished-drafts list.
 * @module noven-shell/client/pages/Create
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import { glyph } from '../icons.tsx'
import { asset } from '../data.ts'

interface Props {
  readonly t: ShellT
  /** Starts a new session seeded with the prompt — placeholder until wired. */
  readonly onStartPrompt?: (prompt: string) => void
  /** Opens the card editor on a blank card — placeholder until wired. */
  readonly onNewCard?: (kind: 'world' | 'character') => void
}

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

const DRAFTS = [
  { id: 'd1', title: '青玄门', detail: '继任规则 · 2 处未保存的修改', action: 'create.draft.continue', cover: 'cover-qingxuan.webp' },
  { id: 'd2', title: '雾岛邮局的收信人', detail: '待确认的导入草稿', action: 'create.draft.confirm', cover: 'cover-wudao.webp' },
  { id: 'd3', title: '海边的最后一班车', detail: '第一章 · 停在第三节', action: 'create.draft.continue', cover: 'cover-haibian.webp' },
] as const

export function Create({ t, onStartPrompt, onNewCard }: Props) {
  const [prompt, setPrompt] = useState('')

  return (
    <div className="nv-page">
      <div className="nv-inner" style={{ maxWidth: 900 }}>
        <div>
          <div className="nv-h1">{t('nav.create')}</div>
          <div className="nv-sub">{t('create.title.sub')}</div>
        </div>

        <div className="nv-card nv-create-hero">
          <div className="title">{t('create.hero.title')}</div>
          <div className="sub">{t('create.hero.sub')}</div>
          <div className="nv-create-input">
            <input
              placeholder={t('create.hero.placeholder')}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <button className="nv-send" onClick={() => onStartPrompt?.(prompt)} disabled={!prompt.trim()} aria-label={t('create.hero.send')}>
              {glyph.send(15)}
            </button>
          </div>
        </div>

        <div className="nv-card nv-segment">
          <button onClick={() => onNewCard?.('world')}><span className="nv-ic">{glyph.planet(18)}</span>{t('create.newWorld')}</button>
          <button onClick={() => onNewCard?.('character')}><span className="nv-ic">{glyph.user(18)}</span>{t('create.newCharacter')}</button>
          <button disabled><span className="nv-ic">{glyph.upload(18)}</span>{t('create.import')}</button>
        </div>

        <div>
          <div className="nv-tools-head" style={{ marginBottom: 10 }}>
            <span className="nv-h2">{t('create.tools')}</span>
            <span className="nv-tag">{t('create.tools.desktop')}</span>
          </div>
          <div className="nv-tools">
            <button className="nv-card nv-tool-card">
              <span className="nv-ic">{glyph.book(18)}</span>
              <span><strong>{t('create.tools.research')}</strong><small>{t('create.tools.research.sub')}</small></span>
            </button>
            <button className="nv-card nv-tool-card">
              <span className="nv-ic">{glyph.map(18)}</span>
              <span><strong>{t('create.tools.map')}</strong><small>{t('create.tools.map.sub')}</small></span>
            </button>
            <button className="nv-card nv-tool-card">
              <span className="nv-ic">{glyph.image(18)}</span>
              <span><strong>{t('create.tools.comic')}</strong><small>{t('create.tools.comic.sub')}</small></span>
            </button>
          </div>
        </div>

        <div>
          <div className="nv-drafts-head" style={{ marginBottom: 10 }}>
            <span className="nv-h2">{t('create.drafts')}</span>
            <button className="nv-link">{fmt(t, 'create.drafts.all', { count: DRAFTS.length })} ›</button>
          </div>
          <div className="nv-card">
            {DRAFTS.map(d => (
              <div key={d.id} className="nv-draft">
                <img className="nv-draft-cover" src={asset(d.cover)} alt="" />
                <div className="nv-draft-body">
                  <strong>{d.title}</strong>
                  <small>{d.detail}</small>
                </div>
                <button className="nv-link">{t(d.action as NovenShellLocaleKey)}</button>
              </div>
            ))}
          </div>
          <div className="nv-draft nv-draft--dashed" style={{ marginTop: 12 }}>
            <span className="nv-draft-cover ph">{glyph.sparkle(20)}</span>
            <div className="nv-draft-body">
              <strong>{t('create.draft.ai')}</strong>
              <small>{fmt(t, 'create.draft.ai.sub', { source: '帮我想一个末日设定' })}</small>
            </div>
            <button className="nv-link">{t('create.draft.view')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
