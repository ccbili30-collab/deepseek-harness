/**
 * Cover-derived page palette. A card page borrows two colors from its own
 * cover — the light that carries the page field and the chroma that marks the
 * active tab — so the page reads as the same world instead of a neutral
 * dashboard. Sampling is cached per cover URL; every failure path falls back to
 * the theme accent so a missing or unreadable cover never blocks the page.
 * @module noven-shell/client/cover-palette
 */

/** The two colors a card page reads out of its cover. */
export interface CoverPalette {
  /** The cover's light: a pale, low-chroma field color for the page wash. */
  readonly field: string
  /** The cover's chroma: the emphasis color for the active tab and links. */
  readonly accent: string
}

const GRID = 32
const cache = new Map<string, Promise<CoverPalette | undefined>>()

interface Sample {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly light: number
  readonly chroma: number
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

function channel(value: number): number {
  return Math.round(clamp(value, 0, 255))
}

function css(r: number, g: number, b: number): string {
  return `rgb(${String(channel(r))} ${String(channel(g))} ${String(channel(b))})`
}

/** Perceptual lightness, 0–255. */
function lightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Chroma as a share of the brightest channel, 0–1. */
function chroma(r: number, g: number, b: number): number {
  const high = Math.max(r, g, b)
  return high === 0 ? 0 : (high - Math.min(r, g, b)) / high
}

/** Scale a sampled color to a target lightness without losing its hue. */
function toLightness(color: { readonly r: number, readonly g: number, readonly b: number }, target: number): string {
  const current = lightness(color.r, color.g, color.b)
  if (current === 0) return css(color.r, color.g, color.b)
  const factor = clamp(target / current, 0.25, 2.6)
  return css(color.r * factor, color.g * factor, color.b * factor)
}

/**
 * Reduce a cover to the field light and the emphasis chroma.
 * @param pixels - RGBA bytes of the downsampled cover.
 * @returns Two CSS colors, or undefined when the cover carries no usable color.
 */
function sample(pixels: Uint8ClampedArray): CoverPalette | undefined {
  const samples: Sample[] = []
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue
    const r = pixels[index] ?? 0
    const g = pixels[index + 1] ?? 0
    const b = pixels[index + 2] ?? 0
    const light = lightness(r, g, b)
    samples.push({ r, g, b, light, chroma: chroma(r, g, b) })
  }
  if (samples.length === 0) return undefined

  // The field light is the bright, colored air above the subject; plain white
  // highlights are only the fallback, so a grey page means a grey cover.
  const bright = samples.filter(item => item.light >= 150)
  const tinted = bright.filter(item => item.chroma >= 0.08)
  const pool = tinted.length >= 16 ? tinted : bright.length >= 24 ? bright : samples
  let r = 0
  let g = 0
  let b = 0
  for (const item of pool) {
    r += item.r
    g += item.g
    b += item.b
  }
  const fieldColor = { r: r / pool.length, g: g / pool.length, b: b / pool.length }
  // Keep most of the hue and only lift the value, so the wash reads as light
  // from this cover rather than as grey haze.
  const fieldLight = lightness(fieldColor.r, fieldColor.g, fieldColor.b)
  const field = css(
    fieldColor.r * 0.72 + fieldLight * 0.28,
    fieldColor.g * 0.72 + fieldLight * 0.28,
    fieldColor.b * 0.72 + fieldLight * 0.28,
  )

  // The emphasis color is the most chromatic cluster that still reads as ink on
  // paper: prefer mid-tone color over both shadow and highlight.
  let best = samples[0] as Sample
  let bestScore = -1
  for (const item of samples) {
    if (item.light < 40 || item.light > 225) continue
    const score = item.chroma * (1 - Math.abs(item.light - 128) / 128)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  const accent = bestScore <= 0.04
    ? toLightness(fieldColor, 120)
    : toLightness(best, 118)
  return { field, accent }
}

/** Decode one cover and reduce it to two colors; every failure is a cached miss. */
async function read(url: string): Promise<CoverPalette | undefined> {
  const canvas = document.createElement('canvas')
  canvas.width = GRID
  canvas.height = GRID
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return undefined

  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
    context.drawImage(image, 0, 0, GRID, GRID)
    return sample(context.getImageData(0, 0, GRID, GRID).data)
  } catch (_error) {
    // A tainted or broken cover keeps the cached miss and the theme accent.
    return undefined
  }
}

/**
 * Sample a cover once and reuse the result for every page showing it.
 * @param url - Same-origin cover URL; empty disables sampling.
 * @returns The palette, or undefined when the cover cannot be read (callers
 * keep the theme accent).
 */
export function coverPalette(url: string): Promise<CoverPalette | undefined> {
  if (url === '' || typeof document === 'undefined') return Promise.resolve(undefined)
  const cached = cache.get(url)
  if (cached !== undefined) return cached
  const pending = read(url)
  cache.set(url, pending)
  return pending
}
