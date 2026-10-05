/**
 * 创作 — the creation surface: a slot shelf of card-creation entries (new
 * world / new character / custom, plus the most recent unfinished draft when
 * one exists), a composer card that seeds a real session on submit, a row of
 * starter templates that create pre-named cards, and the bundled skill tools.
 * Handmade entries lead; the AI composer is the secondary path.
 * @module noven-shell/client/pages/Create
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ShellT } from './Home.tsx'
import type { NovenShellLocaleKey } from '../locales.ts'
import type { CardRow } from '../index.tsx'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { glyph } from '../icons.tsx'
import { cardContentUrl } from '../card-api.ts'
import { ExcerptTile } from '../cardtile.tsx'
import { asset } from '../data.ts'
import { CardPick, type CardKind } from './CardPick.tsx'

interface Props {
  readonly t: ShellT
  /** Creates a session in the current workspace and submits the prompt to it. */
  readonly onStartPrompt: (prompt: string) => void
  /** Creates a durable card of the kind, then opens it in the editor. */
  readonly onNewCard: (kind: 'world' | 'character', name: string) => void
  /** Imports a card package file into the workspace, then opens it in the editor. */
  readonly onImportCard: (file: File) => void
  readonly useCards: SnapshotSelectorHook<readonly CardRow[]>
  readonly onOpenCard: (row: CardRow) => void
}

const fmt = (t: ShellT, key: NovenShellLocaleKey, vars: Record<string, string | number>): string =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key))

/** Bundled skills surfaced as tool rows and composer chips — all real slash commands. */
const TOOL_COMMANDS = {
  organize: 'card-organizer',
  study: 'noven-study',
  map: 'noven-draw-map',
  comic: 'noven-draw-comic',
  world: 'wenyou-maker',
  writing: 'human-writing',
} as const

type ToolId = keyof typeof TOOL_COMMANDS

const TOOLS: readonly { id: ToolId; label: NovenShellLocaleKey; icon: (s: number) => ReactNode }[] = [
  { id: 'organize', label: 'create.tool.organize', icon: glyph.sparkle },
  { id: 'study', label: 'create.tool.study', icon: glyph.book },
  { id: 'map', label: 'create.tool.map', icon: glyph.map },
  { id: 'comic', label: 'create.tool.comic', icon: glyph.image },
  { id: 'world', label: 'create.tool.world', icon: glyph.planet },
  { id: 'writing', label: 'create.tool.writing', icon: glyph.chat },
]

/** Composer chip shortcuts: the three showcase skills. */
const CHIPS: readonly { label: NovenShellLocaleKey; command: string }[] = [
  { label: 'create.tool.study', command: TOOL_COMMANDS.study },
  { label: 'create.tool.map', command: TOOL_COMMANDS.map },
  { label: 'create.tool.comic', command: TOOL_COMMANDS.comic },
]

interface SlotProps {
  /** Cover image URL; absent renders the tile's inner node instead. */
  readonly cover?: string
  readonly inner?: ReactNode
  readonly title: string
  readonly sub: string
  readonly badge?: string
  readonly empty?: boolean
  readonly disabled?: boolean
  readonly hint?: string
  readonly onClick?: () => void
}

/** One creation slot: a pure artwork tile with its caption in the page air below. */
function Slot({ cover, inner, title, sub, badge, empty, disabled, hint, onClick }: SlotProps) {
  return (
    <button className="nv-slot" onClick={onClick} disabled={disabled} title={hint}>
      <span className={`nv-slot-tile${empty ? ' nv-slot-empty' : ''}`}>
        {cover !== undefined ? <img src={cover} alt="" /> : inner}
        {badge !== undefined && <span className="nv-slot-badge">{badge}</span>}
      </span>
      <span className="nv-slot-cap">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
    </button>
  )
}

const TEMPLATES: readonly {
  readonly name: NovenShellLocaleKey
  readonly sub: NovenShellLocaleKey
  readonly cover: string
  /** Card pairs created on click — character first so the editor lands on the world. */
  readonly creates: readonly { kind: 'world' | 'character'; name: NovenShellLocaleKey }[]
}[] = [
  { name: 'create.tpl.islands', sub: 'create.tpl.islands.sub', cover: 'tpl-islands.webp',
    creates: [{ kind: 'world', name: 'create.tpl.islands' }] },
  { name: 'create.tpl.town', sub: 'create.tpl.town.sub', cover: 'tpl-town.webp',
    creates: [{ kind: 'world', name: 'create.tpl.town' }] },
  { name: 'create.tpl.drift', sub: 'create.tpl.drift.sub', cover: 'tpl-drift.webp',
    creates: [{ kind: 'character', name: 'create.tpl.drift.character' }, { kind: 'world', name: 'create.tpl.drift' }] },
]

