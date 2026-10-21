/**
 * Free surfaces are entry/files/manifest projects; the sandbox gets one
 * assembled HTML document with linked CSS/JS inlined.
 * Run: node tests/surface.mjs
 * @module noven-shell/tests/surface
 */
import { assembleSurface, parseSurface, surfaceSource } from '../lib/client/surface.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const project = {
  version: 1,
  entry: 'index.html',
  files: {
    'index.html': '<link rel="stylesheet" href="./style.css"><h1>hi</h1><script type="module" src="./main.js"></script>',
    'style.css': 'h1{color:red}',
    'main.js': "import('NOVEN_THREE').then(() => {})",
  },
  manifest: { name: 'Demo', description: 'A surface', cover: 'res-1', fullscreen: true },
}
const raw = JSON.stringify({ version: 1, kind: 'surface', noven: project })
const parsed = parseSurface(raw)
check(parsed?.entry === 'index.html' && Object.keys(parsed.files).length === 3, '解析 entry + files')
check(parsed?.manifest.name === 'Demo' && parsed.manifest.fullscreen === true, '解析 manifest')
check(parsed?.manifest.cover === 'res-1', '保留封面资源引用')
check(surfaceSource(parsed).includes('NOVEN_THREE'), '工程源码可检测 three 运行时')
const html = assembleSurface(parsed)
check(html.includes('<style>h1{color:red}</style>'), '内联 CSS 文件')
check(html.includes("import('NOVEN_THREE')") && !html.includes('src="./main.js"'), '内联 JS 文件')
const multi = parseSurface(JSON.stringify({ version: 1, kind: 'surface', noven: {
  entry: 'index.html',
  files: { 'index.html': '<script type="module" src="./main.js"></script>', 'main.js': "import { n } from './util.js'; console.log(n)", 'util.js': "export const n = 2" },
  manifest: { name: 'Multi', description: '' },
} }))
const multiHtml = assembleSurface(multi)
check(!multiHtml.includes("from './util.js'"), '相对 ESM import 被内联')
check((multiHtml.match(/data:text\/javascript/g) ?? []).length >= 1, '内联模块使用 data URL')
check(multiHtml.includes(encodeURIComponent('export const n = 2')), '嵌套模块内容进入 data URL')
check(parseSurface('<p>legacy html</p>') === undefined, '旧 HTML 不被误判为工程')
check(parseSurface('{"broken":') === undefined, '损坏 JSON 回退旧 HTML')
check(parseSurface('{"version":1,"kind":"surface","noven":{"entry":"index.html","files":{},"manifest":{}}}') === undefined, '空 files 拒绝')
check(parsed?.manifest.description === 'A surface', '保留说明')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
