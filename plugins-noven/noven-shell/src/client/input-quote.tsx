/**
 * Composer placeholder as inspiration: one of the 33 kept world premises types
 * into the input's placeholder position, clears to blank, then starts another.
 * It mounts through the input dock (which owns the live draft), portals next to
 * the native placeholder, and steps aside the moment the draft has text.
 * WenKai keeps it distinct from the product sans.
 * @module noven-shell/client/input-quote
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CREATE_PREMISE_KEYS, type NovenShellLocaleKey } from './locales.ts'
import type { ShellT } from './pages/Home.tsx'

type Props = PropsRuntime<'conversation.input.dock'> & PropsLocale<'novenShell'>

const between = (min: number, max: number): number => min + Math.random() * (max - min)

/** Pick a world premise, never the same key twice in a row. */
function pickKey(current?: NovenShellLocaleKey): NovenShellLocaleKey {
  let next: NovenShellLocaleKey | undefined
  while (next === undefined || next === current) {
    next = CREATE_PREMISE_KEYS[Math.floor(Math.random() * CREATE_PREMISE_KEYS.length)]
  }
  return next
}

/** Follow the OS reduced-motion preference without a listener leak. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (media === undefined) return
    const onChange = (): void => setReduced(media.matches)
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** Type → hold → clear → pause → next; reduced motion shows each line whole. */
function useQuoteTyping(active: boolean, t: ShellT): string {
  const reduced = usePrefersReducedMotion()
  const [key, setKey] = useState<NovenShellLocaleKey>(() => pickKey())
  const [length, setLength] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const wasActive = useRef(active)
  const full = t(key)

  useEffect(() => {
    if (active && !wasActive.current) {
      setKey(current => pickKey(current))
      setLength(0)
      setDeleting(false)
    }
    wasActive.current = active
  }, [active])

  useEffect(() => {
    if (reduced || !active) return
    let timer: number | undefined
    if (!deleting) {
      if (length < full.length) {
        timer = window.setTimeout(() => setLength(value => value + 1), between(55, 120))
      } else {
        timer = window.setTimeout(() => setDeleting(true), between(1600, 3600))
      }
    } else if (length > 0) {
      timer = window.setTimeout(() => setLength(value => value - 1), between(25, 60))
    } else {
      timer = window.setTimeout(() => {
        setKey(current => pickKey(current))
        setDeleting(false)
      }, between(500, 1400))
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [active, deleting, length, full, reduced])

  return reduced ? full : full.slice(0, length)
}

/** The rotating placeholder line; hidden while the user is writing. */
export function InputQuote({ t, input }: Props) {
  const active = input.draft === '' && input.phase === 'plain'
  const text = useQuoteTyping(active, t)
  const marker = useRef<HTMLSpanElement | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)

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
        ? createPortal(<div className="nv-input-quote" aria-hidden="true">{text}</div>, host)
        : null}
    </>
  )
}
