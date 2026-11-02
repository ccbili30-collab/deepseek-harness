import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/navigation-panes/session.v3.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/noven-shell/layout.expected.md', import.meta.url))
const OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
] as const
const DEPENDENCIES = ['noven-fmg', 'noven-ledger'] as const
const MODE = webSnapshotMode()
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const

describe('web e2e: Noven shell, object chrome, motion, and macOS mirror', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let isolatedRoot: string
  let originalEnvironment: Record<string, string | undefined>
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
  let slotErrors: string[] = []

  beforeAll(async () => {
    isolatedRoot = await mkdtemp(join(tmpdir(), 'noven-shell-web-'))
    originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
    process.env.NOVEN_HOME = join(isolatedRoot, 'library')
    process.env.NOVEN_PROJECTS_ROOT = join(isolatedRoot, 'projects')
    process.env.NOVEN_CHANNEL = 'test'
    await mkdir(process.env.NOVEN_HOME, { recursive: true })
    await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
    scaffold = await launchWebScaffold({
      harnessHome: join(isolatedRoot, 'harness'),
      profile: { packages: BUNDLES.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
      agentPresets: { default: 'create' },
      extraInstallAnchors: DEPENDENCIES.map(name => join(PLUGIN_ROOT, name, 'package.json')),
      extraOverlayPath: OVERLAY,
    })
    await mkdir(dirname(EXPECTED), { recursive: true })
    const raw = await readFile(SEED, 'utf8')
    await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd, 'Noven验收工作区')
    await seedSession(scaffold, raw, 'noven-shell-layout', 'create', { createdAt: Date.UTC(2026, 0, 1) })
    browser = await chromium.launch()
  }, 180_000)

  beforeEach(async () => {
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    slotErrors = []
    page.on('console', (message) => {
      if (message.type() === 'error' && /slot entry crashed/i.test(message.text())) slotErrors.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'noven-shell-layout' }))
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('.nv-mode-switch').first().waitFor({ timeout: 60_000 })
  }, 120_000)

  afterEach(async () => {
    const failures: unknown[] = []
    try {
      expect({ pageErrors: tripwire.pageErrors, slotErrors, warnings: tripwire.warnings })
        .toEqual({ pageErrors: [], slotErrors: [], warnings: [] })
    } catch (error) {
      failures.push(error)
    }
    await page?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Noven browser cleanup failed')
  })

  afterAll(async () => {
    const failures: unknown[] = []
    await browser?.close().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    for (const key of ISOLATED_ENV) {
      const previous = originalEnvironment[key]
      if (previous === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = previous
    }
    await rm(isolatedRoot, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Noven scaffold cleanup failed')
  })

  it('keeps object navigation available across modes and mirrors only macOS presentation', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-shell-layout'))
    expect(await page.evaluate(() => ({
      chrome: document.documentElement.dataset.chromePlatform,
      platform: document.documentElement.dataset.platform,
      fullscreen: document.documentElement.dataset.fullscreen,
      desktopBridge: 'dshDesktop' in window,
    }))).toEqual({ chrome: 'darwin', platform: undefined, fullscreen: undefined, desktopBridge: false })
    await page.locator('[data-chrome-mirror-lights]').waitFor()

    await page.getByText('FIRST_DONE', { exact: true }).first().waitFor({ timeout: 30_000 })
    await page.getByRole('tab', { name: '对话', exact: true }).waitFor()
    await page.getByRole('tab', { name: '执行记录', exact: true }).click()
    await page.getByRole('tab', { name: '对话', exact: true }).click()

    await page.locator('[data-shell-topbar]').waitFor()
    await page.locator('[data-workspace-trigger]').waitFor()
    expect(await page.locator('[data-sidebar-right-panel]').count()).toBe(0)

    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    // One tab: no switch and no meaningless +; the tools menu remains the
    // content action that opens feature pages.
    expect(await page.locator('[data-noven-canvas-switch]').count()).toBe(0)
    expect(await page.locator('.nv-canvas-plus').count()).toBe(0)
    await page.locator('[data-noven-canvas-tools]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')

    if (await page.locator('[data-side-session-menu]:visible').count() === 0) {
      await page.locator('[data-center-col] [data-side-fold]').click()
    }
    await page.locator('[data-noven-session-navigation]:visible').first().click()
    await page.getByRole('menuitem', { name: '会话列表', exact: true }).click()
    await page.getByRole('button', { name: '返回内容导航', exact: true }).click()
    await page.locator('.nv-tree').first().waitFor()

    await page.getByRole('button', { name: '切换到Agent', exact: true }).click()
    await page.getByRole('button', { name: '切换到手作', exact: true }).waitFor()

    const navigation = page.locator('[data-sidebar-brand-toggle]')
    const beforeFold = await navigation.boundingBox()
    await navigation.click()
    await page.locator('[data-session-trigger]').waitFor()
    const afterFold = await navigation.boundingBox()
    expect(Math.round(afterFold?.width ?? 0)).toBe(Math.round(beforeFold?.width ?? 0))
    expect(Math.round(afterFold?.height ?? 0)).toBe(Math.round(beforeFold?.height ?? 0))
    expect(await page.locator('.nv-topbar-nav-toggle').count()).toBe(0)
    await page.locator('[data-workspace-trigger]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('[data-session-trigger]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')
    await navigation.click()
    await page.locator('[data-workspace-trigger]').waitFor()

    const snapshot = await captureStableAria(page, '[data-work]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)

    await page.setViewportSize({ width: 800, height: 720 })
    await page.locator('[data-sidebar-collapsed]').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-sidebar-col]')?.getBoundingClientRect().width === 56)
    expect(await page.locator('[data-sidebar-col]').evaluate(element => element.getBoundingClientRect().width)).toBe(56)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }, 120_000)

  it('creates objects in the current Workspace and retains their canvas across Sessions', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-shell-workspace-canvas'))
    const second = await seedSession(scaffold, await readFile(SEED, 'utf8'), 'noven-shell-second', 'create')
    await scaffold.ctx.sessionController.rename({ sessionId: second, title: '第二会话' })

    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
    await page.locator('.nv-ed-title').waitFor()
    expect(await page.locator('.nv-ed-title').textContent()).toBe('未命名文稿')
    await page.locator('[data-noven-canvas-switch]').waitFor()
    await page.locator('[data-noven-canvas-switch]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')
    expect(await readFile(join(scaffold.workspaceCwd, '文稿', '未命名文稿.md'), 'utf8')).toBe('')
    expect(await page.locator('[data-workspace-trigger]').textContent()).not.toBe('工作区')

    await page.getByRole('button', { name: '切换到Agent', exact: true }).click()
    await page.getByRole('treeitem', { name: /第二会话/ }).click()
    await page.getByRole('button', { name: '展开', exact: true }).click()
    expect(await page.locator('.nv-ed-title').textContent()).toBe('未命名文稿')
    const template = await page.locator('[data-work]').evaluate(element => element.style.gridTemplateColumns)
    expect(template).not.toContain('minmax(0px, 0px)')
    expect(await page.locator('[data-sidebar-right-panel]').count()).toBe(0)
  }, 120_000)

  it('folds the side subject with one button and keeps the displayed file current', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-shell-fold-current'))
    const dir = join(scaffold.workspaceCwd, '验收文件')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '切换.txt'), 'alpha\n')
    await writeFile(join(dir, '第二.txt'), 'beta\n')

    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    await page.locator('.nv-tree-foot button', { hasText: '工具' }).click()
    await page.getByRole('menuitem', { name: '文件视图' }).click()
    const firstFile = page.locator('.nv-tree-main', { hasText: '切换.txt' }).first()
    await firstFile.waitFor({ timeout: 30_000 })
    await firstFile.click()
    await page.locator('[role="tab"]', { hasText: '切换.txt' }).first().waitFor()
    const firstRow = page.locator('.nv-tree-row', { hasText: '切换.txt' }).first()
    expect(await firstRow.getAttribute('data-current')).toBe('true')

    await page.locator('.nv-tree-main', { hasText: '第二.txt' }).first().click()
    await page.waitForTimeout(600)
    expect(await firstRow.getAttribute('data-current')).toBeNull()
    expect(await page.locator('.nv-tree-row', { hasText: '第二.txt' }).first().getAttribute('data-current')).toBe('true')

    // Entity view keeps the same object set; the current file stays marked.
    await page.locator('.nv-tree-foot button', { hasText: '工具' }).click()
    await page.getByRole('menuitem', { name: '模块视图' }).click()
    await page.locator('.nv-tree-row', { hasText: '第二.txt' }).first().waitFor()
    expect(await page.locator('.nv-tree-row', { hasText: '第二.txt' }).first().getAttribute('data-current')).toBe('true')

    // The side subject gets one frame button in both states.
    const center = page.locator('[data-center-col]')
    const fold = page.locator('[data-center-col] [data-side-fold]')
    if ((await center.boundingBox())?.width === 56) await fold.click()
    await fold.waitFor()
    const before = await fold.boundingBox()
    const beforeLabel = await fold.getAttribute('aria-label')
    await fold.click()
    await page.waitForTimeout(500)
    expect((await center.boundingBox())?.width).toBe(56)
    const after = await fold.boundingBox()
    expect(Math.round(after?.x ?? 0)).toBe(Math.round(before?.x ?? 0))
    expect(Math.round(after?.y ?? 0)).toBe(Math.round(before?.y ?? 0))
    expect(Math.round(after?.width ?? 0)).toBe(Math.round(before?.width ?? 0))
    expect(Math.round(after?.height ?? 0)).toBe(Math.round(before?.height ?? 0))
    expect(await fold.getAttribute('aria-label')).not.toBe(beforeLabel)
    await fold.click()
    await page.waitForFunction(() => (document.querySelector('[data-center-col]')?.getBoundingClientRect().width ?? 0) > 56)
    expect((await center.boundingBox())?.width).toBeGreaterThan(56)
    expect(await page.locator('.nv-topbar-nav-toggle').count()).toBe(0)
  }, 120_000)

  it('keeps the main parent in navigation and the side parent in the side header', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-shell-parent-matrix'))
    const sidebar = page.locator('[data-sidebar-col]')
    const brand = page.locator('[data-sidebar-brand-toggle]')
    const centerFold = page.locator('[data-center-col] [data-side-fold]')

    // Agent: Sessions are the main parent; no side parent is forced into the nav.
    await sidebar.locator('[role="treeitem"]').first().waitFor({ timeout: 30_000 })
    for (const label of ['创作', '社区', '消息', '我的']) {
      expect(await sidebar.locator(`nav[class*="panelList"] button[aria-label="${label}"]`).count()).toBe(1)
    }
    expect(await sidebar.locator('[data-workspace-side-directory]').count()).toBe(0)
    expect(await sidebar.locator('[data-workspace-side-sessions]').count()).toBe(0)

    // The side Canvas parent and fold share the trailing row; the fullscreen
    // is a content action and stays in the leading group.
    const rightbarFold = page.locator('[data-rightbar-col] [data-side-fold]')
    const directory = page.locator('[data-workspace-side-directory]')
    if (!(await directory.isVisible())) await rightbarFold.click()
    await directory.waitFor({ state: 'visible', timeout: 30_000 })
    const peers = await page.evaluate(() => {
      const box = (selector: string): { readonly width: number; readonly height: number; readonly y: number } | undefined => {
        const element = document.querySelector(selector)
        if (element === null) return undefined
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height, y: rect.y }
      }
      return {
        directory: box('[data-workspace-side-directory]'),
        fold: box('[data-rightbar-col] [data-side-fold]'),
        fullscreen: box('[data-rightbar-col] .nv-canvas-fullscreentoggle'),
      }
    })
    for (const peer of [peers.directory, peers.fold]) {
      expect(Math.round(peer?.width ?? 0)).toBe(28)
      expect(Math.round(peer?.height ?? 0)).toBe(28)
      expect(Math.round(peer?.y ?? 0)).toBe(Math.round(peers.fold?.y ?? -1))
    }
    expect(Math.round(peers.fullscreen?.width ?? 0)).toBe(28)
    expect(Math.round(peers.fullscreen?.height ?? 0)).toBe(28)

    // Collapsing navigation keeps the main Session rail and adds no side entry.
    await brand.click()
    await page.locator('[data-session-trigger]').waitFor()
    expect(await sidebar.locator('[data-workspace-side-directory]').count()).toBe(0)
    await brand.click()
    await page.locator('[data-workspace-trigger]').waitFor()

    // Handcraft: the directory is the main parent; Sessions hang off the side Conversation header.
    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    if ((await page.locator('[data-center-col]').boundingBox())?.width === 56) await centerFold.click()
    const sessionMenu = page.locator('[data-side-session-menu]')
    await sessionMenu.waitFor({ state: 'visible' })
    expect(await sidebar.locator('[data-workspace-side-sessions]').count()).toBe(0)
    await sessionMenu.click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')

    // Collapsing navigation keeps the directory rail; the side header stays beside the fold.
    await brand.click()
    await page.locator('[data-directory-trigger]').waitFor()
    expect(await page.locator('[data-side-session-menu]').count()).toBe(1)
    await brand.click()
    await page.locator('[data-workspace-trigger]').waitFor()

    // Creation is a command, never a third main subject.
    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.waitForTimeout(500)
    expect(await page.locator('.nv-create-page').count()).toBe(0)
  }, 120_000)
})
