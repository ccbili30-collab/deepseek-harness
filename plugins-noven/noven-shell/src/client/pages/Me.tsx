/**
 * 我的 — the creator profile page: profile header, three tabs
 * (世界 / 角色 / 创作库), card grids, and the 创作库 workbench exhibition
 * with its project filter and recent-output list.
 * @module noven-shell/client/pages/Me
 */
import { useState } from 'react'
import type { ShellT } from './Home.tsx'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { MY_CARDS, WORKBENCHES, RECENT_OUTPUTS, coverStyle, type MyCard } from '../data.ts'

interface Props {
  readonly t: ShellT
  /** Navigate to the card editor main panel. */
  readonly onOpenCard?: (id: string) => void
  /** Navigate to a main panel by id (used to open a workbench canvas). */
  readonly onOpenPanel?: (id: MainPanelId) => void
}

const fmt = (t: ShellT, key: Parameters<ShellT>[0], vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

function CardTile({ t, card, onOpenCard }: { readonly t: ShellT; readonly card: MyCard; readonly onOpenCard?: (id: string) => void }) {
  return (
    <button className="nv-card nv-card-item" onClick={() => onOpenCard?.(card.id)}>
      <div className="nv-card-item-cover" style={coverStyle(card.hue)} />
      <div className="nv-card-item-body">
        <div className="nv-card-item-title">{card.title}</div>
        <div className="nv-card-item-meta">
          {card.kind === 'world'
            ? fmt(t, 'me.card.stats', { roles: card.roles, chats: card.chats })
            : fmt(t, 'me.card.stats', { roles: 0, chats: card.chats })}
          {card.dirty && <span className="nv-tag" data-outline="true">{t('me.card.dirty')}</span>}
        </div>
      </div>
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
      <div className="nv-page-inner">
        <div className="nv-card nv-profile">
          <span className="nv-avatar">山</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>山也</div>
            <div className="nv-profile-stats" style={{ marginTop: 6 }}>
              <span><b>0</b>关注</span><span><b>0</b>粉丝</span><span><b>0</b>被珍藏</span>
            </div>
          </div>
          <div className="nv-profile-actions">
            <button className="nv-btn-ghost">{t('me.editProfile')}</button>
            <button className="nv-btn-primary">{t('me.newCard')}</button>
          </div>
        </div>

        <div className="nv-me-tabs">
          {tabs.map(tb => (
            <button key={tb.id} className="nv-me-tab" data-active={tab === tb.id} onClick={() => setTab(tb.id)}>{tb.label}</button>
          ))}
        </div>

        {tab !== 'library' ? (
          <div className="nv-grid">
            {MY_CARDS.filter(c => c.kind === (tab === 'worlds' ? 'world' : 'character')).map(c => (
              <CardTile key={c.id} t={t} card={c} onOpenCard={onOpenCard} />
            ))}
          </div>
        ) : (
          <>
            <div className="nv-feed-pills">
              {projects.map(p => (
                <button key={p} className="nv-chip" data-active={project === p} onClick={() => setProject(p)}>
                  {p === 'all' ? t('me.library.all') : p}
                </button>
              ))}
            </div>
            <div className="nv-grid">
              {WORKBENCHES.filter(w => project === 'all' || w.project === project).map(w => (
                <button key={w.id} className="nv-card nv-card-item" onClick={() => onOpenPanel?.('noven-workbench' as MainPanelId)}>
                  <div className="nv-card-item-cover" style={coverStyle(w.hue, true)} />
                  <div className="nv-card-item-body">
                    <div className="nv-card-item-title">{w.title}</div>
                    <div className="nv-card-item-meta">
                      {w.project} · {fmt(t, 'me.library.files', { count: w.files })}
                    </div>
                    {w.worldCard && <span className="nv-tag" data-outline="true">{t('me.library.worldCard')} · {w.worldCard}</span>}
                  </div>
                </button>
              ))}
            </div>
            <div>
              <div className="nv-h2" style={{ margin: '8px 0 6px' }}>{t('me.library.recent')}</div>
              <div className="nv-card">
                {RECENT_OUTPUTS.map(r => (
                  <div key={r.id} className="nv-recent-row">
                    <strong>{r.name}</strong>
                    <span className="nv-tag" data-outline="true">{r.kind}</span>
                    <small>{t('me.library.from')} · {r.from}</small>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
