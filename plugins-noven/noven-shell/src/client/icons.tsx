/**
 * Thin line icons for the Noven nav rows and page furniture. Each icon is a
 * plain function component receiving the slot owner's geometry props
 * (`size`, `active`) — stroke follows currentColor except the mint accents.
 * @module noven-shell/client/icons
 */
import type { CSSProperties } from 'react'

interface IconProps { size: number; active: boolean }

const stroke = (active: boolean, accent = false): CSSProperties => ({
  color: accent ? 'var(--nv-accent-deep)' : active ? 'var(--nv-primary-text)' : 'var(--nv-secondary-text)',
})

function base({ size, active }: IconProps, children: React.ReactNode, accent = false) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" style={stroke(active, accent)}>
      {children}
    </svg>
  )
}

/** 首页 — house. */
export function HomeIcon(p: IconProps) {
  return base(p, <g stroke="currentColor"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></g>)
}

/** 创作 — mint plus in a pill. */
export function CreateIcon(p: IconProps) {
  return base({ ...p, active: true }, (
    <g stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth={1.7}/><path d="M12 8v8M8 12h8"/></g>
  ), true)
}

/** 消息 — bell. */
export function BellIcon(p: IconProps) {
  return base(p, <g stroke="currentColor"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></g>)
}

/** 我的 — person. */
export function MeIcon(p: IconProps) {
  return base(p, <g stroke="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></g>)
}

const wrap = (content: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round">{content}</svg>
)

/** Page-furniture glyphs (fixed stroke, currentColor). */
export const glyph = {
  globe: (s = 16) => wrap(<g><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.6 3 14.4 0 18M12 3c-3 3.6-3 14.4 0 18"/></g>, s),
  planet: (s = 16) => wrap(<g><circle cx="12" cy="12" r="6"/><path d="M3.5 16.5c-2 1-2.6 2.3-1.9 3.2.8 1 3.6.8 7.4-1M20.5 7.5c2-1 2.6-2.3 1.9-3.2-.8-1-3.6-.8-7.4 1" /></g>, s),
  user: (s = 16) => wrap(<g><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></g>, s),
  upload: (s = 16) => wrap(<g><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 20h16"/></g>, s),
  sparkle: (s = 16) => wrap(<g><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/></g>, s),
  map: (s = 16) => wrap(<g><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></g>, s),
  book: (s = 16) => wrap(<g><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></g>, s),
  image: (s = 16) => wrap(<g><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 4 4"/></g>, s),
  send: (s = 16) => wrap(<g><path d="M21 3 10 14"/><path d="M21 3l-7 18-3-8-8-3z"/></g>, s),
  pin: (s = 16) => wrap(<g><path d="M9 4h6l1 7 3 3v2H5v-2l3-3z"/><path d="M12 16v5"/></g>, s),
  file: (s = 16) => wrap(<g><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v6h5"/></g>, s),
  chat: (s = 16) => wrap(<g><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></g>, s),
}
