/** Scoped light, dark, and exact-RGB-inverted text colors for conversation and canvas leaves. */
import { useEffect, type RefObject } from 'react'
import type { AppearanceForeground } from '../appearance/model.ts'

/** Independent foreground choice; system inherits the workspace visual state. */
export type ScopedForeground = AppearanceForeground | 'invert'

const TEXT_VARIABLES = [
  '--nv-primary-text', '--nv-secondary-text', '--dsw-alias-label-primary', '--dsw-alias-label-secondary',
  '--dsw-alias-label-caption', '--dsw-alias-label-tertiary', '--dsw-alias-menu-icon',
] as const
const generations = new WeakMap<HTMLElement, number>()

interface Rgb { readonly red: number; readonly green: number; readonly blue: number }

function parseRgb(value: string): Rgb | undefined {
  const match = /^rgba?\(\s*(\d+)(?:\s*[\s,]\s*(\d+))?(?:\s*[\s,]\s*(\d+))?(?:\s*[/,]\s*[\d.]+%?)?\s*\)$/u.exec(value)
  if (match === null) return undefined
  return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]) }
}

function hex({ red, green, blue }: Rgb): string {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

function invert(color: Rgb): Rgb {
  return { red: 255 - color.red, green: 255 - color.green, blue: 255 - color.blue }
}

function alpha(color: Rgb, opacity: number): string {
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${opacity})`
}

function solidBackground(element: HTMLElement): Rgb {
  let current: HTMLElement | null = element
  while (current !== null) {
    const raw = getComputedStyle(current).backgroundColor
    const parsed = parseRgb(raw)
    if (parsed !== undefined && raw !== 'rgba(0, 0, 0, 0)' && raw !== 'transparent') return parsed
    current = current.parentElement
  }
  return { red: 255, green: 255, blue: 255 }
}

function firstImageUrl(element: HTMLElement): string | undefined {
  const background = getComputedStyle(element).backgroundImage
  const match = /url\(["']?([^"')]+)["']?\)/u.exec(background)
  return match?.[1]
}

async function imageColor(url: string): Promise<Rgb | undefined> {
  const image = new Image()
  image.src = url
  await new Promise<void>((resolve, reject) => {
    image.onload = () => { resolve() }
    image.onerror = () => { reject(new Error('background image could not be read')) }
  })
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) return undefined
  context.drawImage(image, 0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return { red, green, blue }
}

/** Remove every scoped foreground override from one content element. */
export function clearScopedForeground(element: HTMLElement): void {
  generations.set(element, (generations.get(element) ?? 0) + 1)
  for (const name of TEXT_VARIABLES) element.style.removeProperty(name)
}

/**
 * Apply one scope's foreground, optionally inverting the effective background RGB.
 * @param element - Conversation root or canvas leaf receiving the overrides.
 * @param foreground - Fixed light/dark choice, invert, or inherited system choice.
 */
export async function applyScopedForeground(element: HTMLElement, foreground: ScopedForeground): Promise<void> {
  if (foreground === 'system') {
    clearScopedForeground(element)
    return
  }
  const generation = (generations.get(element) ?? 0) + 1
  generations.set(element, generation)
  let color: Rgb
  if (foreground === 'invert') {
    const url = firstImageUrl(element)
    color = url === undefined ? solidBackground(element) : await imageColor(url) ?? solidBackground(element)
    color = invert(color)
  } else {
    color = foreground === 'light'
      ? { red: 244, green: 247, blue: 245 }
      : { red: 22, green: 24, blue: 26 }
  }
  if (generations.get(element) !== generation) return
  element.style.setProperty('--nv-primary-text', hex(color))
  element.style.setProperty('--dsw-alias-label-primary', hex(color))
  element.style.setProperty('--dsw-alias-menu-icon', hex(color))
  element.style.setProperty('--nv-secondary-text', alpha(color, 0.72))
  element.style.setProperty('--dsw-alias-label-secondary', alpha(color, 0.72))
  element.style.setProperty('--dsw-alias-label-caption', alpha(color, 0.56))
  element.style.setProperty('--dsw-alias-label-tertiary', alpha(color, 0.68))
}

/**
 * Keep one leaf's foreground in sync with its resolved background and scope.
 * @param ref - Mounted conversation or canvas element.
 * @param foreground - Resolved scoped foreground choice.
 * @param backgroundKey - Background identity that should trigger recomputation.
 */
export function useScopedForeground(ref: RefObject<HTMLElement | null>, foreground: ScopedForeground, backgroundKey: string): void {
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    void applyScopedForeground(element, foreground)
    return () => { clearScopedForeground(element) }
  }, [ref, foreground, backgroundKey])
}
