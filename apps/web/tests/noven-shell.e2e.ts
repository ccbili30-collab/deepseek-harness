import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
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
      extraInstallAnchors: DEPENDENCIES.map(name => join(PLUGIN_ROOT, name, 'package.json')),
      extraOverlayPath: OVERLAY,
    })
    await mkdir(dirname(EXPECTED), { recursive: true })
    const raw = await readFile(SEED, 'utf8')
    await seedSession(scaffold, raw, 'noven-shell-layout', undefined, { createdAt: Date.UTC(2026, 0, 1) })
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

    await page.getByRole('button', { name: '手作', exact: true }).click()
    await page.locator('[data-noven-canvas-switch]').waitFor({ timeout: 30_000 })
    await page.locator('[data-noven-canvas-switch]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('[data-noven-canvas-tools]').click()
    await page.getByRole('menu').waitFor()
    await page.keyboard.press('Escape')

    await page.locator('[data-noven-session-navigation]:visible').first().click()
    await page.getByRole('button', { name: '返回内容导航', exact: true }).click()
    await page.locator('.nv-tree').first().waitFor()
    await page.getByRole('button', { name: 'Agent', exact: true }).click()
    await page.getByRole('button', { name: '手作', exact: true }).waitFor()

    const snapshot = await captureStableAria(page, '[data-work]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)
  }, 120_000)
})
