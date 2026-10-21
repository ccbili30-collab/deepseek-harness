/**
 * Module-library covers are one-per-tile: no two entries may share the same image.
 * Run after build: node tests/modlib-art.mjs
 * @module noven-shell/tests/modlib-art
 */
import { MODLIB_ART } from '../lib/client/modlib-art.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const keys = Object.keys(MODLIB_ART)
const values = Object.values(MODLIB_ART)
check(keys.length === 25, `25 module covers（${keys.length}）`)
check(Object.keys(MODLIB_ART).filter(key => ['doc','timeline','map','relation','gallery'].includes(key)).every(key => MODLIB_ART[key].startsWith('data:image/webp')), 'original five restore old illustrations; factions uses semantic art')
check(new Set(values).size === values.length, `covers unique（${new Set(values).size}/${values.length}）`)
check(values.every(value => value.startsWith('data:image/')), 'covers are local image data URIs')
for (const key of ['worldProfile', 'profile', 'surface', 'free3d', 'equipment', 'abilities', 'ai']) {
  check(typeof MODLIB_ART[key] === 'string' && MODLIB_ART[key].length > 100, `cover ${key} present`)
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
