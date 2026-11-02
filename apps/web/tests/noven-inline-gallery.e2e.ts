import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, type WebScaffold } from './scaffold.ts'
import { AQI, SCENE, sessionFixture } from './noven-inline-fixture.ts'
import { newEnglishPage } from './support.ts'

const root = await mkdtemp(join(tmpdir(), 'noven-inline-gallery-'))
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const PREVIEW_OVERLAY = fileURLToPath(new URL('./noven-preview.overlay.yml', import.meta.url))
const bundles = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
]
let scaffold: WebScaffold
let galleryCardId: string | undefined
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
let closing: Promise<void> | undefined
const onSignal = (): void => { void close().then(() => { process.exit(0) }) }
async function close(): Promise<void> {
  closing ??= (async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    const failures: unknown[] = []
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    for (const key of ISOLATED_ENV) {
      const previous = originalEnvironment[key]
      if (previous === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = previous
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'inline gallery cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

interface CardOpResult {
  readonly ok?: boolean
  readonly cardId?: string
  readonly createdModuleIds?: readonly string[]
}

interface ModuleSpec {
  readonly name: string
  readonly preset?: string
  readonly widget?: string
  readonly widgetKind?: 'collection' | 'timeline' | 'scene' | 'map'
  readonly markdown?: string
  readonly html?: string
  readonly surfaceHtml?: string
  readonly data?: unknown
  readonly compose?: Record<string, unknown>
  readonly generate?: Record<string, unknown>
}

/** Apply one card operation through the scaffold's authenticated Host channel. */
async function cardOp(scaffold: WebScaffold, op: Record<string, unknown>): Promise<CardOpResult> {
  const response = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  if (!response.ok) throw new Error(`gallery card op ${String(op.op)} failed: ${await response.text()}`)
  return await response.json() as CardOpResult
}

async function addModule(scaffold: WebScaffold, cardId: string, spec: ModuleSpec): Promise<string> {
  const created = await cardOp(scaffold, {
    op: 'apply', cardId,
    command: {
      kind: 'add_module', name: spec.name,
      ...(spec.preset === undefined ? {} : { preset: spec.preset }),
      ...(spec.widget === undefined ? {} : { widget: spec.widget }),
    },
  })
  let moduleId = created.createdModuleIds?.[0]
  if (moduleId === undefined) {
    const state = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}&card=${encodeURIComponent(cardId)}`)
    if (!state.ok) throw new Error(`gallery cannot reload ${spec.name}`)
    const card = await state.json() as { document: { modules: { id: string; name: string }[] } }
    moduleId = card.document.modules.find(module => module.name === spec.name)?.id
  }
  if (moduleId === undefined) throw new Error(`gallery module id missing: ${spec.name}`)
  if (spec.markdown !== undefined) {
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'write_markdown', moduleId, name: spec.name, text: spec.markdown } })
  }
  if (spec.html !== undefined) {
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'write_text', moduleId, moduleName: spec.name, text: spec.html } })
  }
  if (spec.surfaceHtml !== undefined) {
    const text = JSON.stringify({
      version: 1,
      kind: 'surface',
      noven: {
        version: 1,
        entry: 'index.html',
        files: { 'index.html': spec.surfaceHtml },
        manifest: { name: '钟楼共鸣盘', description: '角色、地点与时间共鸣的自由界面', fullscreen: false, chrome: 'none' },
      },
    })
    const state = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}&card=${encodeURIComponent(cardId)}`)
    if (!state.ok) throw new Error('gallery cannot read the surface text block')
    const card = await state.json() as { document: { modules: { id: string; name: string; blocks: { id: string; kind: string }[] }[] } }
    const blockId = card.document.modules.find(module => module.id === moduleId)?.blocks.find(block => block.kind === 'text')?.id
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'write_text', moduleId, moduleName: spec.name, text, ...(blockId === undefined ? {} : { blockId }) } })
  }
  if (spec.data !== undefined) {
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'set_widget_data', moduleId, widget: spec.widgetKind ?? 'collection', data: spec.data } })
  }
  if (spec.compose !== undefined) {
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'request_map_compose', moduleId, spec: spec.compose } })
  }
  if (spec.generate !== undefined) {
    await cardOp(scaffold, { op: 'apply', cardId, command: { kind: 'request_map_generation', moduleId, request: spec.generate } })
  }
  return `card:${cardId}/${moduleId}`
}

