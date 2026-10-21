/**
 * Single-module presets: the module library's tiles create configured modules
 * (fields, view, seed shape) rather than empty widget shells.
 * @module noven-cards/module-presets
 */
import { mintId } from './model.ts'
import { COLLECTION_CONTRACTS } from './collection-contracts.ts'
import {
  encodeCollection, encodeMap, encodeScene, encodeSurface, encodeTimeline,
  type CollectionData, type CollectionFieldType, type CollectionPresentation, type CollectionView, type SceneData, type TimelineCalendar, type TimelineData,
} from './formats.ts'

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
      manifest: { name: '自由 3D', description: 'three.js 驱动的 3D 场景：相机、灯光、材质、动画与交互。', cover: FREE3D_COVER, fullscreen: true },
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

/**
 * Encode an empty editable map preset.
 * @returns encoded map payload.
 */
export function mapPreset(): string {
  return encodeMap({ version: 1, description: '', markers: [], objects: [], draft: [], palette: [] })
}
