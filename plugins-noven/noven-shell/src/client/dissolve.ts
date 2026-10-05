/**
 * dissolve — erases an element by sweeping a jagged erosion edge across it
 * (a per-frame clip-path on the element itself) while particles spawn exactly
 * where the edge passes, so the card visibly turns into drifting sparks
 * instead of swapping for a particle overlay. Cover art breaks into its own
 * palette; text tiles fall back to paper flecks plus accent sparks.
 * @module noven-shell/client/dissolve
 */

/** Per-particle flight state for one dissolve burst. */
interface Particle {
  readonly x: number
  readonly y: number
  readonly size: number
  readonly color: string
  /** Milliseconds after the sweep starts — equals the edge's arrival time. */
  readonly delay: number
  readonly vx: number
  readonly vy: number
  readonly wobble: number
  readonly life: number
}

/** Milliseconds of the pre-dissolve charge beat — a slight pull-in + brighten. */
const CHARGE_MS = 110
/** Milliseconds the erosion edge takes to cross the whole element. */
const SWEEP_MS = 560
/** Erosion front slope: how much earlier lower rows erode (diagonal sweep). */
const SLOPE = 0.45

/** Scatter `el` into particles behind a sweeping erosion edge, then hide it. */
export function dissolveElement(el: HTMLElement, name: string, onDone?: () => void): void {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) { onDone?.(); return }

  const pad = 72
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = (rect.width + pad * 2) * dpr
  canvas.height = (rect.height + pad * 2) * dpr
  canvas.style.cssText = `position:fixed;left:${rect.left - pad}px;top:${rect.top - pad}px;` +
    `width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;` +
    `pointer-events:none;z-index:2000`
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (ctx === null) { canvas.remove(); onDone?.(); return }
  ctx.scale(dpr, dpr)

  // Downscaled color source of the slot's face (tile + caption row).
  const sw = Math.max(2, Math.round(rect.width / 4))
  const sh = Math.max(2, Math.round(rect.height / 4))
  const src = document.createElement('canvas')
  src.width = sw
  src.height = sh
  const sctx = src.getContext('2d')
  if (sctx !== null) {
    // Paper base over the whole slot, then cover art where the image sits,
    // then text-like flecks + the card name for the caption zone.
    sctx.fillStyle = getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)'
      ? '#f4faf6'
      : getComputedStyle(el).backgroundColor
    sctx.fillRect(0, 0, sw, sh)
    sctx.fillStyle = 'rgba(90, 120, 105, 0.35)'
    for (let y = 2; y < sh - 2; y += 4) {
      sctx.fillRect(sw * 0.12, y, sw * (0.55 + Math.random() * 0.35), 1.4)
    }
    sctx.fillStyle = 'rgba(60, 80, 70, 0.6)'
    sctx.font = `600 ${Math.max(9, sw * 0.11)}px sans-serif`
    sctx.textAlign = 'center'
    sctx.fillText(name.slice(0, 8), sw / 2, sh * 0.9)
    const img = el.querySelector('img')
    if (img !== null && img.complete && img.naturalWidth > 0) {
      const ir = img.getBoundingClientRect()
      try {
        sctx.drawImage(img,
          ((ir.left - rect.left) / rect.width) * sw, ((ir.top - rect.top) / rect.height) * sh,
          (ir.width / rect.width) * sw, (ir.height / rect.height) * sh)
        sctx.getImageData(0, 0, 1, 1)
      } catch { /* tainted or unloaded image — paper flecks already painted */ }
    }
  }
  const data = sctx !== null ? sctx.getImageData(0, 0, sw, sh).data : null

  const accent = 'rgba(52, 211, 153, 0.9)'
  const W = rect.width * 1.35
  const particles: Particle[] = []
  for (let sy = 0; sy < sh; sy += 1) {
    for (let sx = 0; sx < sw; sx += 1) {
      if (Math.random() < 0.28) continue
      const i = (sy * sw + sx) * 4
      const r = data !== null ? data[i] : 230
      const g = data !== null ? data[i + 1] : 245
      const b = data !== null ? data[i + 2] : 235
      const a = data !== null ? data[i + 3] / 255 : 1
      if (a < 0.05) continue
      // Edge arrival: boundary x = (1-f)·W − SLOPE·y — a particle releases when
      // the front crosses its x, i.e. at f = (W − SLOPE·y·W/w − x)/W.
      const px = (sx / sw) * rect.width
      const py = (sy / sh) * rect.height
      const f = (W - SLOPE * (py / rect.height) * rect.width - px) / W
      particles.push({
        x: pad + px + (Math.random() - 0.5) * 3,
        y: pad + py + (Math.random() - 0.5) * 3,
        size: 1.2 + Math.random() * 2.2,
        color: Math.random() < 0.12 ? accent : `rgba(${r},${g},${b},${a})`,
        delay: Math.max(0, f) * SWEEP_MS + Math.random() * 60,
        vx: (Math.random() - 0.35) * 0.09,
        vy: -(0.04 + Math.random() * 0.1),
        wobble: Math.random() * Math.PI * 2,
        life: 460 + Math.random() * 420,
      })
    }
  }

  // Jagged edge profile — fixed per dissolve so the front is coherent.
  const SEG = 18
  const jag = Array.from({ length: SEG + 1 }, () => Math.random() * 12)

  // Charge beat: the card dips and brightens for ~100ms before it breaks.
  // The inline transition also carries the column-collapse properties so the
  // data-collapse width change still animates after the charge lands.
  el.style.transition = 'transform 100ms ease, filter 100ms ease, ' +
    'width 300ms cubic-bezier(0.4, 0, 0.2, 1), margin-right 300ms cubic-bezier(0.4, 0, 0.2, 1)'
  el.style.transform = 'scale(0.97)'
  el.style.filter = 'brightness(1.1)'

  const t0 = performance.now() + CHARGE_MS
  let swept = false
  const frame = (now: number): void => {
    const t = now - t0
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    let alive = 0

    if (t >= 0 && t < SWEEP_MS) {
      const f = t / SWEEP_MS
      const pts: string[] = ['0px 0px']
      for (let k = 0; k <= SEG; k++) {
        const y = (k / SEG) * rect.height
        const x = Math.min(rect.width + 24,
          Math.max(-24, (1 - f) * W - SLOPE * (k / SEG) * rect.width - jag[k]))
        pts.push(`${x.toFixed(1)}px ${y.toFixed(1)}px`)
      }
      pts.push(`0px ${rect.height.toFixed(1)}px`)
      el.style.clipPath = `polygon(${pts.join(',')})`
    } else if (t >= SWEEP_MS && !swept) {
      swept = true
      el.style.visibility = 'hidden'
      el.style.clipPath = 'none'
    }

    for (const p of particles) {
      const age = t - p.delay
      if (age < 0 || age > p.life) continue
      alive++
      const k = age / p.life
      const x = p.x + p.vx * age + Math.sin(p.wobble + age * 0.012) * 6 * k
      const y = p.y + p.vy * age - k * k * 16
      ctx.globalAlpha = 1 - k * k
      ctx.fillStyle = p.color
      const s = p.size * (1 - k * 0.5)
      ctx.fillRect(x, y, s, s)
    }
    if (alive > 0 || t < SWEEP_MS) requestAnimationFrame(frame)
    else { canvas.remove(); onDone?.() }
  }
  requestAnimationFrame(frame)
}
