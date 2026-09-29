/**
 * Synthetic end-to-end self-test for the two deterministic scripts this skill
 * ships, run without any image API: a fixed-seed programmatic base map
 * (checkerboard luminance regions with domain-warped borders and medium-scale
 * texture — shaped against the script's own quality gates) plus a hand region
 * plan. derive-region-mask.mjs must produce an aligned same-size mask and
 * manifest; build-interactive-map.mjs must assemble the interactive map and
 * write the .noven-interactive-map-output marker.
 *
 * Run: node tests/synthetic-pipeline.mjs  (or pnpm test)
 * @module noven-draw-map/tests/synthetic-pipeline
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { NOVEN_SKILL_FILES } from '../lib/assets.js'

// ---------- tiny PNG encoder (RGBA, 8-bit, non-interlaced) ----------

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- synthetic base map ----------

const WIDTH = 1200
const HEIGHT = 900
const CELL = 150
const COLS = WIDTH / CELL
const ROWS = HEIGHT / CELL

/** Domain warp: wiggles region borders so boundary length is realistic. */
const warpX = (x, y) => 40 * Math.sin(y * 0.017 + 1.7 * Math.sin(x * 0.004))
const warpY = (x, y) => 40 * Math.sin(x * 0.019 + 1.3 * Math.sin(y * 0.005))

/** Soft medium-scale undulation: contributes a little gradient everywhere. */
const texture = (x, y) =>
  30 * Math.sin(x * 0.21 + 2.1 * Math.sin(y * 0.17))
  + 30 * Math.sin(y * 0.24 + 2.3 * Math.sin(x * 0.15))

/** Deterministic per-cell hash for the stroke field. */
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = (h * 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Open high-contrast strokes (terrain marks). Short unclosed segments keep the
 * watershed untrapped while pushing the gradient gates up; strokes never run
 * near a grid line so they cannot weaken a region border.
 */
function strokeField() {
  const marks = []
  for (let gy = 8; gy < HEIGHT - 8; gy += 8) {
    for (let gx = 8; gx < WIDTH - 8; gx += 8) {
      const h = hash(gx, gy)
      if (h % 5 >= 3) continue
      const length = 14 + (h >> 3) % 12
      const direction = (h >> 6) % 3
      const dx = direction === 0 ? 1 : direction === 1 ? 0 : 1
      const dy = direction === 0 ? 0 : direction === 1 ? 1 : 1
      const endX = gx + dx * length
      const endY = gy + dy * length
      // keep clear of every (unwarped) grid line with warp margin to spare
      if ([gx, endX].some(v => Math.abs(v - Math.round(v / CELL) * CELL) < 52)) continue
      if ([gy, endY].some(v => Math.abs(v - Math.round(v / CELL) * CELL) < 52)) continue
      marks.push({ gx, gy, dx, dy, length, sign: (h >> 9) % 2 === 0 ? 1 : -1 })
    }
  }
  return marks
}

/** One region id per warped grid cell; checkerboard keeps neighbours contrasted. */
function regionIndexAt(x, y) {
  const col = Math.floor((x + warpX(x, y)) / CELL)
  const row = Math.floor((y + warpY(x, y)) / CELL)
  return Math.min(ROWS - 1, Math.max(0, row)) * COLS + Math.min(COLS - 1, Math.max(0, col))
}

function baseLuminance(index) {
  const row = Math.floor(index / COLS)
  const col = index % COLS
  const variation = ((row * COLS + col) * 7) % 25
  return (row + col) % 2 === 0 ? 220 + variation : 10 + variation
}

function renderBase() {
  const strokes = strokeField()
  // stroke lookup: mark painted pixels with their luminance delta
  const painted = new Float64Array(WIDTH * HEIGHT)
  for (const stroke of strokes) {
    const base = baseLuminance(regionIndexAt(stroke.gx, stroke.gy))
    const delta = base < 128 ? 135 * stroke.sign : -135 * stroke.sign
    for (let step = 0; step <= stroke.length; step++) {
      for (let w = 0; w < 3; w++) {
        const x = stroke.gx + stroke.dx * step + (stroke.dy !== 0 ? w : 0)
        const y = stroke.gy + stroke.dy * step + (stroke.dx !== 0 ? w : 0)
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue
        painted[y * WIDTH + x] = delta
      }
    }
  }
  console.error(`[fixture] ${strokes.length} strokes; painting…`)
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const index = regionIndexAt(x, y)
      let luminance = baseLuminance(index) + texture(x, y) + painted[y * WIDTH + x]
      // never let a stroke drag a pixel across the checkerboard contrast
      const floor = (Math.floor(index / COLS) + index % COLS) % 2 === 0 ? 120 : 0
      const ceil = floor === 120 ? 255 : 110
      luminance = Math.min(ceil, Math.max(floor, luminance))
      const offset = (y * WIDTH + x) * 4
      rgba[offset] = Math.round(luminance)
      rgba[offset + 1] = Math.round(luminance * 0.96)
      rgba[offset + 2] = Math.round(luminance * 0.92)
      rgba[offset + 3] = 255
    }
  }
  return encodePng(WIDTH, HEIGHT, rgba)
}