const collectionFields = [
  { id: 'name', name: '名称', type: 'text' },
  { id: 'role', name: '身份', type: 'text' },
]
const profileFields = [
  ...collectionFields,
  { id: 'worldType', name: '世界类型', type: 'text' },
  { id: 'scale', name: '尺度', type: 'text' },
]

interface GalleryMapModule {
  readonly id: string
  readonly name: string
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  readonly widget?: {
    readonly mapStage?: 'blank' | 'terrain' | 'world'
    readonly mapTerrainSummary?: { readonly landRatio?: number }
    readonly mapSummary?: { readonly counts?: { readonly burgs?: number } }
  }
}

async function readMapModule(scaffold: WebScaffold, cardId: string, name = '地图模块'): Promise<GalleryMapModule> {
  const response = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}&card=${encodeURIComponent(cardId)}`)
  if (!response.ok) throw new Error(`gallery cannot reload map: ${await response.text()}`)
  const card = await response.json() as { document: { modules: GalleryMapModule[] } }
  const module = card.document.modules.find(candidate => candidate.name === name)
  if (module === undefined) throw new Error(`gallery map module missing: ${name}`)
  return module
}

async function readMapRequest(scaffold: WebScaffold, cardId: string, name = '地图模块'): Promise<unknown> {
  const target = await readMapModule(scaffold, cardId, name)
  const response = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}&card=${encodeURIComponent(cardId)}&mapRequest=${encodeURIComponent(target.id)}`)
  if (!response.ok) throw new Error(`gallery cannot reload map request: ${await response.text()}`)
  return (await response.json() as { request?: unknown }).request
}

