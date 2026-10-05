/**
 * `conversation.input.dock` occupant: creation-skill suggestion chips shown
 * only while the Session is still blank — a discoverability hint, not a
 * permanent toolbar. A random subset of the built-in creation skills slides
 * in when the fresh conversation mounts; the row withdraws the moment the
 * draft stops being empty, and never returns once the conversation engages.
 * @module noven-shell/client/inputdock
 */
import { useState } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovenShellLocaleKey } from './locales.ts'

/** Injected catalog face: the session's command names as a bound hook. */
export interface SlashChipsInjected {
  readonly hooks: {
    readonly commands: ObservableSnapshot<readonly { name: string; description: string }[]>
  }
}

export type SlashChipsProps = PropsRuntime<'conversation.input.dock'>
  & InjectFace<SlashChipsInjected>
  & PropsLocale<'novenShell'>

/** Built-in creation skills eligible for the new-conversation hint row, with their display labels. */
const CREATION_CHIPS: readonly { name: string; label: NovenShellLocaleKey }[] = [
  { name: 'wenyou-maker', label: 'chip.wenyou' },
  { name: 'card-organizer', label: 'chip.cards' },
  { name: 'draw-map', label: 'chip.map' },
  { name: 'draw-comic', label: 'chip.comic' },
  { name: 'study', label: 'chip.study' },
  { name: 'human-writing', label: 'chip.writing' },
]

/** At most this many hints per fresh conversation. */
const CHIP_COUNT = 3

/** `/name` hint row for a blank session; slides in on mount, hides on any draft. */
export function SlashChips({ session, input, inputActions, useCommands, t }: SlashChipsProps) {
  const commands = useCommands(state => state)
  // One random pick per mount — the row is decorative guidance, not a catalog.
  const [picked] = useState(() => {
    const pool = [...CREATION_CHIPS]
    const out: typeof CREATION_CHIPS[number][] = []
    while (out.length < CHIP_COUNT && pool.length > 0) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return out
  })
  if (!session.blank && !session.awaitingFirstTurn) return null
  if (input.draft.length > 0) return null
  const available = new Set(commands.map(c => c.name))
  const chips = picked.filter(c => available.has(c.name))
  if (chips.length === 0) return null
  return (
    <div className="nv-slash-chips">
      {chips.map((chip, i) => (
        <button
          type="button" key={chip.name} className="nv-slash-chip"
          style={{ animationDelay: `${i * 90}ms` }}
          onClick={() => {
            const text = `/${chip.name} `
            const span = inputActions.captureInsertion()
            if (!inputActions.insertText(text, span)) inputActions.setDraft(text)
          }}
        >{t(chip.label)}</button>
      ))}
    </div>
  )
}
