/**
 * Blank-Session creation guide on `conversation.input.dock`.
 *
 * The hero of a fresh conversation is the product's front door: it must teach
 * what can be made here without ever faking the composer. The occupant renders
 * (while the Session is still blank) three real, clickable layers:
 *   1. 继续 — recent unfinished card drafts (only when this project has any).
 *   2. Try these — concrete first-line prompts that fill the resident composer
 *      (nothing is sent; the user edits and sends with the real composer).
 *   3. 能力 chips — `/command` shortcuts plus 手作 (switch to the IDE
 *      arrangement in this same Session).
 * Everything collapses the moment a draft exists; after the first turn the
 * whole occupant leaves (the resident composer docks itself).
 * @module noven-shell/client/inputdock
 */
import { useState } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovenShellLocaleKey } from './locales.ts'
import { glyph } from './icons.tsx'

/** One unfinished draft surfaced on the blank hero. */
export interface DraftHint {
  readonly cardId: string
  readonly name: string
  readonly workspaceRoot: string
  readonly sessionId: string | undefined
  readonly modules: number
}

/** A ready-to-edit first line; clicking fills the resident composer, never sends. */
interface PromptIdea {
  readonly prompt: NovenShellLocaleKey
  readonly icon: 'globe' | 'user' | 'image' | 'book'
}

const PROMPT_IDEAS: readonly PromptIdea[] = [
  { prompt: 'guide.idea.world', icon: 'globe' },
  { prompt: 'guide.idea.character', icon: 'user' },
  { prompt: 'guide.idea.story', icon: 'book' },
  { prompt: 'guide.idea.comic', icon: 'image' },
]

/** Built-in creation skills eligible for the capability chips. */
const CREATION_CHIPS: readonly { name: string; label: NovenShellLocaleKey }[] = [
  { name: 'wenyou-maker', label: 'chip.wenyou' },
  { name: 'card-organizer', label: 'chip.cards' },
  { name: 'draw-map', label: 'chip.map' },
  { name: 'draw-comic', label: 'chip.comic' },
  { name: 'study', label: 'chip.study' },
  { name: 'human-writing', label: 'chip.writing' },
]

/** At most this many capability chips per fresh conversation. */
const CHIP_COUNT = 3

/** Injected face: commands, IDE flag, drafts, draft opener, and the 手作 switch. */
export interface BlankDockInjected {
  readonly hooks: {
    readonly commands: ObservableSnapshot<readonly { name: string; description: string }[]>
    /** True while this Session is the visible one and stands in the IDE arrangement. */
    readonly ide: ObservableSnapshot<boolean>
    /** Unfinished card drafts in the current project, newest first; empty elsewhere. */
    readonly drafts: ObservableSnapshot<readonly DraftHint[]>
  }
  /** Open one unfinished card draft in the canvas. */
  readonly openDraft: (draft: DraftHint) => void
  /** Switch this Session to the IDE arrangement and raise the canvas. */
  readonly handcraft: () => void
}

export type BlankDockProps = PropsRuntime<'conversation.input.dock'>
  & InjectFace<BlankDockInjected>
  & PropsLocale<'novenShell'>

const IDEA_ICONS = {
  globe: glyph.globe,
  user: glyph.user,
  image: glyph.image,
  book: glyph.book,
} as const

/** Blank-hero creation guide; returns null once the Session has engaged. */
export function BlankDock({
  session, input, inputActions, useCommands, useIde, useDrafts, openDraft, handcraft, t,
}: BlankDockProps) {
  const commands = useCommands(state => state)
  const ide = useIde(state => state)
  const drafts = useDrafts(rows => rows.slice(0, 2))
  // One stable random pick per mount — the chip row is guidance, not a catalog.
  const [picked] = useState(() => {
    const pool = [...CREATION_CHIPS]
    const out: typeof CREATION_CHIPS[number][] = []
    while (out.length < CHIP_COUNT && pool.length > 0) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return out
  })
  if (!session.blank && !session.awaitingFirstTurn) return null

  const fill = (text: string): void => {
    const span = inputActions.captureInsertion()
    if (!inputActions.insertText(text, span)) inputActions.setDraft(text)
  }
  const available = new Set(commands.map(c => c.name))
  const chips = picked.filter(c => available.has(c.name))
  const showHandcraft = session.blank && !ide
  const drafting = input.draft.length > 0

  return (
    <div className="nv-create-guide">
      {!drafting && drafts.length > 0 && (
        <section className="nv-guide-block nv-guide-continue">
          <div className="nv-guide-label">{t('guide.continue')}</div>
          <div className="nv-guide-drafts">
            {drafts.map(draft => (
              <button key={draft.cardId} type="button" className="nv-guide-draft" onClick={() => openDraft(draft)}>
                <span className="nv-guide-draft-icon">{glyph.file(15)}</span>
                <span className="nv-guide-draft-body">
                  <strong>{draft.name}</strong>
                  <small>{t('guide.draft.modules').replace('{count}', String(draft.modules))}</small>
                </span>
                <span className="nv-guide-draft-go">↗</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!drafting && (
      <section className="nv-guide-block">
        <div className="nv-guide-label">{t('guide.ideas')}</div>
        <div className="nv-guide-ideas">
          {PROMPT_IDEAS.map(idea => {
            const Icon = IDEA_ICONS[idea.icon]
            return (
              <button key={idea.prompt} type="button" className="nv-guide-idea" onClick={() => fill(t(idea.prompt))}>
                <span className="nv-guide-idea-icon">{Icon(16)}</span>
                <span>{t(idea.prompt)}</span>
              </button>
            )
          })}
        </div>
      </section>
      )}

      <div className="nv-guide-actions">
        <div className="nv-slash-chips">
          {!drafting && chips.map(chip => (
            <button
              type="button" key={chip.name} className="nv-slash-chip"
              onClick={() => fill(`/${chip.name} `)}
            >{t(chip.label)}</button>
          ))}
        </div>
        {showHandcraft && (
          <button type="button" className={`nv-handcraft-chip${drafting ? ' nv-handcraft-chip-alone' : ''}`} title={t('handcraft.hint')} onClick={handcraft}>
            {glyph.file(13)}<span>{t('handcraft.label')}</span><span className="nv-handcraft-arrow">↗</span>
          </button>
        )}
      </div>
    </div>
  )
}
