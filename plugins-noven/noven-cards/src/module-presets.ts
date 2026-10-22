/**
 * Single-module presets: the module library's tiles create configured modules
 * (fields, view, seed shape) rather than empty widget shells.
 * @module noven-cards/module-presets
 */
import { mintId } from './model.ts'
import { COLLECTION_CONTRACTS } from './collection-contracts.ts'
import {
  encodeCollection, encodeScene, encodeSurface, encodeTimeline,
  type CollectionData, type CollectionFieldType, type CollectionPresentation, type CollectionView, type SceneData, type TimelineCalendar, type TimelineData,
} from './formats.ts'
import { FREE3D_EDITOR_CSS, FREE3D_EDITOR_HTML, FREE3D_EDITOR_JS } from './free3d-editor.ts'

const surfaceCover = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const SURFACE_COVER = surfaceCover(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dff4e8"/><stop offset="1" stop-color="#f7fbf8"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="140" y="78" width="360" height="210" rx="22" fill="#ffffff" stroke="#2f6e56" stroke-width="3"/><path d="M140 124h360" stroke="#2f6e56" stroke-width="3"/><circle cx="170" cy="102" r="6" fill="#34d399"/><circle cx="190" cy="102" r="6" fill="#60a5fa"/><path d="M200 180h180M200 210h240M200 240h140" stroke="#8fb9a8" stroke-width="11" stroke-linecap="round"/></svg>`)

const FREE3D_COVER = surfaceCover(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b1d18"/><stop offset="1" stop-color="#17352d"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><path d="M320 82l116 66v132l-116 66-116-66V148l116-66Z" fill="#34d399" fill-opacity=".35" stroke="#9cf5cf" stroke-width="3"/><path d="M204 148l116 66 116-66M320 214v132" stroke="#9cf5cf" stroke-width="3" fill="none"/><ellipse cx="320" cy="300" rx="178" ry="34" fill="none" stroke="#60a5fa" stroke-width="3" opacity=".7"/></svg>`)

const SURFACE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>自由界面</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="free">
    <small>自由界面</small>
    <h1 id="title">未命名界面</h1>
    <p>这个模块由 AI 编写。告诉 AI 你想让这里变成什么：图鉴、工具、表单、小游戏都可以。</p>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>`
const SURFACE_CSS = `html,body{height:100%;min-height:440px;margin:0}
body{display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,color-mix(in srgb,var(--nv-accent,#34D399) 12%,transparent),transparent 62%);color:var(--nv-text,#20241f);font-family:system-ui,-apple-system,"PingFang SC",sans-serif}
.free{width:min(520px,78vw);padding:28px;border:1px solid color-mix(in srgb,var(--nv-text) 14%,transparent);border-radius:20px;background:color-mix(in srgb,var(--nv-surface,#fff) 78%,transparent);backdrop-filter:blur(8px)}
.free small{font-size:11px;letter-spacing:.18em;color:var(--nv-accent,#34D399);text-transform:uppercase}
.free h1{margin:10px 0 8px;font-size:26px;line-height:1.2}
.free p{margin:0;font-size:13px;line-height:1.7;color:color-mix(in srgb,var(--nv-text) 58%,transparent)}`
const SURFACE_JS = `const title = document.getElementById('title')
try { const card = NOVEN_FRAME.cardState; if (card && card.name) title.textContent = card.name } catch (error) { console.warn(error) }
try { NOVEN_FRAME.ready() } catch (error) { console.error(error) }`

const FREE3D_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>自由 3D</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div id="stage"></div>
  <div class="hint">拖动旋转 · 滚轮缩放 · three.js</div>
  <script type="module" src="./main.js"></script>
</body>
</html>`
const FREE3D_CSS = `html,body{height:100%;min-height:480px;margin:0;overflow:hidden;background:radial-gradient(circle at 50% 40%,#17352d,#07100d 72%);font-family:system-ui,-apple-system,sans-serif}
#stage{position:absolute;inset:0}
#stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
.hint{position:fixed;left:18px;bottom:16px;color:rgba(232,246,238,.62);font-size:11px;letter-spacing:.08em;pointer-events:none}`
const FREE3D_JS = `import('NOVEN_THREE').then(function(THREE){
  try {
    var host = document.getElementById('stage')
    var renderer = new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)
    var scene = new THREE.Scene()
    var camera = new THREE.PerspectiveCamera(42, 1, .1, 100)
    var view = { rx: .2, ry: .7, distance: 5.2 }
    camera.position.set(3.4, 2.5, view.distance)
    camera.lookAt(0, 0, 0)
    var root = new THREE.Group(); scene.add(root)
    var geo = new THREE.IcosahedronGeometry(1.25, 1)
    var mat = new THREE.MeshStandardMaterial({color:0x37d99b,roughness:.28,metalness:.18,flatShading:true})
    var mesh = new THREE.Mesh(geo, mat); root.add(mesh)
    var wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({color:0xb9ffe0,transparent:true,opacity:.45})); root.add(wire)
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, .018, 8, 96), new THREE.MeshBasicMaterial({color:0x60a5fa,transparent:true,opacity:.55}))
    ring.rotation.x = Math.PI / 2; root.add(ring)
    var grid = new THREE.GridHelper(12, 24, 0x2f6e56, 0x173a2e); grid.position.y = -1.55; scene.add(grid)
    scene.add(new THREE.AmbientLight(0x9fe8c9, .75))
    var key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 6, 4); scene.add(key)
    var fill = new THREE.PointLight(0x60a5fa, 18, 12); fill.position.set(-4, -2, 3); scene.add(fill)
    var drag = false, lx = 0, ly = 0
    renderer.domElement.addEventListener('pointerdown', function(e){ drag = true; lx = e.clientX; ly = e.clientY; renderer.domElement.setPointerCapture(e.pointerId) })
    renderer.domElement.addEventListener('pointermove', function(e){ if(!drag) return; view.ry += (e.clientX - lx) * .008; view.rx = Math.max(-1.1, Math.min(1.1, view.rx + (e.clientY - ly) * .006)); lx = e.clientX; ly = e.clientY })
    renderer.domElement.addEventListener('pointerup', function(){ drag = false })
    renderer.domElement.addEventListener('wheel', function(e){ e.preventDefault(); view.distance = Math.max(3.1, Math.min(8.5, view.distance + e.deltaY * .002)); camera.position.set(3.4, 2.5, view.distance); camera.lookAt(0,0,0) }, {passive:false})
    function resize(){ var w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix() }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(host)
    window.addEventListener('resize', resize); resize()
    function frame(){ if(!drag && !NOVEN_FRAME.gamePaused) view.ry += .0035; root.rotation.y += (view.ry - root.rotation.y) * .12; root.rotation.x += (view.rx - root.rotation.x) * .12; ring.rotation.z += .004; renderer.render(scene, camera); requestAnimationFrame(frame) }
    function restore(state){ if (!state || typeof state !== 'object') return; if (typeof state.ry === 'number') view.ry = state.ry; if (typeof state.rx === 'number') view.rx = state.rx; if (typeof state.distance === 'number') { view.distance = state.distance; camera.position.set(3.4,2.5,view.distance); camera.lookAt(0,0,0) } }
    window.addEventListener('message', function(e){ if (e.data && e.data.noven === 'gameSaveRequest') { try { NOVEN_FRAME.gameSave({ry:view.ry,rx:view.rx,distance:view.distance}) } catch (error) { console.error(error) } } })
    window.addEventListener('noven:frame', function(){ restore(NOVEN_FRAME.gameState) })
    try { console.log('three.js runtime ready', THREE.REVISION, 'GLTFLoader', typeof THREE.GLTFLoader); NOVEN_FRAME.ready() } catch (error) { console.error(error) }
    frame()
  } catch (error) {
    console.error(error)
    document.body.innerHTML = '<pre style="color:#ffb4b4;padding:24px;white-space:pre-wrap">' + String(error && error.stack || error) + '</pre>'
  }
}).catch(function(error){
  console.error('three runtime failed', error && error.message || error)
  document.body.innerHTML = '<pre style="color:#ffb4b4;padding:24px;white-space:pre-wrap">three runtime failed: ' + String(error && error.message || error) + '</pre>'
})`

// ---------- 起始模板：在品牌内、打开即用的四个方向 ----------

const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>仪表盘</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="dash">
    <header>
      <div><small>仪表盘</small><h1 id="title">今天</h1></div>
      <time id="clock">--:--</time>
    </header>
    <section class="grid">
      <article><span>条目</span><b id="count">0</b><i></i></article>
      <article><span>进度</span><b id="progress">0%</b><i class="p"></i></article>
      <article><span>状态</span><b>在线</b><i class="s"></i></article>
    </section>
    <footer>
      <button id="tick" type="button">记一笔</button>
      <span id="note">点一下试试；状态会通过 NOVEN_FRAME 存档。</span>
    </footer>
  </main>
  <script type="module" src="./main.js"></script>
</body>
</html>`
const DASHBOARD_CSS = `:root{color-scheme:light dark}
html,body{height:100%;margin:0}
body{background:var(--nv-surface,#fff);color:var(--nv-primary-text,#16181a);font-family:system-ui,-apple-system,"PingFang SC",sans-serif}
.dash{box-sizing:border-box;height:100%;padding:clamp(24px,4vw,56px);display:flex;flex-direction:column;gap:22px}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;border-bottom:1px solid color-mix(in srgb,var(--nv-primary-text,#16181a) 12%,transparent);padding-bottom:18px}
small{font-size:11px;letter-spacing:.18em;color:var(--nv-accent-deep,#0e9f6e);text-transform:uppercase}
h1{margin:6px 0 0;font-size:clamp(28px,3.4vw,44px);letter-spacing:-.02em}
time{font-variant-numeric:tabular-nums;font-size:clamp(22px,2.6vw,34px);color:color-mix(in srgb,var(--nv-primary-text,#16181a) 55%,transparent)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;flex:1;min-height:0}
article{position:relative;display:flex;flex-direction:column;justify-content:space-between;padding:20px;border:1px solid color-mix(in srgb,var(--nv-primary-text,#16181a) 10%,transparent);border-radius:18px;overflow:hidden;background:color-mix(in srgb,var(--nv-accent,#34d399) 4%,var(--nv-surface,#fff))}
article span{font-size:12px;color:color-mix(in srgb,var(--nv-primary-text,#16181a) 55%,transparent)}
article b{font-size:clamp(30px,4vw,52px);font-variant-numeric:tabular-nums}
article i{display:block;height:6px;border-radius:999px;background:var(--nv-accent,#34d399);width:62%}
article i.p{width:38%;background:#60a5fa}
article i.s{width:84%;background:var(--nv-accent-deep,#0e9f6e)}
footer{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:13px;background:var(--nv-accent,#34d399);color:#fff;cursor:pointer}
button:hover{background:var(--nv-accent-deep,#0e9f6e)}
#note{font-size:12px;color:color-mix(in srgb,var(--nv-primary-text,#16181a) 50%,transparent)}
@media(max-width:720px){.grid{grid-template-columns:1fr}}`
const DASHBOARD_JS = `const clock = document.getElementById('clock')
const count = document.getElementById('count')
const progress = document.getElementById('progress')
const note = document.getElementById('note')
let state = { count: 0 }
function paint() {
  count.textContent = String(state.count)
  progress.textContent = String(Math.min(100, state.count * 7)) + '%'
  clock.textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  try { if (NOVEN_FRAME.cardState && NOVEN_FRAME.cardState.name) document.getElementById('title').textContent = NOVEN_FRAME.cardState.name } catch (error) {}
}
document.getElementById('tick').addEventListener('click', function () {
  state.count += 1
  paint()
  try { NOVEN_FRAME.gameSave(state); note.textContent = '已记下第 ' + state.count + ' 笔' } catch (error) {}
})
window.addEventListener('noven:frame', function () {
  if (NOVEN_FRAME.gameState && typeof NOVEN_FRAME.gameState.count === 'number') { state = NOVEN_FRAME.gameState; paint() }
})
setInterval(paint, 15000)
paint()
try { NOVEN_FRAME.gameLoad(); NOVEN_FRAME.ready() } catch (error) { console.error(error) }`

const GALLERY_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>图鉴</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main class="gal">
    <header><small>图鉴</small><h1>点开任意一格</h1></header>
    <div class="grid" id="grid"></div>
  </main>
  <div class="light" id="light" hidden>
    <button id="close" type="button" aria-label="关闭">×</button>
    <figure><div id="art"></div><figcaption id="cap"></figcaption></figure>
  </div>
  <script type="module" src="./main.js"></script>
</body>
</html>`
const GALLERY_CSS = `html,body{height:100%;margin:0}
body{background:var(--nv-surface,#fff);color:var(--nv-primary-text,#16181a);font-family:system-ui,-apple-system,"PingFang SC",sans-serif}
.gal{box-sizing:border-box;height:100%;padding:clamp(20px,3.4vw,44px);display:flex;flex-direction:column;gap:18px;overflow:auto}
header{border-bottom:1px solid color-mix(in srgb,var(--nv-primary-text,#16181a) 12%,transparent);padding-bottom:14px}
small{font-size:11px;letter-spacing:.18em;color:var(--nv-accent-deep,#0e9f6e);text-transform:uppercase}
h1{margin:6px 0 0;font-size:clamp(22px,2.6vw,34px);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.tile{position:relative;aspect-ratio:4/3;border:0;border-radius:16px;cursor:pointer;overflow:hidden;background:#eef3f0}
.tile span{position:absolute;left:12px;bottom:10px;font-size:12px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.35)}
.light{position:fixed;inset:0;z-index:9;display:grid;place-items:center;background:rgba(8,12,10,.72);backdrop-filter:blur(6px)}
.light[hidden]{display:none}
.light figure{margin:0;width:min(760px,86vw);display:flex;flex-direction:column;gap:12px}
.light #art{aspect-ratio:16/10;border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.35)}
.light figcaption{color:#eaf5ef;font-size:14px;text-align:center}
#close{position:absolute;top:18px;right:20px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:20px;cursor:pointer}`
const GALLERY_JS = `const grid = document.getElementById('grid')
const light = document.getElementById('light')
const art = document.getElementById('art')
const cap = document.getElementById('cap')
const items = ['雪原','旧港','盐湖','雨林','灯塔','地下城','月台','火山口','浮岛']
items.forEach(function (name, index) {
  const hue = (index * 37 + 142) % 360
  const tile = document.createElement('button')
  tile.type = 'button'
  tile.className = 'tile'
  tile.style.background = 'linear-gradient(135deg,hsl(' + hue + ' 46% 62%),hsl(' + ((hue + 42) % 360) + ' 38% 34%))'
  tile.innerHTML = '<span>' + name + '</span>'
  tile.addEventListener('click', function () {
    art.style.background = tile.style.background
    cap.textContent = name + ' · 第 ' + String(index + 1) + ' 幅'
    light.hidden = false
  })
  grid.appendChild(tile)
})
document.getElementById('close').addEventListener('click', function () { light.hidden = true })
light.addEventListener('click', function (event) { if (event.target === light) light.hidden = true })
window.addEventListener('keydown', function (event) { if (event.key === 'Escape') light.hidden = true })
try { NOVEN_FRAME.ready() } catch (error) { console.error(error) }`

const VIEWER_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>3D 查看器</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div id="stage"></div>
  <div class="hint">拖动旋转 · 滚轮缩放 · OrbitControls</div>
  <script type="module" src="./main.js"></script>
</body>
</html>`
const VIEWER_CSS = `html,body{height:100%;margin:0;overflow:hidden;background:radial-gradient(circle at 50% 38%,#1b3a32,#07100d 72%)}
#stage{position:absolute;inset:0}
#stage canvas{display:block;width:100%;height:100%;touch-action:none}
.hint{position:fixed;left:16px;bottom:14px;color:rgba(232,246,238,.62);font-size:11px;letter-spacing:.08em;pointer-events:none}`
const VIEWER_JS = `import('NOVEN_THREE').then(function (THREE) {
  const host = document.getElementById('stage')
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(3.6, 2.4, 5.4)
  const controls = new THREE.OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.2, 0)
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.05, 0.32, 220, 28),
    new THREE.MeshStandardMaterial({ color: 0x37d99b, roughness: 0.28, metalness: 0.24, flatShading: true }),
  )
  knot.position.y = 0.2
  scene.add(knot)
  const grid = new THREE.GridHelper(14, 28, 0x2f6e56, 0x173a2e)
  grid.position.y = -1.35
  scene.add(grid)
  scene.add(new THREE.AmbientLight(0x9fe8c9, 0.8))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(4, 6, 4)
  scene.add(key)
  const fill = new THREE.PointLight(0x60a5fa, 16, 14)
  fill.position.set(-4, -2, 3)
  scene.add(fill)
  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(host)
  window.addEventListener('resize', resize)
  resize()
  function frame() {
    if (!NOVEN_FRAME.gamePaused) { knot.rotation.y += 0.004; controls.update() }
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }
  try { console.log('three.js runtime ready', THREE.REVISION); NOVEN_FRAME.ready() } catch (error) { console.error(error) }
  frame()
}).catch(function (error) {
  console.error('three runtime failed', error && error.message || error)
  document.body.innerHTML = '<pre style="color:#ffb4b4;padding:24px;white-space:pre-wrap">three runtime failed: ' + String(error && error.message || error) + '</pre>'
})`

/** One module-library preset; `widget` is omitted for a plain document module. */
export interface ModulePresetSpec {
  readonly widget?: 'collection' | 'timeline' | 'map' | 'html' | 'scene'
  readonly sample?: string
  readonly scene?: SceneData
  readonly fields?: readonly { readonly name: string, readonly type: CollectionFieldType }[]
  readonly view?: CollectionView
  readonly cardAspect?: 'portrait' | 'landscape' | 'square'
  readonly form?: { readonly labels?: { readonly primary?: string, readonly add?: string, readonly empty?: string } }
  readonly presentation?: CollectionPresentation
  readonly emptyItem?: boolean
  /** Timeline calendar unit; diary presets use 岁, history presets use 年. */
  readonly unit?: string
  /** Timeline layout: horizontal (default) or the vertical diary. */
  readonly timelineView?: 'diary'
}

const defaultCalendar = (unit: string): TimelineCalendar => ({
  name: '', units: [{ name: unit, per: 1 }], cycles: [], epoch: 0, step: 1, format: '{n}', formatBefore: '前 {n}', unit,
})

/** Preset ids accepted from the module library. */
export const MODULE_PRESETS: Readonly<Record<string, ModulePresetSpec>> = {
  doc: {},
  profile: {
    widget: 'collection', view: 'profile', emptyItem: true, presentation: COLLECTION_CONTRACTS.profile,
    fields: [
      { name: '姓名', type: 'text' }, { name: '形象', type: 'image' }, { name: '身份', type: 'text' },
      { name: '年龄', type: 'number' }, { name: '阵营', type: 'text' }, { name: '出身', type: 'text' },
      { name: '一句话', type: 'text' }, { name: '性格关键词', type: 'chips' }, { name: '档案', type: 'longtext' },
    ],
  },
  worldProfile: {
    widget: 'collection', view: 'profile', emptyItem: true, presentation: COLLECTION_CONTRACTS.worldProfile,
    fields: [
      { name: '名称', type: 'text' }, { name: '封面', type: 'image' }, { name: '世界类型', type: 'text' },
      { name: '尺度', type: 'text' }, { name: '规则', type: 'text' }, { name: '历法', type: 'text' },
      { name: '关键词', type: 'chips' }, { name: '一句话', type: 'text' }, { name: '档案', type: 'longtext' },
    ],
  },
  graph: {
    widget: 'collection', view: 'graph', presentation: COLLECTION_CONTRACTS.relations,
    fields: [{ name: '从', type: 'text' }, { name: '到', type: 'text' }, { name: '关系', type: 'text' }, { name: '说明', type: 'longtext' }],
  },
  culture: {
    widget: 'collection', view: 'cards', cardAspect: 'landscape', presentation: COLLECTION_CONTRACTS.culture,
    fields: [{ name: '名称', type: 'text' }, { name: '场景', type: 'image' }, { name: '类别', type: 'text' }, { name: '场合', type: 'text' }, { name: '日历', type: 'date' }, { name: '说明', type: 'longtext' }],
  },
  rules: {
    sample: '## 规则\n\n### 第一条\n写一条这个世界不能破的规则。',
  },
  history: { widget: 'timeline', unit: '年' },
  abilities: {
    widget: 'collection', view: 'list', presentation: COLLECTION_CONTRACTS.abilities,
    fields: [{ name: '名称', type: 'text' }, { name: '类型', type: 'text' }, { name: '效果', type: 'longtext' },
      { name: '详细说明', type: 'longtext' }, { name: '代价', type: 'text' }],
  },
  equipment: {
    widget: 'collection', view: 'cards', cardAspect: 'square', presentation: COLLECTION_CONTRACTS.equipment,
    fields: [{ name: '名称', type: 'text' }, { name: '图片', type: 'image' }, { name: '类型', type: 'text' },
      { name: '效果', type: 'longtext' }, { name: '归属', type: 'text' }, { name: '详细说明', type: 'longtext' }],
  },
  surface: {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': SURFACE_HTML, 'style.css': SURFACE_CSS, 'main.js': SURFACE_JS },
      manifest: { name: '自由界面', description: 'AI 编写的互动界面：图鉴、工具、表单或小游戏。', cover: SURFACE_COVER, fullscreen: false },
    }),
  },
  free3d: {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': FREE3D_HTML, 'style.css': FREE3D_CSS, 'main.js': FREE3D_JS },
      manifest: { name: '自由 3D', description: 'three.js 驱动的 3D 场景：相机、灯光、材质、动画与交互。', cover: FREE3D_COVER, fullscreen: false, chrome: 'game' },
    }),
  },
  'surface.dashboard': {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': DASHBOARD_HTML, 'style.css': DASHBOARD_CSS, 'main.js': DASHBOARD_JS },
      manifest: { name: '仪表盘', description: '带实时时钟、计数与存档的看板；改数据与布局即可用。', cover: SURFACE_COVER, fullscreen: false, chrome: 'game' },
    }),
  },
  'surface.gallery': {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': GALLERY_HTML, 'style.css': GALLERY_CSS, 'main.js': GALLERY_JS },
      manifest: { name: '图鉴画廊', description: '自适应网格 + 灯箱；把条目换成卡内图片或项目资产。', cover: SURFACE_COVER, fullscreen: false, chrome: 'none' },
    }),
  },
  'free3d.viewer': {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': VIEWER_HTML, 'style.css': VIEWER_CSS, 'main.js': VIEWER_JS },
      manifest: { name: '3D 查看器', description: 'OrbitControls + 环绕结；换成 GLTFLoader 加载项目里的 glb 即可当模型查看器。', cover: FREE3D_COVER, fullscreen: false, chrome: 'game' },
    }),
  },
  'free3d.editor': {
    widget: 'html',
    sample: encodeSurface({
      version: 1, entry: 'index.html',
      files: { 'index.html': FREE3D_EDITOR_HTML, 'style.css': FREE3D_EDITOR_CSS, 'main.js': FREE3D_EDITOR_JS },
      manifest: {
        name: '可编辑 3D',
        description: '在卡里直接搭场景：基础几何、点/边/面编辑、挤出/内插/倒角/环切/桥接；场景随卡保存，AI 可读。',
        cover: FREE3D_COVER, fullscreen: true, chrome: 'none',
      },
    }),
  },
  html: {
    widget: 'html',
    sample: `<style>
      .nv-demo{--accent:var(--nv-accent,#34D399);--text:var(--nv-text,#20241f);--surface:var(--nv-surface,#fff);box-sizing:border-box;min-height:220px;padding:22px;border-radius:16px;background:linear-gradient(135deg,rgba(52,211,153,.16),rgba(96,165,250,.12));color:var(--text);font-family:system-ui,-apple-system,"PingFang SC",sans-serif;display:flex;flex-direction:column;gap:10px;justify-content:space-between}
      .nv-demo h2{margin:0;font-size:22px;letter-spacing:.03em}
      .nv-demo p{margin:0;color:color-mix(in srgb,var(--text) 62%,transparent);font-size:13px;line-height:1.6}
      .nv-demo button{align-self:flex-start;border:0;border-radius:999px;padding:8px 14px;background:var(--accent);color:#fff;font:inherit;font-size:13px;cursor:pointer}
      .nv-demo small{font-size:11px;color:color-mix(in srgb,var(--text) 50%,transparent)}
    </style>
    <div class="nv-demo">
      <div><h2>界面是可以被编出来的</h2><p>这是 HTML 沙箱里的运行时：主题、资源和卡数据都通过 NOVEN_FRAME 桥接。让 AI 改这段 HTML，就能长成你自己的界面。</p></div>
      <div style="display:flex;align-items:center;gap:12px"><button id="tap">点一下 +1</button><button id="save" style="background:transparent;color:var(--text);border:1px solid color-mix(in srgb,var(--text) 30%,transparent)">立即存档</button><small id="out">计数 0 · 未存档</small></div>
    </div>
    <script>
      (function(){
        var n=0; var saved=false; var out=document.getElementById('out'); var btn=document.getElementById('tap');
        function paint(){ out.textContent='计数 '+n+(saved?' · 已存档':' · 未存档') }
        btn.onclick=function(){ n++; saved=false; paint() };
        function save(){ try{ NOVEN_FRAME.gameSave({n:n}); saved=true; paint() }catch(e){} }
        document.getElementById('save').onclick=save;
        try{ NOVEN_FRAME.ready(); }catch(e){}
        window.addEventListener('noven:frame', function(){
          try{
            var st=NOVEN_FRAME.gameState;
            if(st&&typeof st.n==='number'){ n=st.n; saved=true; paint() }
            if(NOVEN_FRAME.cardState&&!st){ /* card data bridge stays available */ }
          }catch(e){}
        });
        window.addEventListener('message', function(e){ if(e.data&&e.data.noven==='gameSaveRequest') save() });
      })();
    </script>`,
  },
  scene: {
    widget: 'scene',
    scene: {
      version: 1,
      camera: { yaw: -18, pitch: 12, zoom: 1 },
      objects: [
        { id: 'scene-core', name: '中心', color: '#34D399', description: '场景中心。', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 },
        { id: 'scene-north', name: '区域一', color: '#60A5FA', description: '', x: -86, y: -76, z: 90, rx: 0, ry: 24, rz: 0, scale: .72 },
        { id: 'scene-east', name: '区域二', color: '#F59E0B', description: '', x: 92, y: -64, z: 70, rx: 0, ry: -28, rz: 0, scale: .68 },
        { id: 'scene-south', name: '区域三', color: '#F472B6', description: '', x: -82, y: 94, z: 140, rx: 0, ry: 16, rz: 0, scale: .62 },
      ],
    },
  },
  timeline: { widget: 'timeline', unit: '年' },
  map: { widget: 'map' },
  diary: { widget: 'timeline', unit: '岁', timelineView: 'diary' },
  gallery: {
    widget: 'collection', view: 'cards', cardAspect: 'portrait', presentation: COLLECTION_CONTRACTS.gallery,
    fields: [{ name: '名称', type: 'text' }, { name: '图片', type: 'image' }, { name: '说明', type: 'longtext' }],
  },
  forms: {
    widget: 'collection', view: 'cards', cardAspect: 'portrait', presentation: COLLECTION_CONTRACTS.multiForm,
    form: { labels: { primary: 'i18n:coll.primary', add: 'i18n:coll.gallery.add' } },
    fields: [
      { name: '名称', type: 'text' }, { name: '图片', type: 'image' }, { name: '说明', type: 'longtext' },
      { name: '身份', type: 'text' }, { name: '年龄', type: 'number' }, { name: '阵营', type: 'text' }, { name: '出身', type: 'text' },
    ],
  },
  quotes: {
    widget: 'collection', view: 'cards', presentation: COLLECTION_CONTRACTS.quotes,
    fields: [{ name: '语录', type: 'text' }, { name: '场景', type: 'text' }, { name: '情绪', type: 'text' }, { name: '对象', type: 'text' }],
  },
  factions: {
    widget: 'collection', view: 'cards', cardAspect: 'square', presentation: COLLECTION_CONTRACTS.factions,
    fields: [
      { name: '名称', type: 'text' }, { name: '徽记', type: 'image' }, { name: '立场', type: 'chips' },
      { name: '实力', type: 'number' }, { name: '驻地', type: 'place' }, { name: '首领', type: 'text' },
      { name: '说明', type: 'longtext' },
    ],
  },
  places: {
    widget: 'collection', view: 'cards', cardAspect: 'landscape', presentation: COLLECTION_CONTRACTS.geography,
    fields: [
      { name: '名称', type: 'text' }, { name: '场景', type: 'image' }, { name: '地貌', type: 'text' },
      { name: '气候', type: 'text' }, { name: '主要势力', type: 'place' }, { name: '地图标记', type: 'text' },
      { name: '说明', type: 'longtext' },
    ],
  },
  races: {
    widget: 'collection', view: 'cards', cardAspect: 'portrait', presentation: COLLECTION_CONTRACTS.races,
    fields: [{ name: '名称', type: 'text' }, { name: '形象', type: 'image' }, { name: '特征', type: 'longtext' },
      { name: '分布', type: 'place' }, { name: '寿命', type: 'text' }],
  },
  collection: {
    widget: 'collection', view: 'list', presentation: COLLECTION_CONTRACTS.collection,
    fields: [{ name: '名称', type: 'text' }, { name: '说明', type: 'longtext' }],
  },
}

/** Whether an id names a shipped module preset. */
export function isModulePreset(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MODULE_PRESETS, id)
}

/**
 * Encode a collection preset.
 * @param spec - preset definition.
 * @returns encoded collection payload.
 */
export function collectionPreset(spec: ModulePresetSpec): string {
  const fields = (spec.fields ?? []).map(field => ({ id: mintId(), name: field.name, type: field.type }))
  const items = spec.emptyItem === true
    ? [{ id: mintId(), name: '', summary: '', description: '', visualKey: null }]
    : []
  const data: CollectionData = {
    version: 2, fields, items, values: {}, view: spec.view ?? 'list', artStyle: '',
    ...(spec.cardAspect === undefined ? {} : { cardAspect: spec.cardAspect }),
    ...(spec.form === undefined ? {} : { form: spec.form }),
    ...(spec.presentation === undefined ? {} : { presentation: spec.presentation }),
  }
  return encodeCollection(data)
}

/**
 * Encode a timeline preset.
 * @param spec - preset definition.
 * @returns encoded timeline payload.
 */
export function timelinePreset(spec: ModulePresetSpec): string {
  const unit = spec.unit ?? '年'
  const data: TimelineData = {
    version: 2,
    ...(spec.timelineView === 'diary' ? { view: 'diary' as const } : {}),
    calendar: defaultCalendar(unit), views: [], eras: [], events: [], marks: [],
  }
  return encodeTimeline(data)
}
