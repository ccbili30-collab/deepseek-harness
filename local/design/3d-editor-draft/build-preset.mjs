/**
 * Generate the built-in editable-3D preset from this standalone draft.
 *
 * The editor keeps its working copy here; the product template is generated
 * so the two do not drift. The only source rewrite is replacing the bundled
 * three import with the shared NOVEN_THREE runtime. State loading and saving
 * already live in app.js and branch on NOVEN_FRAME.
 *
 * Run: node build-preset.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const src = new URL('./src/', import.meta.url)
const out = new URL('../../../plugins-noven/noven-cards/src/free3d-editor.ts', import.meta.url)

const app = readFileSync(new URL('app.js', src), 'utf8')
const marker = '/* A deliberately small 3D editor'
const at = app.indexOf(marker)
if (at < 0) throw new Error('app.js module header not found')
const body = app.slice(at)
if (body.includes("from './three-draft.js'")) throw new Error('app.js still has a bundled three import')
const main = `const THREE = await import('NOVEN_THREE')\nconst { OrbitControls, TransformControls, GLTFLoader } = THREE\n\n${body}`
if (main.includes('</script')) throw new Error('main.js contains a closing script tag; the surface inliner would break')

const css = readFileSync(new URL('style.css', src), 'utf8')

let html = readFileSync(new URL('index.template.html', src), 'utf8')
html = html
  .replace('<title>3D 编辑器 · 草稿</title>', '<title>可编辑 3D</title>')
  .replace('<small>草稿</small>', '<small>场景</small>')
  .replace('<style>/*__STYLE__*/</style>', '<link rel="stylesheet" href="./style.css">')
  .replace('<script>/*__SCRIPT__*/</script>', '<script type="module" src="./main.js"></script>')
if (html.includes('__STYLE__') || html.includes('__SCRIPT__')) throw new Error('template placeholders still present')

const file = `/**
 * Built-in editable-3D template.
 *
 * Generated from \`local/design/3d-editor-draft/src\` with
 * \`node build-preset.mjs\`; edit the draft, then regenerate. The module reads
 * its scene from NOVEN_FRAME.surfaceState and saves through
 * \`surface_set_state\`, so edits live in the card rather than localStorage.
 * @module noven-cards/free3d-editor
 */

/** Entry document for the editable-3D surface. */
export const FREE3D_EDITOR_HTML = ${JSON.stringify(html)}

/** Editor skin; product light theme with narrow-window drawers. */
export const FREE3D_EDITOR_CSS = ${JSON.stringify(css)}

/** Editor source with the shared NOVEN_THREE runtime bootstrap. */
export const FREE3D_EDITOR_JS = ${JSON.stringify(main)}
`
writeFileSync(out, file)
console.log(`wrote ${out.pathname} (${String(file.length)} bytes)`)
