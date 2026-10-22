/**
 * Composer placeholder as inspiration: one of the 33 kept world premises sits
 * still in the input's placeholder position. The line never animates — the
 * creation hero already owns the page's motion — and it is only drawn by a
 * blank Session's composer. Typing hides it; clearing the draft swaps in a
 * different premise.
 * @module noven-shell/client/input-quote
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CREATE_PREMISE_KEYS, type NovenShellLocaleKey } from './locales.ts'

type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'novenShell'>

/** Pick a world premise, never the same key twice in a row. */
function pickKey(current?: NovenShellLocaleKey): NovenShellLocaleKey {
  let next: NovenShellLocaleKey | undefined
  while (next === undefined || next === current) {
    next = CREATE_PREMISE_KEYS[Math.floor(Math.random() * CREATE_PREMISE_KEYS.length)]
  }
  return next
}

/** The static placeholder line; hidden while the user is writing. */
export function InputQuote({ t, input, session }: Props) {
  const active = session.blank === true && input.draft === '' && input.phase === 'plain'
  const [key, setKey] = useState<NovenShellLocaleKey>(() => pickKey())
  const wasActive = useRef(active)
  const marker = useRef<HTMLSpanElement | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)

  // A new premise follows each finished draft, not a timer: the line is a
  // still suggestion, so it only changes when the composer returns to empty.
  useEffect(() => {
    if (active && !wasActive.current) setKey(current => pickKey(current))
    wasActive.current = active
  }, [active])

  useEffect(() => {
    if (!active) { setHost(null); return }
    const seat = marker.current?.closest('[data-composer-seat]')
    const card = seat?.querySelector('[data-composer-card]')
    const placeholder = card?.querySelector('[data-composer-placeholder]')
    setHost((placeholder?.parentElement ?? card) as HTMLElement | null)
  }, [active])

  return (
    <>
      <span ref={marker} hidden />
      {host !== null && active
        ? createPortal(<div className="nv-input-quote" aria-hidden="true">{t(key)}</div>, host)
        : null}
    </>
  )
}
