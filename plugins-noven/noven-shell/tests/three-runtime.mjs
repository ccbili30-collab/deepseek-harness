/**
 * The free-3D runtime is a local, single-file three.js bundle; no CDN or
 * relative `three.core.js` import is allowed.
 * Run: node tests/three-runtime.mjs
 * @module noven-shell/tests/three-runtime
 */
import { readFileSync, statSync } from 'node:fs'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const path = new URL('../assets/three-runtime.js', import.meta.url)
const source = readFileSync(path, 'utf8')
check(statSync(path).size > 500_000, `three runtime is bundled（${String(statSync(path).size)} bytes）`)
check(source.includes('WebGLRenderer'), 'three runtime exposes WebGLRenderer')
check(!source.includes("from './three.core.js'"), 'three runtime has no relative core import')
check(source.includes('REVISION'), 'three runtime carries its revision')
check(source.includes('GLTFLoader'), 'three runtime includes GLTFLoader')
check(source.includes('RGBELoader'), 'three runtime includes RGBELoader')
check(source.includes('OrbitControls'), 'three runtime includes OrbitControls')
check(source.includes('PointerLockControls'), 'three runtime includes PointerLockControls')
check(source.includes('TransformControls'), 'three runtime includes TransformControls')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
