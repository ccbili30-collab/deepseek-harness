/**
 * `conversation.input.dock` occupant: the slash-tool chip row above the
 * composer. Chips are fixtures until skill discovery is wired; a click fills
 * `/name ` into the live draft without submitting it.
 * @module noven-shell/client/inputdock
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovenShellLocaleKey } from './locales.ts'

/** Fixture chips, in display order. */
const CHIPS = ['slash.research', 'slash.map', 'slash.comic'] as const

export type SlashChipsProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'novenShell'>

/** `/研究 /画地图 /画漫画` quick-fill row. */
export function SlashChips({ inputActions, t }: SlashChipsProps) {
  return (
    <div className="nv-slash-chips">
      {CHIPS.map(key => (
        <button
          type="button" key={key} className="nv-slash-chip"
          onClick={() => {
            const text = `${t(key)} `
            const span = inputActions.captureInsertion()
            if (!inputActions.insertText(text, span)) inputActions.setDraft(text)
          }}
        >{t(key)}</button>
      ))}
    </div>
  )
}
