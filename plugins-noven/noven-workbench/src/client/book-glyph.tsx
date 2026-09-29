/**
 * The open-book glyph the legacy launcher rows used (lucide BookOpenText),
 * stroked inline so the plugin carries no icon dependency.
 * @module noven-workbench/client/book-glyph
 */
import type { ReactNode } from 'react'

/**
 * Render the book glyph at the size the sidebar asks for.
 * @param size - requested square edge in pixels.
 * @param strokeWidth - stroke weight; heavier while active.
 * @returns the glyph element.
 */
export function bookGlyph(size: number, strokeWidth = 1.7): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.5C10.4 4.9 8.2 4.2 5 4.2c-.6 0-1 .4-1 1v11.3c0 .6.4 1 1 1 3.2 0 5.4.7 7 2.3 1.6-1.6 3.8-2.3 7-2.3.6 0 1-.4 1-1V5.2c0-.6-.4-1-1-1-3.2 0-5.4.7-7 2.3Z" />
      <path d="M12 6.5v13.3" />
    </svg>
  )
}
