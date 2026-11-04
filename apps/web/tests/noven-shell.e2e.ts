import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { SessionId } from '@deepseek-ai/dsh-session/types'
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

async function inspectMainSession(
  page: Page,
  scaffold: WebScaffold,
): Promise<{ readonly id: string; readonly cwd?: string; readonly blank?: boolean; readonly preset?: string }> {
  const raw = await page.evaluate(() => localStorage.getItem('dsh.sessions.current'))
  if (raw === null) throw new Error('current Session pointer missing')
  const parsed = JSON.parse(raw) as { sessionId?: unknown }
  if (typeof parsed.sessionId !== 'string') throw new Error('current Session id missing')
  const id = SessionId(parsed.sessionId)
  const [list, inspection] = await Promise.all([
    scaffold.ctx.sessionController.list({}, new AbortController().signal),
    scaffold.ctx.sessionController.inspect(id),
  ])
  const blank = list.items.find(row => row.sessionId === id)?.blank
  return {
    id,
    ...(inspection.meta.cwd === undefined ? {} : { cwd: inspection.meta.cwd }),
    ...(blank === undefined ? {} : { blank }),
    ...(inspection.meta.agentPreset === undefined ? {} : { preset: inspection.meta.agentPreset }),
  }
}

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

    expect(await page.locator('[data-shell-topbar]').count()).toBe(0)
    const brandHeader = page.locator('[data-integrated-brand]')
    await brandHeader.waitFor()
    const brandMode = brandHeader.getByRole('button', { name: '切换到手作', exact: true })
    await brandMode.waitFor()
    expect(await brandHeader.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    const lightsBox = await page.locator('[data-chrome-mirror-lights]').boundingBox()
    const brandToggleBox = await page.locator('[data-sidebar-brand-toggle]').boundingBox()
    const brandModeBox = await brandMode.boundingBox()
    expect((brandToggleBox?.x ?? 0) >= (lightsBox?.x ?? 0) + (lightsBox?.width ?? 0)).toBe(true)
    const brandCenterY = (brandToggleBox?.y ?? 0) + (brandToggleBox?.height ?? 0) / 2
    const modeCenterY = (brandModeBox?.y ?? 0) + (brandModeBox?.height ?? 0) / 2
    expect(Math.abs(brandCenterY - modeCenterY)).toBeLessThanOrEqual(1)
    const chineseName = page.locator('[data-noven-chinese-name]')
    const chineseNameBox = await chineseName.boundingBox()
    expect(chineseNameBox?.height).toBe(24)
    expect((chineseNameBox?.x ?? 0) + (chineseNameBox?.width ?? 0) <= (brandModeBox?.x ?? 0)).toBe(true)
    await expect.poll(() => page.locator('[data-noven-latin-name]').isVisible()).toBe(false)
    expect(await brandHeader.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect((await page.locator('[data-work]').boundingBox())?.y).toBe(0)
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
      await page.locator('.nv-canvas [data-chrome-command="reveal-auxiliary"]').click()
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
    await expect.poll(async () => {
      const brand = await navigation.boundingBox()
      const lights = await page.locator('[data-chrome-mirror-lights]').boundingBox()
      return (brand?.y ?? 0) >= (lights?.y ?? 0) + (lights?.height ?? 0)
    }).toBe(true)
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

    // Handcraft folds the auxiliary Conversation in its own trailing slot;
    // recovery then joins the primary Canvas tools without an independent rail.
    const center = page.locator('[data-center-col]')
    const recovery = page.locator('.nv-canvas [data-chrome-command="reveal-auxiliary"]')
    if ((await center.boundingBox())?.width === 0) await recovery.click()
    const fold = page.locator('[data-center-col] [data-chrome-command="fold-auxiliary"]')
    await fold.waitFor()
    await fold.click()
    await page.waitForFunction(() => document.querySelector('[data-center-col]')?.getBoundingClientRect().width === 0)
    await recovery.waitFor()
    const peers = await page.evaluate(() => {
      const recoveryButton = document.querySelector('.nv-canvas [data-chrome-command="reveal-auxiliary"]')!
      const tools = document.querySelector('.nv-canvas [data-noven-canvas-tools]')!
      const left = recoveryButton.getBoundingClientRect()
      const other = tools.getBoundingClientRect()
      return {
        width: left.width,
        height: left.height,
        centerY: left.y + left.height / 2,
        toolsY: other.y + other.height / 2,
        overlap: left.left < other.right && left.right > other.left && left.top < other.bottom && left.bottom > other.top,
      }
    })
    expect(peers).toEqual({ width: 28, height: 28, centerY: peers.toolsY, toolsY: peers.toolsY, overlap: false })
    await recovery.click()
    await page.waitForFunction(() => (document.querySelector('[data-center-col]')?.getBoundingClientRect().width ?? 0) > 0)
    expect((await center.boundingBox())?.width).toBeGreaterThan(0)
    expect(await page.locator('.nv-topbar-nav-toggle').count()).toBe(0)
  }, 120_000)

  it('keeps the main parent in navigation and the side parent in the side header', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-shell-parent-matrix'))
    const sidebar = page.locator('[data-sidebar-col]')
    const brand = page.locator('[data-sidebar-brand-toggle]')

    // Agent: Sessions are the main parent; no side parent is forced into the nav.
    await sidebar.locator('[role="treeitem"]').first().waitFor({ timeout: 30_000 })
    for (const label of ['创作', '社区', '消息', '我的']) {
      expect(await sidebar.locator(`nav[class*="panelList"] button[aria-label="${label}"]`).count()).toBe(1)
    }
    expect(await sidebar.locator('[data-workspace-side-directory]').count()).toBe(0)
    expect(await sidebar.locator('[data-workspace-side-sessions]').count()).toBe(0)

    // The side Canvas parent and fold share the trailing row; the fullscreen
    // is a content action and stays in the leading group.
    const recoveryFold = page.locator('[data-conversation-root] [data-chrome-command="reveal-auxiliary"]')
    const directory = page.locator('[data-workspace-side-directory]')
    if (!(await directory.isVisible()) && await recoveryFold.count() > 0) await recoveryFold.click()
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
    if ((await page.locator('[data-center-col]').boundingBox())?.width === 0) {
      await page.locator('.nv-canvas [data-chrome-command="reveal-auxiliary"]').click()
    }
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

    // Creation is an independent main panel; New Session remains a separate command.
    const creationReturn = await inspectMainSession(page, scaffold)
    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.locator('.nv-create-page').waitFor({ timeout: 30_000 })
    expect(await page.locator('.nv-create-page').count()).toBe(1)
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    await page.waitForFunction(() => document.querySelector('[data-animating]') === null
      && !document.documentElement.hasAttribute('data-page-turn')
      && !document.documentElement.hasAttribute('data-create-scene')
      && !document.documentElement.hasAttribute('data-panel-handoff'))
    const createShot = join(tmpdir(), `noven-create-panel-${process.pid}.png`)
    await page.screenshot({ path: createShot, fullPage: true })
    console.log(`NOVEN_CREATE_SHOT=${createShot}`)
    expect(await page.getByRole('button', { name: /^(手作|Handcraft)/ }).count()).toBe(1)
    expect(await page.getByRole('button', { name: /^(导入|Import)/ }).count()).toBe(1)
    expect(await page.locator('.nv-create-page [data-side-session-menu]').count()).toBe(0)
    await page.locator('.nv-create-page [data-chrome-command="reveal-auxiliary"]').click()
    await expect.poll(() => page.locator('.nv-create-page').count(), { timeout: 15_000 }).toBe(0)
    expect((await inspectMainSession(page, scaffold)).id).toBe(creationReturn.id)
    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    await page.keyboard.press('Alt+Meta+N')
    await expect.poll(() => page.locator('.nv-create-page').count(), { timeout: 15_000 }).toBe(0)
    await page.locator('[data-composer-input]').first().waitFor({ timeout: 30_000 })
    expect((await inspectMainSession(page, scaffold)).blank).toBe(true)
    expect((await inspectMainSession(page, scaffold)).preset).toBe('create')

    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.locator('.nv-create-page').waitFor({ timeout: 30_000 })
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    await writeFile(join(scaffold.workspaceCwd, '导入说明.md'), '# 导入说明\n\n来自创作页。\n')
    await page.locator('.nv-create-paths input[type="file"]').setInputFiles(join(scaffold.workspaceCwd, '导入说明.md'))
    const importDialog = page.getByRole('dialog')
    await importDialog.waitFor({ timeout: 30_000 })
    await importDialog.getByRole('button', { name: /^(导入|Import)$/, exact: true }).click()
    await expect.poll(() => page.locator('.nv-create-page').count(), { timeout: 30_000 }).toBe(0)
    await page.locator('.nv-canvas-tabtitle').filter({ hasText: '导入说明' }).waitFor({ timeout: 30_000 })

    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.locator('.nv-create-page').waitFor({ timeout: 30_000 })
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: /^(手作|Handcraft)/ }).click()
    await expect.poll(() => page.locator('.nv-create-page').count(), { timeout: 30_000 }).toBe(0)
    await page.locator('.nv-canvas').waitFor({ timeout: 30_000 })
    expect((await inspectMainSession(page, scaffold)).blank).not.toBe(true)
  }, 120_000)

  it('rehosts the creation composer across workspaces without duplicating blank hosts', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-create-workspaces'))
    await mkdir(join(isolatedRoot, 'create-second'), { recursive: true })
    const other = await realpath(join(isolatedRoot, 'create-second'))
    const registry = scaffold.ctx.workspaceRegistry as {
      create(path: string, title: string): Promise<Awaited<ReturnType<WebScaffold['ctx']['workspaceRegistry']['create']>>>
    }
    await registry.create(other, '第二创作工作区')
    const chooseWorkspace = async (title: string): Promise<void> => {
      const picker = page.locator('[data-composer-input][aria-label="选择工作区"]')
      if (await picker.count() > 0) await picker.click()
      else await page.locator('[data-workspace-trigger]').click()
      await page.getByRole('menuitem', { name: title, exact: true }).click()
    }
    const createBlankCount = async (): Promise<number> => {
      const { items } = await scaffold.ctx.sessionController.list({}, new AbortController().signal)
      let count = 0
      for (const row of items.filter(item => item.blank)) {
        if ((await scaffold.ctx.sessionController.inspect(row.sessionId)).meta.agentPreset === 'create') count += 1
      }
      return count
    }

    await page.locator('nav[class*="panelList"] button[aria-label="创作"]').click()
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    await chooseWorkspace('第二创作工作区')
    await expect.poll(async () => {
      const current = await inspectMainSession(page, scaffold)
      return current.blank === true && current.preset === 'create' ? current.cwd : undefined
    }, { timeout: 30_000 }).toBe(other)
    expect(await page.locator('.nv-create-page').count()).toBe(1)
    const blankCount = await createBlankCount()

    await chooseWorkspace('Noven验收工作区')
    await expect.poll(async () => {
      const current = await inspectMainSession(page, scaffold)
      return current.blank === true && current.preset === 'create' ? current.cwd : undefined
    }, { timeout: 30_000 }).toBe(scaffold.workspaceCwd)
    await page.locator('.nv-create-hero [data-composer-input]').waitFor({ timeout: 30_000 })
    expect(await page.locator('.nv-create-page').count()).toBe(1)
    expect(await createBlankCount()).toBe(blankCount)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
