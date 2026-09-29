/**
 * 首页 — the community feed: 发现/关注 tabs, kind pills, and a masonry of
 * work cards. Clicking a card slides the landing drawer in from the right;
 * the feed stays put behind it.
 * @module noven-shell/client/pages/Home
 */
import { useState } from 'react'
import type { NovenShellLocaleKey } from '../locales.ts'
import { FEED, coverStyle, type FeedCard } from '../data.ts'

export type ShellT = (key: NovenShellLocaleKey) => string

interface Props { readonly t: ShellT }

/** Card cover: gradient placeholder until real covers exist. */
function Cover({ card }: { readonly card: FeedCard }) {
  return <div className="nv-workcard-cover" style={{ ...coverStyle(card.hue), aspectRatio: card.ar }} />
}

function LandingDrawer({ t, card, onClose }: { readonly t: ShellT; readonly card: FeedCard; readonly onClose: () => void }) {
  return (
    <div className="nv-drawer-wrap">
      <div className="nv-drawer-mask" onClick={onClose} />
      <aside className="nv-drawer">
        <button className="nv-drawer-close" onClick={onClose} aria-label="close">×</button>
        <div className="nv-drawer-scroll">
          <div className="nv-drawer-cover" style={coverStyle(card.hue)} />
          <div className="nv-drawer-body">
            <div>
              <div className="nv-h1">{card.title}</div>
              <div className="nv-workcard-author" style={{ marginTop: 8 }}>
                <span className="nv-avatar">{card.author.slice(0, 1)}</span>
                <span>{card.author}</span>
                <button className="nv-btn-ghost" style={{ marginLeft: 'auto', padding: '4px 14px' }}>{t('home.follow')}</button>
              </div>
            </div>
            <div className="nv-workcard-meta">
              {card.enterable && <span className="nv-tag">{t('home.enterable')}</span>}
              <span className="nv-tag" data-outline="true">{t('home.modifiable')}</span>
              <span>{card.forks} {t('home.forkedBy')}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--nv-primary-text)' }}>{card.desc}</p>
            {card.modules && (
              <section>
                <div className="nv-h2" style={{ marginBottom: 8 }}>模块</div>
                <div className="nv-mod-list">
                  {card.modules.map(m => (
                    <div key={m.title} className="nv-mod-item">
                      <div><h4>{m.title}</h4><p>{m.preview}</p></div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {card.roles && (
              <section>
                <div className="nv-h2" style={{ marginBottom: 8 }}>{t('home.roles')}</div>
                <div className="nv-role-row">
                  {card.roles.map(r => (
                    <div key={r} className="nv-role"><span className="nv-avatar">{r.slice(0, 1)}</span><span>{r}</span></div>
                  ))}
                </div>
              </section>
            )}
            <section>
              <div className="nv-h2">{t('home.dialogs')}（0）</div>
            </section>
          </div>
        </div>
        <div className="nv-drawer-foot">
          <button className="nv-btn-primary">{t('home.enter')}</button>
          <button className="nv-btn-ghost">{t('home.fork')}</button>
        </div>
      </aside>
    </div>
  )
}

export function Home({ t }: Props) {
  const [feed, setFeed] = useState<'discover' | 'following'>('discover')
  const [kind, setKind] = useState<'all' | 'world' | 'character'>('all')
  const [open, setOpen] = useState<FeedCard | undefined>()

  const cards = FEED.filter(c => kind === 'all' || c.kind === kind)
  const pills: readonly { id: 'all' | 'world' | 'character'; label: NovenShellLocaleKey }[] = [
    { id: 'all', label: 'home.filter.all' },
    { id: 'world', label: 'home.filter.world' },
    { id: 'character', label: 'home.filter.character' },
  ]

  return (
    <div className="nv-page">
      <div className="nv-page-inner">
        <div className="nv-feed-tabs">
          <button className="nv-feed-tab" data-active={feed === 'discover'} onClick={() => setFeed('discover')}>{t('home.discover')}</button>
          <button className="nv-feed-tab" data-active={feed === 'following'} onClick={() => setFeed('following')}>{t('home.following')}</button>
          <div className="nv-feed-pills" style={{ marginLeft: 'auto' }}>
            {pills.map(p => (
              <button key={p.id} className="nv-chip" data-active={kind === p.id} onClick={() => setKind(p.id)}>{t(p.label)}</button>
            ))}
          </div>
        </div>
        {feed === 'following' ? (
          <div className="nv-empty">{t('messages.empty')}</div>
        ) : (
          <div className="nv-masonry">
            {cards.map(card => (
              <button key={card.id} className="nv-card nv-workcard" onClick={() => setOpen(card)}>
                <Cover card={card} />
                <div className="nv-workcard-body">
                  <div className="nv-workcard-title">{card.title}</div>
                  <div className="nv-workcard-desc">{card.desc}</div>
                  <div className="nv-workcard-meta">
                    {card.enterable && <span className="nv-tag">{t('home.enterable')}</span>}
                    <span>{card.forks} {t('home.forkedBy')}</span>
                  </div>
                  <div className="nv-workcard-author">
                    <span className="nv-avatar">{card.author.slice(0, 1)}</span>
                    <span>{card.author}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {open && <LandingDrawer t={t} card={open} onClose={() => setOpen(undefined)} />}
    </div>
  )
}