async function eventually<T>(read: () => Promise<T>, accepted: (value: T) => boolean, label: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout
  for (;;) {
    if (accepted(await read())) return
    if (Date.now() >= deadline) throw new Error(`gallery timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

/** Compose a real map in the iframe and verify that the inline product chain persists every stage. */
async function prepareMap(scaffold: WebScaffold, cardId: string, mapSource: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser, 900)
    page.on('pageerror', (error) => { console.error('NOVEN_GALLERY_PAGE_ERROR', error.message) })
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('NOVEN_GALLERY_CONSOLE_ERROR', message.location().url, message.text())
    })
    await page.addInitScript((id) => {
      if (window === window.top) localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
    }, 'noven-inline-gallery')
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const mapBlock = page.locator(`[data-block-src="${mapSource}"]`)
    await mapBlock.waitFor({ timeout: 60_000 })
    await mapBlock.locator('iframe').waitFor({ timeout: 60_000 })
    const frameElement = await mapBlock.locator('iframe').elementHandle()
    const hostFrame = await frameElement?.contentFrame()
    if (hostFrame === undefined || hostFrame === null) throw new Error('gallery map host frame missing')
    const post = async (type: string): Promise<void> => {
      await mapBlock.locator('iframe').evaluate((frame, messageType) => {
        if (!(frame instanceof HTMLIFrameElement)) throw new Error('gallery map frame missing')
        frame.contentWindow?.postMessage({ type: messageType }, '*')
      }, type)
    }
    try {
      await hostFrame.waitForFunction(() => document.getElementById('nv-status')?.textContent?.includes('AI 地形 · 陆地') === true, undefined, { timeout: 90_000 })
    } catch (error) {
      const diagnostics = await hostFrame.evaluate(() => ({
        status: document.getElementById('nv-status')?.textContent,
        stage: document.getElementById('nv-stage-name')?.textContent,
        bodyClass: document.body.className,
      }))
      const shot = join(tmpdir(), `noven-inline-gallery-map-${process.pid}.png`)
      await mapBlock.screenshot({ path: shot })
      console.error('NOVEN_GALLERY_MAP_FAILURE', hostFrame.url(), JSON.stringify(diagnostics), shot)
      throw error
    }
    await eventually(
      () => readMapModule(scaffold, cardId),
      current => (current.widget?.mapTerrainSummary?.landRatio ?? 0) > 0,
      'the terrain summary to persist',
    )
    await eventually(() => readMapRequest(scaffold, cardId), request => request === undefined || request === null, 'the compose request to clear')
    await post('noven-map-finalize')
    await hostFrame.waitForFunction(() => document.querySelector('[data-stage="terrain"]')?.classList.contains('active') === true, undefined, { timeout: 90_000 })
    await hostFrame.waitForFunction(() => document.getElementById('nv-status')?.textContent === '已保存到卡', undefined, { timeout: 60_000 })
    await eventually(
      () => readMapModule(scaffold, cardId),
      current => current.widget?.mapStage === 'terrain'
        && current.blocks.some(block => block.kind === 'text' && /^\d+\.\d+\.\d+\|/.test(block.text ?? '')),
      'the terrain document to persist',
    )
    await post('noven-map-human')
    await hostFrame.waitForFunction(() => document.querySelector('[data-stage="world"]')?.classList.contains('active') === true, undefined, { timeout: 90_000 })
    await eventually(
      () => readMapModule(scaffold, cardId),
      current => current.widget?.mapStage === 'world'
        && (current.widget.mapSummary?.counts?.burgs ?? 0) > 0
        && current.blocks.some(block => block.kind === 'text' && /^\d+\.\d+\.\d+\|/.test(block.text ?? '')),
      'the human world to persist',
    )
    await eventually(() => readMapRequest(scaffold, cardId), request => request === undefined || request === null, 'the map request to remain cleared')
    await page.reload({ waitUntil: 'load' })
    await mapBlock.waitFor({ timeout: 60_000 })
    await mapBlock.locator('iframe').waitFor({ timeout: 60_000 })
    const savedElement = await mapBlock.locator('iframe').elementHandle()
    const savedFrame = await savedElement?.contentFrame()
    if (savedFrame === undefined || savedFrame === null) throw new Error('saved gallery map host frame missing')
    await savedFrame.waitForFunction(() => document.getElementById('nv-status')?.textContent === '已载入', undefined, { timeout: 60_000 })
    const hostBox = await mapBlock.locator('.nv-fmg-host').boundingBox()
    const frameBox = await mapBlock.locator('iframe').boundingBox()
    const mapBox = await savedFrame.locator('#map').boundingBox()
    if (hostBox === null || frameBox === null || mapBox === null) throw new Error('saved gallery map geometry missing')
    expect(frameBox.height).toBeCloseTo(hostBox.height, 0)
    expect(mapBox.height).toBeCloseTo(frameBox.height, 0)
    for (const selector of ['#nv-topbar', '#nv-cmdbar', '#nv-stagebar']) {
      expect(await savedFrame.locator(selector).evaluate(element => getComputedStyle(element).display)).toBe('none')
    }
  } finally {
    await browser.close()
  }
}

/** Consume a queued generate_map request and verify the inline product chain saves the world. */
async function prepareDirectMap(scaffold: WebScaffold, cardId: string, mapSource: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser, 900)
    page.on('pageerror', (error) => { console.error('NOVEN_GALLERY_PAGE_ERROR', error.message) })
    await page.addInitScript((id) => {
      if (window === window.top) localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
    }, 'noven-inline-gallery')
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    const mapBlock = page.locator(`[data-block-src="${mapSource}"]`)
    await mapBlock.waitFor({ timeout: 60_000 })
    await mapBlock.locator('iframe').waitFor({ timeout: 60_000 })
    try {
      await eventually(
        () => readMapModule(scaffold, cardId, '直接生成地图'),
        current => current.widget?.mapStage === 'world'
          && (current.widget.mapSummary?.counts?.burgs ?? 0) > 0
          && current.blocks.some(block => block.kind === 'text' && /^\d+\.\d+\.\d+\|/.test(block.text ?? '')),
        'the directly generated world to persist',
        120_000,
      )
    } catch (error) {
      const shot = join(tmpdir(), `noven-inline-gallery-direct-map-${process.pid}.png`)
      await mapBlock.screenshot({ path: shot })
      console.error('NOVEN_GALLERY_DIRECT_MAP_FAILURE', shot)
      throw error
    }
    await eventually(
      () => readMapRequest(scaffold, cardId, '直接生成地图'),
      request => request === undefined || request === null,
      'the direct generation request to clear',
    )
  } finally {
    await browser.close()
  }
}

const moduleSpecs: readonly ModuleSpec[] = [
  { name: '文档模块', preset: 'doc', markdown: '# 钟楼初遇\n\n阿七与闻灯第一次共同检查倒转的指针。\n\n- 保留时间共鸣设定\n- 记录两人的第一次分歧' },
  {
    name: '档案模块', preset: 'profile', widgetKind: 'collection',
    data: { version: 2, kind: 'collection', items: [{ id: 'dengjin', name: '灯烬纪' }], noven: { fields: profileFields, values: { dengjin: { name: '灯烬纪', role: '原创世界', worldType: '架空世界', scale: '城邦与群岛' } }, view: 'profile', artStyle: '' } },
  },
  {
    name: '关系模块', preset: 'graph', widgetKind: 'collection',
    data: {
      version: 2,
      kind: 'collection',
      items: [{ id: 'meet', name: '钟楼初遇' }],
      noven: {
        fields: [{ id: 'from', name: '从', type: 'text' }, { id: 'to', name: '到', type: 'text' }, { id: 'relation', name: '关系', type: 'text' }],
        values: { meet: { from: '阿七', to: '闻灯', relation: '初次对峙' } },
        view: 'graph', artStyle: '',
      },
    },
  },
  {
    name: '集合模块', preset: 'collection', widgetKind: 'collection',
    data: { version: 2, kind: 'collection', items: [{ id: 'aqi', name: '阿七' }, { id: 'wendeng', name: '闻灯' }], noven: { fields: collectionFields, values: { aqi: { name: '阿七', role: '修钟匠' }, wendeng: { name: '闻灯', role: '守夜人' } }, view: 'list', artStyle: '' } },
  },
  {
    name: '时间线模块', preset: 'timeline', widgetKind: 'timeline',
    data: {
      version: 2,
      kind: 'timeline',
      nodes: [{ time: '', title: '钟楼初遇', description: '阿七与闻灯第一次共同检查指针。' }],
      noven: {
        calendar: { name: '', units: [{ name: '年', per: 1 }], cycles: [], epoch: 0, step: 1, format: '{n}', formatBefore: '前 {n}', unit: '年' },
        views: [], eras: [], marks: [],
        events: [{ id: 'meet', at: 0, until: null, title: '钟楼初遇', description: '阿七与闻灯第一次共同检查指针。', characters: ['阿七', '闻灯'] }],
      },
    },
  },
  {
    name: '地图模块', preset: 'map', widgetKind: 'map',
    compose: {
      seed: 'noven-inline-gallery',
      landmasses: [
        { shape: 'ellipse', center: [0.45, 0.52], radius: [0.28, 0.34], coast: 0.16, height: 70 },
        { shape: 'ellipse', center: [0.82, 0.28], radius: [0.08, 0.1], coast: 0.12, height: 45 },
      ],
      basins: [{ center: [0.52, 0.55], radius: [0.09, 0.13], depth: 35 }],
      ridges: [{ path: [[0.34, 0.34], [0.42, 0.48], [0.48, 0.7]], height: 28, width: 0.025 }],
    },
  },
  {
    name: '直接生成地图', preset: 'map', widgetKind: 'map',
    generate: { template: 'archipelago', seed: 'noven-inline-direct', width: 1280, height: 800, points: 10000 },
  },
  {
    name: '自由界面模块', preset: 'surface',
    surfaceHtml: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;padding:28px;background:#f5faf7;color:#28443a;font:14px/1.6 system-ui,sans-serif}
      main{max-width:620px;margin:auto}.hero{padding:24px;border:1px solid #d8e9df;border-radius:18px;background:#fff}
      small{color:#43836a}h1{margin:6px 0 8px;font-size:26px;font-weight:500}p{margin:0;color:#668074}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}.grid article{padding:16px;border-radius:14px;background:#e8f4ed}
      .grid span{display:block;color:#668074;font-size:12px}.grid strong{display:block;margin-top:5px;font-weight:500}.meter{height:6px;margin-top:18px;border-radius:9px;background:#e4eee8;overflow:hidden}.meter i{display:block;width:72%;height:100%;background:#34d399}
    </style></head><body><main><section class="hero"><small>钟楼共鸣盘</small><h1>时间共鸣已稳定</h1><p>阿七与闻灯确认了倒转指针的共同频率，下一次检查定在城市钟声的第十三响。</p><div class="meter"><i></i></div></section><section class="grid"><article><span>当前地点</span><strong>倒钟塔</strong></article><article><span>共鸣强度</span><strong>72%</strong></article><article><span>同行角色</span><strong>阿七 · 闻灯</strong></article></section></main></body></html>`,
  },
  { name: '自由 3D 模块', preset: 'free3d' },
  {
    name: '场景模块', widget: 'scene', widgetKind: 'scene',
    data: {
      version: 1,
      kind: 'scene',
      noven: {
        version: 1,
        objects: [
          { id: 'aqi', name: '阿七', color: '#789486', description: '修钟匠', x: -120, y: 0, z: 0, rx: 0, ry: 20, rz: 0, scale: 1 },
          { id: 'wendeng', name: '闻灯', color: '#6d4a50', description: '守夜人', x: 120, y: 0, z: 0, rx: 0, ry: -20, rz: 0, scale: 1 },
        ],
        camera: { yaw: 0, pitch: 12, zoom: 1 },
      },
    },
  },
  {
    name: 'HTML 模块', widget: 'html',
    html: '<section style="font:14px system-ui;padding:20px;border-radius:12px;background:#eef5f0;color:#355e49"><h2 style="margin:0 0 8px">钟楼初遇</h2><p style="margin:0">这是现有 HTML 卡片模块的内联只读投影。</p></section>',
  },
]

beforeAll(async () => {
  process.env.NOVEN_HOME = join(root, 'library')
  process.env.NOVEN_PROJECTS_ROOT = join(root, 'projects')
  process.env.NOVEN_CHANNEL = 'test'
  await mkdir(process.env.NOVEN_HOME, { recursive: true })
  await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
  scaffold = await launchWebScaffold({
    harnessHome: join(root, 'harness'),
    profile: { packages: bundles.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
    agentPresets: { default: 'create' },
    extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
    extraOverlayPath: [PRODUCT_OVERLAY, PREVIEW_OVERLAY],
  })
  await createScaffoldWorkspace(scaffold, '内联组件与模块验收台')
  await writeFile(join(scaffold.workspaceCwd, 'inline-aqi.svg'), AQI)
  await writeFile(join(scaffold.workspaceCwd, 'inline-scene.svg'), SCENE)
  const created = await cardOp(scaffold, { op: 'create', kind: 'WORLD', name: '全部模块验收卡', starter: 'blank' })
  if (created.cardId === undefined) throw new Error('gallery card id missing')
  galleryCardId = created.cardId
  const sources: string[] = []
  let mapSource = ''
  let directMapSource = ''
  for (const spec of moduleSpecs) {
    const source = await addModule(scaffold, created.cardId, spec)
    sources.push(source)
    if (spec.name === '地图模块') mapSource = source
    if (spec.name === '直接生成地图') directMapSource = source
  }
  await seedSession(scaffold, sessionFixture(sources), 'noven-inline-gallery', undefined, { createdAt: Date.UTC(2026, 0, 1) })
  await prepareMap(scaffold, created.cardId, mapSource)
  await prepareDirectMap(scaffold, created.cardId, directMapSource)
  console.log(`NOVEN_GALLERY_URL=${scaffold.authenticatedUrl}`)
  console.log(`NOVEN_GALLERY_ROOT=${root}`)
  console.log(`NOVEN_GALLERY_CARD=${created.cardId}`)
  console.log(`NOVEN_GALLERY_MODULES=${sources.join(',')}`)
}, 300_000)

afterAll(async () => { await close() })

describe('Noven inline component and module gallery', () => {
  it('persists a generated world through the inline product chain and exits after acceptance', async () => {
    if (galleryCardId === undefined) throw new Error('gallery card id was not retained')
    const world = await readMapModule(scaffold, galleryCardId)
    expect(world.widget?.mapStage).toBe('world')
    expect(world.widget?.mapSummary?.counts?.burgs ?? 0).toBeGreaterThan(0)
    const direct = await readMapModule(scaffold, galleryCardId, '直接生成地图')
    expect(direct.widget?.mapStage).toBe('world')
    expect(direct.widget?.mapSummary?.counts?.burgs ?? 0).toBeGreaterThan(0)
  })
})
