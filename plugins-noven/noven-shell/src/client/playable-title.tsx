/** A title that becomes its bound soundtrack's play/pause command on hover or focus. */
import { useLayoutEffect, useRef, type ButtonHTMLAttributes } from 'react'
import { IconPauseOutlineRegular, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ShellT } from './pages/Home.tsx'
import { isSoundtrackPlaying, toggleSoundtrack, useSoundtrackPlayback, type ResolvedSoundtrack, type SoundtrackOwner } from './soundtrack.ts'

/**
 * Render one stable title without nesting a second button inside it.
 * @param props - Title text, locale, resolved track, owner, and optional activation.
 * @returns A title that toggles its bound track, or preserves ordinary activation when unbound.
 */
export function PlayableTitle({ title, track, revision, owner, onActivate, t, className = '', ...buttonProps }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> & {
  readonly title: string
  readonly track: ResolvedSoundtrack | null
  readonly revision: number
  readonly owner: SoundtrackOwner
  readonly onActivate?: () => void
  readonly t: ShellT
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const playback = useSoundtrackPlayback()
  const playing = track !== null && isSoundtrackPlaying(playback, owner, track, revision)
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (button === null) return
    const current = Number.parseFloat(button.style.minWidth) || 0
    button.style.minWidth = `${Math.max(current, button.offsetWidth)}px`
  }, [title])
  return (
    <button
      {...buttonProps}
      ref={buttonRef}
      type="button"
      className={`nv-playable-title ${className}`}
      data-playing={playing || undefined}
      data-has-track={track !== null || undefined}
      aria-label={track === null ? title : `${playing ? t('soundtrack.pause') : t('soundtrack.play')} · ${title}`}
      onClick={(event) => {
        event.stopPropagation()
        onActivate?.()
        if (track !== null) toggleSoundtrack(owner, track, revision)
      }}
    >
      <span className="nv-title-text">{title}</span>
      {track !== null && (
        <span className="nv-title-play" aria-hidden="true">
          {playing ? <IconPauseOutlineRegular size={16} /> : <IconPlayOutlineRegular size={16} />}
        </span>
      )}
      {playing && <span className="nv-playing-dot" aria-hidden="true" />}
    </button>
  )
}
