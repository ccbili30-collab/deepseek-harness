/**
 * 首页 — the community feed: a search field, 发现/关注 tabs, kind pills, and
 * a masonry mixing image cards (cover + badges) with text cards (badge, body,
 * 进入世界/以此创作 actions). Selecting a card docks the landing panel on the
 * right; the feed stays put behind it.
 * @module noven-shell/client/pages/Home
 */
import { useState } from 'react'
import type { NovenShellLocaleKey } from '../locales.ts'
import { FEED, asset, type FeedCard } from '../data.ts'
import { glyph } from '../icons.tsx'

export type ShellT = (key: NovenShellLocaleKey) => string

interface Props { readonly t: ShellT }

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

function KindTag({ t, kind, dot }: { readonly t: ShellT; readonly kind: FeedCard['kind']; readonly dot?: boolean }) {
  return (
    <span className="nv-tag">
      {kind === 'world' ? t('home.filter.world') : t('home.filter.character')}
      {dot && <span className="dot" />}
    </span>
  )
}

function FeedCardView({ t, card, onOpen }: { readonly t: ShellT; readonly card: FeedCard; readonly onOpen: () => void }) {
  return (
    <button className="nv-tcard" onClick={onOpen}>
      {card.cover !== undefined ? (
        <span className="nv-tcard-tile">
          <img src={asset(card.cover)} alt="" />
          <span className="nv-badge-cover">{card.kind === 'world' ? t('home.filter.world') : t('home.filter.character')}</span>
          {card.enterable && <span className="nv-badge-enter">{t('home.enterable')}</span>}
        </span>
      ) : (
        <span className="nv-tcard-tile nv-tcard-text">
          <KindTag t={t} kind={card.kind} />
          <span className="tt-title">{card.title}</span>
          <span className="tt-desc">{card.desc}</span>
          {card.enterable && <span className="nv-badge-enter">{t('home.enterable')}</span>}
        </span>
      )}
      <span className="nv-tcard-cap">
        {card.cover !== undefined && <strong>{card.title}</strong>}
        <span className="nv-tcard-meta">
          <span className="nv-avatar">{card.author.slice(0, 1)}</span>
          <span>{card.author}</span>
          <span className="nv-tcard-acts">
            <span>{glyph.heart(13)} {card.likes}</span>
            <span>{glyph.fork(13)} {card.forks}</span>
            <span>{glyph.bookmark(13)}</span>
          </span>
        </span>
      </span>
    </button>
  )
}

function Landing({ t, card, onClose }: { readonly t: ShellT; readonly card: FeedCard; readonly onClose: () => void }) {
  return (
    <aside className="nv-landing">
      <button className="nv-landing-close" onClick={onClose} aria-label="close">×</button>
      <div className="nv-landing-scroll">
        <KindTag t={t} kind={card.kind} dot />
        <div className="nv-h1" style={{ fontSize: 22 }}>{card.title}</div>
        <div className="nv-fcard-author">
          <span className="nv-avatar">{card.author.slice(0, 1)}</span>
          <span>{card.author}</span>
          <button className="nv-btn-ghost" style={{ marginLeft: 'auto', padding: '5px 16px', borderColor: 'var(--nv-accent)', color: 'var(--nv-accent-deep)' }}>
            {t('home.follow')}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75 }}>{card.desc}</p>
        {card.modules && (
          <section>
            <div className="nv-section-head"><span className="nv-h2" style={{ fontSize: 13 }}>模块</span></div>
            <div className="nv-mod-list">
              {card.modules.map(m => (
                <div key={m.title} className="nv-mod-item"><h4>{m.title}</h4><p>{m.preview}</p></div>
              ))}
            </div>
          </section>
        )}
        {card.roles && (
          <section>
            <div className="nv-section-head"><span className="nv-h2" style={{ fontSize: 13 }}>{t('home.roles')}</span><small>{card.roles.length}</small></div>
            <div className="nv-role-row" style={{ marginTop: 10 }}>
              {card.roles.map(r => (
                <div key={r} className="nv-role"><span className="nv-avatar">{r.slice(0, 1)}</span><span>{r}</span></div>
              ))}
            </div>
          </section>
        )}
        <div className="nv-fork-row">
          <span>{fmt(t, 'home.forkCount', { count: card.forks })}</span>
          <span style={{ color: 'var(--nv-secondary-text)' }}>›</span>
        </div>
        <div className="nv-h2" style={{ fontSize: 13 }}>{t('home.dialogs')}（0）</div>
      </div>
      <div className="nv-landing-foot">
        <button className="nv-btn-primary">{t('home.enter')}</button>
        <button className="nv-btn-ghost">{t('home.fork')}</button>
        <button className="nv-iconbtn" style={{ height: 38, width: 38 }}>{glyph.pin(15)}</button>
      </div>
    </aside>
  )
}

export function Home({ t }: Props) {
  const [feed, setFeed] = useState<'discover' | 'following'>('discover')
  const [kind, setKind] = useState<'all' | 'world' | 'character'>('all')
  const [open, setOpen] = useState<FeedCard | undefined>()

  const cards = FEED.filter(c => kind === 'all' || c.kind === kind)
  const pills: readonly { id: 'all' | 'world' | 'character'; label: NovenShellLocaleKey }[] = [
    { id: 'all', label: 'home.filter.all' },
    { id: 'character', label: 'home.filter.character' },
    { id: 'world', label: 'home.filter.world' },
  ]

  return (
    <div className="nv-page" style={{ display: 'flex', overflow: 'hidden' }}>
      <div className="nv-inner" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <div className="nv-search"><SearchGlyph /><input placeholder={t('home.search')} /></div>
        <div className="nv-feed-tabs">
          <button className="nv-feed-tab" data-active={feed === 'discover'} onClick={() => setFeed('discover')}>{t('home.discover')}</button>
          <button className="nv-feed-tab" data-active={feed === 'following'} onClick={() => setFeed('following')}>{t('home.following')}</button>
          <div className="nv-feed-pills" style={{ marginLeft: 'auto' }}>
            {pills.map(p => (
              <button key={p.id} className="nv-pill" data-active={kind === p.id} onClick={() => setKind(p.id)}>{t(p.label)}</button>
            ))}
          </div>
        </div>
        {feed === 'following' ? (
          <div className="nv-empty">{t('messages.empty')}</div>
        ) : (
          <div className="nv-masonry">
            {cards.map(card => (
              <FeedCardView key={card.id} t={t} card={card} onOpen={() => setOpen(card)} />
            ))}
          </div>
        )}
      </div>
      {open && <Landing t={t} card={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}

/** Magnifier for the search field. */
function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
    </svg>
  )
}
