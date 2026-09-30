/**
 * 我的 — the creator profile page: flat profile header (avatar, name, bio,
 * Noven mark, stats, actions), the 世界/角色/创作库 tab row with a search
 * field and sort, card grids with a dashed "new" tile, and the 创作库
 * exhibition (project pills, workbench cards, recent outputs).
 * @module noven-shell/client/pages/Me
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { MY_CARDS, WORKBENCHES, RECENT_OUTPUTS, asset, type MyCard } from '../data.ts'
import { glyph } from '../icons.tsx'

interface Props {
  readonly t: ShellT
  /** Navigate to the card editor main panel. */
  readonly onOpenCard?: (id: string) => void
  /** Navigate to a main panel by id (used to open a workbench canvas). */
  readonly onOpenPanel?: (id: MainPanelId) => void
}

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

function KindBadge({ t, kind }: { readonly t: ShellT; readonly kind: MyCard['kind'] }) {
  return (
    <span className="nv-badge-cover">{kind === 'world' ? t('me.tab.worlds').replace('们', '') : t('me.tab.characters').replace('们', '')}</span>
  )
}

function MyCardTile({ t, card, onOpenCard }: { readonly t: ShellT; readonly card: MyCard; readonly onOpenCard?: (id: string) => void }) {
  return (
    <button className="nv-card nv-ccard" onClick={() => onOpenCard?.(card.id)}>
      {card.cover && (
        <span className="nv-ccard-cover">
          <img src={asset(card.cover)} alt="" />
          <KindBadge t={t} kind={card.kind} />
        </span>
      )}
      <span className="nv-ccard-body">
        {!card.cover && <span className="nv-tag">{card.kind === 'world' ? '世界' : '角色'}</span>}
        <span className="nv-ccard-title">{card.title}</span>
        {card.desc && <span className="nv-ccard-desc">{card.desc}</span>}
        <span className="nv-ccard-meta">
          {card.kind === 'world'
            ? fmt(t, 'me.card.stats', { roles: card.roles, chats: card.chats })
            : fmt(t, 'me.card.chatsOnly', { chats: card.chats })}
          {card.dirty && <span className="nv-dirty">{t('me.card.dirty')}</span>}
        </span>
      </span>
    </button>
  )
}

export function Me({ t, onOpenCard, onOpenPanel }: Props) {
  const [tab, setTab] = useState<'worlds' | 'characters' | 'library'>('worlds')
  const [project, setProject] = useState('all')

  const projects = ['all', ...new Set(WORKBENCHES.map(w => w.project))]
  const tabs = [
    { id: 'worlds', label: t('me.tab.worlds') },
    { id: 'characters', label: t('me.tab.characters') },
    { id: 'library', label: t('me.tab.library') },
  ] as const

  return (
    <div className="nv-page">
      <div className="nv-inner">
        <div className="nv-profile">
          <span className="nv-avatar"><img src={asset('cover-achi.webp')} alt="" /></span>
          <div>
            <div className="nv-profile-name">山也</div>
            <div className="nv-profile-bio">{t('me.bio')}</div>
            <div className="nv-profile-mark">{t('me.mark')}</div>
            <div className="nv-profile-stats">
              <span><b>12</b>{t('me.stat.follows')}</span>
              <span><b>48</b>{t('me.stat.fans')}</span>
              <span><b>230</b>{t('me.stat.saved')}</span>
            </div>
          </div>
          <div className="nv-profile-actions">
            <button className="nv-btn-ghost">{t('me.editProfile')}</button>
            <button className="nv-btn-primary">{t('me.newCard')}</button>
          </div>
        </div>

        <div className="nv-me-bar">
          <div className="nv-me-tabs">
            {tabs.map(tb => (
              <button key={tb.id} className="nv-me-tab" data-active={tab === tb.id} onClick={() => setTab(tb.id)}>{tb.label}</button>
            ))}
          </div>
          {tab !== 'library' && (
            <div className="nv-search"><SearchGlyph /><input placeholder={t('me.search')} /></div>
          )}
          <button className="nv-sort" style={tab === 'library' ? { marginLeft: 'auto' } : undefined}>{t('me.sort')} ▾</button>
        </div>

        {tab !== 'library' ? (
          <div className="nv-grid">
            {MY_CARDS.filter(c => c.kind === (tab === 'worlds' ? 'world' : 'character')).map(c => (
              <MyCardTile key={c.id} t={t} card={c} onOpenCard={onOpenCard} />
            ))}
            <button className="nv-newcard">
              <span className="plus">+</span>
              {tab === 'worlds' ? t('me.newWorldTile') : t('me.newCharTile')}
            </button>
          </div>
        ) : (
          <>
            <div className="nv-proj-pills">
              {projects.map(p => (
                <button key={p} className="nv-pill" data-active={project === p} onClick={() => setProject(p)}>
                  {p === 'all' ? t('me.library.all') : p}
                </button>
              ))}
            </div>
            <div className="nv-h2">{t('me.library.workbenches')}</div>
            <div className="nv-wb-grid">
              {WORKBENCHES.filter(w => project === 'all' || w.project === project).map(w => (
                <button key={w.id} className="nv-card nv-wb" onClick={() => onOpenPanel?.('noven-workbench' as MainPanelId)}>
                  <span className="nv-wb-cover">
                    {w.cover
                      ? <img src={asset(w.cover)} alt="" />
                      : <span className="ph">{glyph.file(26)}</span>}
                    <span className="nv-badge-cover">{w.badge}</span>
                  </span>
                  <span className="nv-wb-body">
                    <span className="nv-ccard-title">{w.title}</span>
                    <span className="nv-ccard-meta">{fmt(t, 'me.library.files', { project: w.project, files: w.files })}</span>
                    {w.worldCard && <span className="nv-tag">{fmt(t, 'me.library.worldCard', { card: w.worldCard })}</span>}
                  </span>
                </button>
              ))}
            </div>
            <div className="nv-drafts-head">
              <span className="nv-h2">{t('me.library.recent')}</span>
              <button className="nv-link" style={{ color: 'var(--nv-secondary-text)', fontWeight: 400 }}>{t('me.library.allOutputs')} ›</button>
            </div>
            <div className="nv-card nv-recent">
              {RECENT_OUTPUTS.map(r => (
                <div key={r.id} className="nv-recent-row">
                  <span className="nv-recent-ic">{r.icon === 'image' ? glyph.image(15) : glyph.file(15)}</span>
                  <div className="nv-recent-body">
                    <strong>{r.name}</strong>
                    <small>{fmt(t, 'me.library.from', { session: r.from })}</small>
                  </div>
                  <time>{r.ago}</time>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}
