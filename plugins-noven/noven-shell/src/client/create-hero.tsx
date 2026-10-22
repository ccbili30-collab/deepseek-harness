/**
 * The creation hero: signature, phrase typer, and the scrolling novel line.
 *
 * One component serves both homes — the 创作 page and an empty conversation's
 * hero brand slot — so the front door never forks into two visual languages.
 * @module noven-shell/client/create-hero
 */
import { useEffect, useMemo, useState } from 'react'
import { CREATE_NOVEL_KEYS, type NovenShellLocaleKey } from './locales.ts'
import type { ShellT } from './pages/Home.tsx'

/** One group of phrases that share the same lead-in. */
interface PhraseGroup {
  readonly lead: string
  readonly tails: readonly string[]
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

const between = (min: number, max: number): number => min + Math.random() * (max - min)

/** Uneven typing: punctuation and the occasional hesitation add a beat. */
function typingDelay(text: string, index: number): number {
  const char = text[index] ?? ''
  return between(65, 150)
    + (/[，。！？、；：…,.!?]/u.test(char) ? between(140, 420) : 0)
    + (Math.random() < 0.06 ? between(280, 720) : 0)
}

/**
 * Type a phrase, hold, then either swap the tail (same lead) or backspace the
 * whole line and start a phrase from the other group. Delays, holds and the
 * thinking pause are all uneven; reduced motion rests on the first phrase.
 */
function useTypedPhrase(groups: readonly PhraseGroup[], reduced: boolean): { text: string; leadLength: number; full: string } {
  const [groupIndex, setGroupIndex] = useState(0)
  const [tailIndex, setTailIndex] = useState(0)
  const [typedLength, setTypedLength] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'deleting-tail' | 'deleting-all' | 'thinking'>('typing')
  const group = groups[groupIndex] ?? groups[0]
  const lead = group?.lead ?? ''
  const tail = group?.tails[tailIndex] ?? ''
  const full = lead + tail

  useEffect(() => {
    setGroupIndex(0)
    setTailIndex(0)
    setPhase('typing')
    setTypedLength(reduced ? (groups[0]?.lead.length ?? 0) + (groups[0]?.tails[0]?.length ?? 0) : groups[0]?.lead.length ?? 0)
  }, [groups, reduced])

  useEffect(() => {
    if (reduced || groups.length === 0) return
    let timer: number | undefined
    if (phase === 'typing') {
      if (typedLength < full.length) {
        timer = window.setTimeout(() => setTypedLength(value => value + 1), typingDelay(full, typedLength))
      } else {
        timer = window.setTimeout(() => {
          setPhase(Math.random() < 0.35 ? 'deleting-all' : 'deleting-tail')
        }, between(2200, 5200))
      }
    } else if (phase === 'deleting-tail') {
      if (typedLength > lead.length) {
        timer = window.setTimeout(() => setTypedLength(value => value - 1), between(35, 80))
      } else {
        timer = window.setTimeout(() => {
          setTailIndex(current => {
            const count = group?.tails.length ?? 1
            return count <= 1 ? current : (current + 1 + Math.floor(Math.random() * (count - 1))) % count
          })
          setPhase('typing')
        }, between(180, 420))
      }
    } else if (phase === 'deleting-all') {
      if (typedLength > 0) {
        timer = window.setTimeout(() => setTypedLength(value => value - 1), between(28, 65))
      } else {
        setPhase('thinking')
      }
    } else {
      timer = window.setTimeout(() => {
        setGroupIndex(current => (current + 1) % groups.length)
        setTailIndex(0)
        setTypedLength(0)
        setPhase('typing')
      }, between(1000, 3200))
    }
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [phase, typedLength, groupIndex, tailIndex, full, lead.length, group, groups, reduced])

  return { text: full.slice(0, typedLength), leadLength: lead.length, full }
}

/** Pick an inspiration line, never the same key twice in a row. */
function pickNovelKey(current?: NovenShellLocaleKey): NovenShellLocaleKey {
  let next: NovenShellLocaleKey | undefined
  while (next === undefined || next === current) {
    next = CREATE_NOVEL_KEYS[Math.floor(Math.random() * CREATE_NOVEL_KEYS.length)]
  }
  return next
}

/**
 * The line under the typed title scrolls vertically: the current line rolls
 * up while the next rolls in from below. Reduced motion shows one static line.
 */
function NovelLine({ t, reduced }: { readonly t: ShellT; readonly reduced: boolean }) {
  const [current, setCurrent] = useState<NovenShellLocaleKey>(() => pickNovelKey())
  const [incoming, setIncoming] = useState<NovenShellLocaleKey | null>(null)

  useEffect(() => {
    if (reduced || incoming !== null) return
    const timer = window.setTimeout(() => setIncoming(pickNovelKey(current)), between(3200, 5200))
    return () => window.clearTimeout(timer)
  }, [current, incoming, reduced])

  useEffect(() => {
    if (incoming === null) return
    const timer = window.setTimeout(() => {
      setCurrent(incoming)
      setIncoming(null)
    }, 620)
    return () => window.clearTimeout(timer)
  }, [incoming])

  /** Click rolls to the next line immediately; reduced motion swaps it whole. */
  const advance = (): void => {
    if (incoming !== null) return
    if (reduced) {
      setCurrent(value => pickNovelKey(value))
      return
    }
    setIncoming(pickNovelKey(current))
  }

  return (
    <button type="button" className="nv-create-novel" onClick={advance}
      aria-label={t(current)} aria-live="off">
      <span className="nv-create-novel-ruler" aria-hidden="true">
        {CREATE_NOVEL_KEYS.map(key => <span key={key}>{t(key)}</span>)}
      </span>
      <span key={current} className={`nv-create-novel-line${incoming === null ? '' : ' nv-create-novel-out'}`}>
        {t(current)}
      </span>
      {incoming !== null && (
        <span key={incoming} className="nv-create-novel-line nv-create-novel-in">
          {t(incoming)}
        </span>
      )}
    </button>
  )
}

/**
 * The hero itself. It owns the phrase loop so the page and the
 * empty-conversation slot share one behavior.
 * @param props - locale translator.
 * @returns hero header node.
 */
export function CreateHero({ t }: { readonly t: ShellT }) {
  const reducedMotion = usePrefersReducedMotion()
  const phraseGroups = useMemo<readonly PhraseGroup[]>(() => [
    {
      lead: t('create.ritual.lead.create'),
      tails: [t('create.ritual.tail.world'), t('create.ritual.tail.character'), t('create.ritual.tail.game')],
    },
    {
      lead: t('create.ritual.lead.want'),
      tails: [
        t('create.ritual.tail.novel'),
        t('create.ritual.tail.world3d'),
        t('create.ritual.tail.wengame'),
        t('create.ritual.tail.settings'),
      ],
    },
  ], [t])
  const typed = useTypedPhrase(phraseGroups, reducedMotion)
  return (
    <div className="nv-create-intro">
      <span className="nv-create-signature">{t('create.ritual.signature')}</span>
      <div className="nv-create-typed" role="heading" aria-level={1} aria-label={typed.full}>
        <span className="nv-create-typed-prefix" aria-hidden="true">{typed.text.slice(0, typed.leadLength)}</span>
        <span className="nv-create-typed-word" aria-hidden="true">
          {typed.text.slice(typed.leadLength)}
          <span className="nv-create-caret" />
        </span>
      </div>
      <NovelLine t={t} reduced={reducedMotion} />
    </div>
  )
}
