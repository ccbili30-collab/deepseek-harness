import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const root = await mkdtemp(join(tmpdir(), 'noven-card-images-'))
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const ASSETS = join(PLUGIN_ROOT, 'noven-shell/assets')
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const PREVIEW_OVERLAY = fileURLToPath(new URL('./noven-preview.overlay.yml', import.meta.url))
const SEED = fileURLToPath(new URL('../../../snapshots/web/navigation-panes/session.v3.jsonl', import.meta.url))
const SESSION_ID = 'noven-card-images'
const SHOT_DIR = join(tmpdir(), 'noven-card-images-shots')
const bundles = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
]
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
let scaffold: WebScaffold
let worldId = ''
let characterId = ''
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
    if (failures.length > 1) throw new AggregateError(failures, 'card image acceptance cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

interface CardOpResult {
  readonly cardId?: string
  readonly createdModuleIds?: readonly string[]
}

async function cardOp(op: Record<string, unknown>): Promise<CardOpResult> {
  const response = await scaffold.hostFetch(`/api/noven-cards?root=${encodeURIComponent(scaffold.workspaceCwd)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  })
  if (!response.ok) throw new Error(`card op ${String(op.op)} failed: ${await response.text()}`)
  return await response.json() as CardOpResult
}

async function setImage(cardId: string, purpose: 'cover' | 'avatar' | 'logo', asset: string): Promise<void> {
  const image = await readFile(join(ASSETS, asset))
  await cardOp({
    op: 'apply', cardId,
    command: { kind: 'set_card_image', purpose, imageBase64: image.toString('base64'), mediaType: 'image/webp' },
  })
}

async function createCard(kind: 'WORLD' | 'CHARACTER', name: string, cover: string, face: string, facePurpose: 'logo' | 'avatar', moduleName: string): Promise<string> {
  const created = await cardOp({ op: 'create', kind, name, starter: 'blank' })
  if (created.cardId === undefined) throw new Error(`missing card id for ${name}`)
  await setImage(created.cardId, 'cover', cover)
  await setImage(created.cardId, facePurpose, face)
  await cardOp({ op: 'apply', cardId: created.cardId, command: { kind: 'set_card_tags', tags: ['暗图验收', '图片职责'] } })
  await cardOp({ op: 'apply', cardId: created.cardId, command: { kind: 'add_module', name: moduleName } })
  return created.cardId
}

async function openSettingPage(browser: Browser, name: string, shot: string): Promise<Page> {
  const page = await newEnglishPage(browser, 1000)
  await page.addInitScript((id) => {
    if (window === window.top) localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
  }, SESSION_ID)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  const mine = page.locator('[data-sidebar-col] nav button[aria-label="我的"], [data-sidebar-col] nav button[aria-label="Me"]').first()
  await mine.waitFor({ timeout: 60_000 })
  await mine.click()
  const tile = page.locator('.nv-me-card-hit').filter({ hasText: name }).first()
  await tile.waitFor({ timeout: 60_000 })
  await tile.click()
  await page.locator('.nv-cardpreview').waitFor({ timeout: 60_000 })
  await page.locator('.nv-cardpreview-actions .nv-btn-primary').click()
  await page.waitForTimeout(500)
  const toHandcraft = page.getByRole('button', { name: /切换到手作|Switch to handcraft/i })
  if (await toHandcraft.count() > 0) await toHandcraft.first().click()
  await page.locator('.nv-setting').waitFor({ state: 'visible', timeout: 30_000 })
  await mkdir(SHOT_DIR, { recursive: true })
  await page.locator('.nv-setting').screenshot({ path: join(SHOT_DIR, shot) })
  return page
}

async function appearance(page: Page): Promise<{
  readonly heroTop: number
  readonly heroBottom: number
  readonly logoTop: number
  readonly logoBottom: number
  readonly logoHeight: number
  readonly copyTop: number
  readonly copyBottom: number
  readonly copyHeight: number
  readonly copyScroll: number
  readonly copyClient: number
  readonly kindTop: number
  readonly nameTop: number
  readonly metaTop: number
  readonly tagTop: number
  readonly tagBottom: number
  readonly cover: string
  readonly logo: string
  readonly background: string
}> {
  return await page.evaluate(() => {
    const rect = (selector: string): DOMRect => {
      const node = document.querySelector(selector)
      if (node === null) throw new Error(`missing ${selector}`)
      return node.getBoundingClientRect()
    }
    const cover = document.querySelector('.nv-set-cover')
    const logo = document.querySelector('.nv-set-logo img')
    const copy = document.querySelector('.nv-set-id')
    const tag = document.querySelector('.nv-set-tags .nv-set-tag')
    const background = document.querySelector('.nv-set-bg')
    if (!(cover instanceof HTMLImageElement) || !(logo instanceof HTMLImageElement)
      || copy === null || tag === null || background === null) {
      throw new Error('card image roles are incomplete')
    }
    const hero = rect('.nv-set-hero')
    const mark = rect('.nv-set-logo')
    const copyRect = copy.getBoundingClientRect()
    const tagRect = tag.getBoundingClientRect()
    return {
      heroTop: hero.top,
      heroBottom: hero.bottom,
      logoTop: mark.top,
      logoBottom: mark.bottom,
      logoHeight: mark.height,
      copyTop: copyRect.top,
      copyBottom: copyRect.bottom,
      copyHeight: copyRect.height,
      copyScroll: copy.scrollHeight,
      copyClient: copy.clientHeight,
      kindTop: rect('.nv-set-kind').top,
      nameTop: rect('.nv-set-name').top,
      metaTop: rect('.nv-set-meta').top,
      tagTop: tagRect.top,
      tagBottom: tagRect.bottom,
      cover: cover.currentSrc,
      logo: logo.currentSrc,
      background: getComputedStyle(background).backgroundImage,
    }
  })
}

/** The identity text block and the avatar share one height and one top/bottom edge. */
function expectIdentityInsideAvatar(view: Awaited<ReturnType<typeof appearance>>): void {
  expect(view.copyHeight).toBeCloseTo(view.logoHeight, 0)
  expect(view.copyTop).toBeGreaterThanOrEqual(view.logoTop - 1)
  expect(view.copyBottom).toBeLessThanOrEqual(view.logoBottom + 1)
  for (const top of [view.kindTop, view.nameTop, view.metaTop, view.tagTop]) {
    expect(top).toBeGreaterThanOrEqual(view.logoTop - 1)
    expect(top).toBeLessThanOrEqual(view.logoBottom + 1)
  }
  expect(view.tagBottom).toBeLessThanOrEqual(view.logoBottom + 1)
  expect(view.copyScroll).toBeLessThanOrEqual(view.copyClient + 1)
}

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
  await createScaffoldWorkspace(scaffold, '卡页图片职责验收')
  worldId = await createCard('WORLD', '暗图取图验收世界', 'cover-haibian.webp', 'avatar-yunhe.webp', 'logo', '世界档案')
  for (const name of ['底卷·世界总志', '天地、历法与纪元', '生命与种族', '旅行者法术', '分卷·爱莉希雅手记', '卷末·后世补遗', '地理与气候', '商路、货币与物价']) {
    const created = await cardOp({ op: 'apply', cardId: worldId, command: { kind: 'add_module', name } })
    const moduleId = created.createdModuleIds?.[0]
    if (moduleId === undefined) throw new Error(`missing module id for ${name}`)
    await cardOp({ op: 'apply', cardId: worldId, command: { kind: 'write_markdown', moduleId, name, text: `${name}的验收正文。` } })
  }
  characterId = await createCard('CHARACTER', '暗图取图验收角色', 'cover-mori.webp', 'avatar-yunhe.webp', 'avatar', '角色档案')
  await seedSession(scaffold, await readFile(SEED, 'utf8'), SESSION_ID, undefined, { createdAt: Date.UTC(2026, 0, 1) })
}, 300_000)

afterAll(async () => { await close() })

describe('Noven card image roles and identity geometry', () => {
  it('keeps world cover, background, and logo distinct with the identity inside the cover', async () => {
    expect(worldId).not.toBe('')
    const browser = await chromium.launch()
    try {
      const page = await openSettingPage(browser, '暗图取图验收世界', 'world.png')
      try {
        const view = await appearance(page)
        // 页面底色来自封面取样，而不是写死的主题色。
        await expect.poll(() => page.locator('.nv-setting').evaluate(element => element.style.getPropertyValue('--nv-set-field')))
          .toMatch(/^rgb\(/)
        expect(view.cover).not.toBe(view.logo)
        expect(view.background).toContain(view.cover)
        // 身份压在封面下沿：方图与整块文字同高，文字不能探出上下边界。
        expect(view.logoTop).toBeGreaterThan(view.heroTop)
        expect(view.logoBottom).toBeLessThanOrEqual(view.heroBottom - 8)
        expectIdentityInsideAvatar(view)
        const tabsTop = await page.locator('.nv-set-tabshell').evaluate(element => element.getBoundingClientRect().top)
        expect(tabsTop - view.heroBottom).toBeLessThanOrEqual(16)
        expect(await page.locator('.nv-set-name').evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(28)
        const tabShell = await page.locator('.nv-set-tabshell').evaluate(element => ({
          background: getComputedStyle(element).backgroundColor,
          borderBottom: getComputedStyle(element).borderBottomWidth,
        }))
        expect(tabShell).toEqual({ background: 'rgba(0, 0, 0, 0)', borderBottom: '0px' })
        // 正文列不越过画布：几档窗口宽度下滚动区都没有横向溢出。
        for (const width of [1680, 1280, 1000, 780, 600]) {
          await page.setViewportSize({ width, height: 1000 })
          const strip = await page.locator('.nv-cardpage-scroll')
            .evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }))
          expect({ width, overflow: strip.scroll - strip.client }).toEqual({ width, overflow: 0 })
        }
        const narrow = await appearance(page)
        expect(narrow.cover).not.toBe(narrow.logo)
        expect(narrow.logoTop).toBeGreaterThan(narrow.heroTop)
        expect(narrow.logoBottom).toBeLessThanOrEqual(narrow.heroBottom - 8)
        expectIdentityInsideAvatar(narrow)
        const tabs = page.locator('.nv-set-tabs')
        const tabStrip = await tabs.evaluate(element => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflowX: getComputedStyle(element).overflowX,
          scrollbarWidth: getComputedStyle(element).scrollbarWidth,
        }))
        expect(tabStrip.scrollWidth).toBeGreaterThan(tabStrip.clientWidth)
        expect(tabStrip.overflowX).toBe('auto')
        expect(tabStrip.scrollbarWidth).toBe('none')
        // 溢出用两端渐隐交代：右侧有内容时不画滚动条，改为可发现的边缘提示。
        await page.locator('.nv-set-tabshell[data-overflow-right]').waitFor({ state: 'attached' })
        await page.locator('.nv-set-tabscroll-next').waitFor({ state: 'visible' })
        await tabs.hover()
        await page.mouse.wheel(0, 180)
        await expect.poll(() => tabs.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
        await page.locator('.nv-set-tabshell[data-overflow-left]').waitFor({ state: 'attached' })
        await page.locator('.nv-set-tabscroll-prev').waitFor({ state: 'visible' })
        // 直接触发 click，不让 Playwright 先帮我们滚进视野；active 必须由页面自己完整滚入。
        await page.getByRole('tab', { name: '商路、货币与物价' }).evaluate((element) => {
          if (element instanceof HTMLElement) element.click()
        })
        await page.waitForTimeout(650)
        const activeTabBox = await page.locator('.nv-set-tab[data-active]').evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        })
        const tabsBox = await tabs.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { left: rect.left, right: rect.right }
        })
        expect(activeTabBox.left).toBeGreaterThanOrEqual(tabsBox.left + 40)
        expect(activeTabBox.right).toBeLessThanOrEqual(tabsBox.right - 40)
        await page.locator('.nv-setting').screenshot({ path: join(SHOT_DIR, 'world-narrow.png') })
        console.log(`NOVEN_CARD_WORLD_SHOT=${join(SHOT_DIR, 'world.png')}`)
      } finally {
        await page.close()
      }
    } finally {
      await browser.close()
    }
  })

  it('keeps a character avatar distinct from its cover with the identity inside the cover', async () => {
    expect(characterId).not.toBe('')
    const browser = await chromium.launch()
    try {
      const page = await openSettingPage(browser, '暗图取图验收角色', 'character.png')
      try {
        const view = await appearance(page)
        expect(view.cover).not.toBe(view.logo)
        expect(view.background).toContain(view.cover)
        expect(view.logoTop).toBeGreaterThan(view.heroTop)
        expect(view.logoBottom).toBeLessThanOrEqual(view.heroBottom - 8)
        expectIdentityInsideAvatar(view)
        console.log(`NOVEN_CARD_CHARACTER_SHOT=${join(SHOT_DIR, 'character.png')}`)
      } finally {
        await page.close()
      }
    } finally {
      await browser.close()
    }
  })
})