export function Create({ t, onStartPrompt, onNewCard, onImportCard, useCards, onOpenCard }: Props) {
  const [draft, setDraft] = useState('')
  const [pick, setPick] = useState<CardKind | null>(null)
  const drafts = useCards(rows => rows.filter(r => r.hasDraft))
  const worldCount = useCards(rows => rows.filter(r => r.kind === 'WORLD').length)
  const charCount = useCards(rows => rows.filter(r => r.kind === 'CHARACTER').length)
  const lastDraft = drafts[0]

  const send = () => {
    const text = draft.trim()
    if (text.length === 0) return
    onStartPrompt(text)
    setDraft('')
  }

  return (
    <div className="nv-page">
      <div className="nv-inner" style={{ maxWidth: 900 }}>
        <div>
          <div className="nv-h1">{t('nav.create')}</div>
          <div className="nv-sub">{t('create.title.sub')}</div>
        </div>

        <div className="nv-slots">
          <Slot cover={asset('cover-new-world.webp')} title={t('create.slot.world')}
            sub={t('create.slot.world.sub')} onClick={() => setPick('world')} />
          <Slot cover={asset('cover-new-character.webp')} title={t('create.slot.character')}
            sub={t('create.slot.character.sub')} onClick={() => setPick('character')} />
          <Slot empty inner={<span className="nv-slot-plus">{glyph.plus(26)}</span>}
            title={t('create.slot.custom')} sub={t('create.slot.custom.sub')}
            disabled hint={t('create.slot.custom.soon')} />
          {lastDraft !== undefined && (
            <Slot
              cover={lastDraft.coverRef === undefined ? undefined
                : cardContentUrl(lastDraft.workspaceRoot, lastDraft.dir, lastDraft.coverRef)}
              inner={lastDraft.excerpt !== undefined
                ? <ExcerptTile module={lastDraft.excerpt.module} text={lastDraft.excerpt.text} />
                : <span className="nv-slot-plus">{glyph.file(26)}</span>}
              title={lastDraft.name}
              sub={fmt(t, 'create.draft.unsaved', { count: lastDraft.modules })}
              badge={t('create.slot.draft')}
              onClick={() => onOpenCard(lastDraft)} />
          )}
        </div>

        <div className="nv-composer">
          <textarea
            className="nv-composer-input"
            placeholder={t('create.composer.placeholder')}
            value={draft}
            rows={2}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <div className="nv-composer-bar">
            <div className="nv-composer-chips">
              {CHIPS.map(chip => (
                <button key={chip.command} type="button" className="nv-composer-chip"
                  onClick={() => setDraft(`/${chip.command} `)}>
                  {glyph.slash(11)} {t(chip.label)}
                </button>
              ))}
            </div>
            <button className="nv-send" onClick={send} disabled={draft.trim().length === 0}
              aria-label={t('create.composer.send')}>
              {glyph.send(15)}
            </button>
          </div>
        </div>

        <div className="nv-create-bottom">
          <section>
            <div className="nv-sec-label">{t('create.sec.templates')}</div>
            <div className="nv-tpls">
              {TEMPLATES.map(tpl => (
                <button key={tpl.name} className="nv-tpl"
                  onClick={() => tpl.creates.forEach(c => onNewCard(c.kind, t(c.name)))}>
                  <img className="nv-tpl-cover" src={asset(tpl.cover)} alt="" />
                  <span className="nv-tpl-body">
                    <strong>{t(tpl.name)}</strong>
                    <small>{t(tpl.sub)}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="nv-sec-label">{t('create.sec.tools')}</div>
            <div className="nv-tools2">
              {TOOLS.map(tool => (
                <button key={tool.id} className="nv-tool2"
                  onClick={() => onStartPrompt(`/${TOOL_COMMANDS[tool.id]}`)}>
                  <span className="nv-tool2-ic">{tool.icon(15)}</span>
                  {t(tool.label)}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {pick !== null && (
        <CardPick t={t} kind={pick}
          defaultName={pick === 'world'
            ? `${t('create.pick.name.default.world')} ${worldCount + 1}`
            : `${t('create.pick.name.default.character')} ${charCount + 1}`}
          onClose={() => setPick(null)}
          onCreate={name => { setPick(null); onNewCard(pick, name) }}
          onImport={file => { setPick(null); onImportCard(file) }} />
      )}
    </div>
  )
}
