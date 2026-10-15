/**
 * Thin line icons for the Noven nav rows and page furniture. Each icon is a
 * plain function component receiving the slot owner's geometry props
 * (`size`, `active`) — stroke follows currentColor except the mint accents.
 * @module noven-shell/client/icons
 */
import type { CSSProperties } from 'react'

interface IconProps { size: number; active: boolean }

const stroke = (active: boolean, accent = false): CSSProperties => ({
  color: accent || active ? 'var(--nv-accent-deep)' : 'var(--nv-secondary-text)',
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

/** 创作 — plain plus; the mint pill chrome comes from the sidebar row's CSS. */
export function CreateIcon(p: IconProps) {
  return base(p, <g stroke="currentColor" strokeWidth={2.2}><path d="M12 5v14M5 12h14"/></g>)
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
  users: (s = 16) => wrap(<g><circle cx="9" cy="8" r="3.4"/><path d="M2.5 19c1.2-3 3.8-4.5 6.5-4.5s5.3 1.5 6.5 4.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.8c2.8.2 5 1.7 6 4.2"/></g>, s),
  upload: (s = 16) => wrap(<g><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 20h16"/></g>, s),
  download: (s = 16) => wrap(<g><path d="M12 4v12m0 0 5-5m-5 5-5-5"/><path d="M4 20h16"/></g>, s),
  clock: (s = 16) => wrap(<g><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></g>, s),
  layers: (s = 16) => wrap(<g><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></g>, s),
  code: (s = 16) => wrap(<g><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></g>, s),
  bolt: (s = 16) => wrap(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>, s),
  sparkle: (s = 16) => wrap(<g><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z"/></g>, s),
  map: (s = 16) => wrap(<g><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></g>, s),
  book: (s = 16) => wrap(<g><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></g>, s),
  image: (s = 16) => wrap(<g><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 4 3-3 4 4"/></g>, s),
  send: (s = 16) => wrap(<g><path d="M21 3 10 14"/><path d="M21 3l-7 18-3-8-8-3z"/></g>, s),
  pin: (s = 16) => wrap(<g><path d="M9 4h6l1 7 3 3v2H5v-2l3-3z"/><path d="M12 16v5"/></g>, s),
  caret: (s = 16) => wrap(<path d="m8 5 7 7-7 7"/>, s),
  heart: (s = 16) => wrap(<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>, s),
  bookmark: (s = 16) => wrap(<path d="M6 3h12v18l-6-4-6 4z"/>, s),
  fork: (s = 16) => wrap(<g><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/></g>, s),
  file: (s = 16) => wrap(<g><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v6h5"/></g>, s),
  grid: (s = 16) => wrap(<g><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></g>, s),
  folder: (s = 16) => wrap(<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, s),
  chat: (s = 16) => wrap(<g><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/></g>, s),
  search: (s = 16) => wrap(<g><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></g>, s),
  plus: (s = 16) => wrap(<g><path d="M12 5v14M5 12h14"/></g>, s),
  gear: (s = 16) => wrap(<g><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></g>, s),
  check: (s = 16) => wrap(<path d="M4 12.5l5 5L20 6.5"/>, s),
  slash: (s = 16) => wrap(<g><path d="M14 4l-5 16"/><path d="M17 9l3 3-3 3"/></g>, s),
  more: (s = 16) => wrap(<g><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></g>, s),
  clip: (s = 16) => wrap(<path d="m20 11-8.5 8.5a4.95 4.95 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.4a1.65 1.65 0 0 1-2.35-2.33l7.8-7.8"/>, s),
  copy: (s = 16) => wrap(<g><rect x="9" y="9" width="11" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></g>, s),
  rewind: (s = 16) => wrap(<g><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></g>, s),
  edit: (s = 16) => wrap(<g><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></g>, s),
  retry: (s = 16) => wrap(<g><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></g>, s),
  wrench: (s = 16) => wrap(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>, s),
  phone: (s = 16) => wrap(<g><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></g>, s),
  eye: (s = 16) => wrap(<g><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></g>, s),
  floatWin: (s = 16) => wrap(<g><rect x="4" y="5" width="16" height="13" rx="2"/><path d="M4 9h16"/></g>, s),
  panelBottom: (s = 16) => wrap(<g><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/></g>, s),
  cursor: (s = 16) => wrap(<path d="M5 3l14 7.5-6.2 1.7L10 19z"/>, s),
  brush: (s = 16) => wrap(<g><path d="M19 3l2 2-8.5 8.5-2-2z"/><path d="M10.5 11.5c-2.5-.3-4.5 1.2-4.5 3.5 0 1.6-1 2.6-2.5 3 2.5 1.5 7 1 7.8-2.2.3-1.4-.1-2.7-.8-3.3"/></g>, s),
  castle: (s = 16) => wrap(<g><path d="M4 21V9h3V5h2.5v4h5V5H17v4h3v12z"/><path d="M10 21v-5h4v5"/></g>, s),
  route: (s = 16) => wrap(<g><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6.5a3 3 0 0 0 0-6h-3a3 3 0 0 1 0-6H17"/></g>, s),
  flag: (s = 16) => wrap(<g><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></g>, s),
  marquee: (s = 16) => wrap(<rect x="4" y="5" width="16" height="14" rx="1.5" strokeDasharray="3 2.6"/>, s),
  expand: (s = 16) => wrap(<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>, s),
  collapse: (s = 16) => wrap(<path d="M4 14h6v6M20 10h-6V4M10 14l-6 6M14 10l6-6"/>, s),
  close: (s = 16) => wrap(<path d="M6 6l12 12M18 6 6 18"/>, s),
  minus: (s = 16) => wrap(<path d="M5 12h14"/>, s),
}