/** Distinct mask colors: golden-angle hues, six hex digits, unique by construction. */
function maskColor(index) {
  const hue = (index * 137.508) % 360
  const [r, g, b] = hslToRgb(hue / 360, 0.68, 0.5)
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function hslToRgb(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/**
 * Seeds per region: the cell center, plus seeds ON the canvas ring for every
 * region that touches an edge. The outermost pixel ring has gradient 0 (the
 * map never computes it), so only a seed standing on the ring itself can
 * claim it at priority 0 — without those, an interior flood that ratchets
 * low claims the ring and conquers every edge cell from outside. Ring seeds
 * are placed every 50px along each edge and owned by whichever warped region
 * actually contains the point.
 */
function ringSeedsByRegion() {
  const byRegion = new Map()
  const claim = (x, y) => {
    const index = regionIndexAt(x, y)
    const list = byRegion.get(index) ?? []
    list.push([x, y])
    byRegion.set(index, list)
  }
  for (let y = 25; y < HEIGHT; y += 50) { claim(0, y); claim(WIDTH - 1, y) }
  for (let x = 25; x < WIDTH; x += 50) { claim(x, 0); claim(x, HEIGHT - 1) }
  return byRegion
}

function buildPlan() {
  const ringSeeds = ringSeedsByRegion()
  const regions = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col
      regions.push({
        id: `region-${String(index + 1).padStart(2, '0')}`,
        name: `区域${String(index + 1).padStart(2, '0')}`,
        kind: row === 0 ? 'water' : 'land',
        maskColor: maskColor(index),
        seeds: [[col * CELL + 75, row * CELL + 75], ...(ringSeeds.get(index) ?? [])],
      })
    }
  }
  return {
    schemaVersion: 1,
    title: '合成自测地图',
    base: 'base-map.png',
    mask: 'region-id-mask.png',
    manifest: 'map-manifest.json',
    review: 'alignment-review.png',
    regions,
  }
}

// ---------- drive the scripts ----------

const root = mkdtempSync(join(tmpdir(), 'noven-draw-map-selftest-'))
try {
  const skillDir = join(root, 'skill')
  const planDir = join(root, 'plan')
  const outputDir = join(root, '交互地图')
  mkdirSync(planDir, { recursive: true })

  for (const [rel, base64] of Object.entries(NOVEN_SKILL_FILES)) {
    const target = join(skillDir, rel)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, Buffer.from(base64, 'base64'))
  }

  writeFileSync(join(planDir, 'base-map.png'), renderBase())
  writeFileSync(join(planDir, 'region-plan.json'), `${JSON.stringify(buildPlan(), null, 2)}\n`)

  const derive = join(skillDir, 'scripts', 'derive-region-mask.mjs')
  const build = join(skillDir, 'scripts', 'build-interactive-map.mjs')

  const deriveOut = execFileSync('node', [derive, '--plan', join(planDir, 'region-plan.json')], { encoding: 'utf8' })
  const deriveReport = JSON.parse(deriveOut.slice(deriveOut.indexOf('{')))
  for (const artifact of ['region-id-mask.png', 'map-manifest.json', 'alignment-review.png']) {
    if (!existsSync(join(planDir, artifact))) throw new Error(`derive did not write ${artifact}`)
  }

  execFileSync('node', [build, '--manifest', join(planDir, 'map-manifest.json'), '--output', outputDir], { encoding: 'utf8' })
  for (const artifact of ['index.html', 'base-map.png', 'region-id-mask.png', 'map-manifest.json', '.noven-interactive-map-output']) {
    if (!existsSync(join(outputDir, artifact))) throw new Error(`build did not write ${artifact}`)
  }
  const manifest = JSON.parse(readFileSync(join(outputDir, 'map-manifest.json'), 'utf8'))
  if (manifest.canvas.width !== WIDTH || manifest.canvas.height !== HEIGHT) throw new Error('manifest dimensions mismatch')

  console.log(`PASS derive: ${deriveReport.regionCount} regions, alignment ratio ${deriveReport.boundaryAlignment.ratio}, smallest region ${deriveReport.smallestRegionPixels}px`)
  console.log(`PASS build: ${manifest.regions.length} regions assembled, viewer + marker in place`)
  console.log(`     fixture: ${WIDTH}x${HEIGHT} synthetic base, ${ROWS * COLS} planned regions`)
} catch (error) {
  console.error(`KEPT for inspection: ${root}`)
  throw error
} finally {
  if (!process.env.KEEP_FIXTURE) rmSync(root, { recursive: true, force: true })
}
