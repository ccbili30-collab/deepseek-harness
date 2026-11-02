import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'
import { AQI, SCENE, sessionFixture } from './noven-inline-fixture.ts'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const PREVIEW_OVERLAY = fileURLToPath(new URL('./noven-preview.overlay.yml', import.meta.url))
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-sidecar', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
] as const
const SESSION_ID = 'noven-inline-code'
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const sidecarRequire = createRequire(new URL('../../../plugins-noven/noven-sidecar/package.json', import.meta.url))
const { ledgerDirSync } = sidecarRequire('noven-ledger') as { readonly ledgerDirSync: (root: string) => string }

const SHOT_REGIONS = [
  ['dialogue', '.nv-code-dialogue'],
  ['narration', '.nv-code-narration'],
  ['story', '.nv-code-story'],
  ['choices', '.nv-code-choices'],
  ['diff', '.nv-code-frame:has(.nv-code-diffRow)'],
  ['conflicts', '.nv-code-conflicts'],
  ['media-grid', '.nv-code-mediaGrid'],
  ['palette', '.nv-code-palette'],
  ['stat', '.nv-code-stat'],
  ['meter', '.nv-code-meter'],
  ['bars', '.nv-code-bars'],
  ['line', '.nv-code-chart:has(.nv-code-linePath)'],
  ['radar', '.nv-code-chart:has(.nv-code-radarValue)'],
] as const

async function captureRegions(page: Page, directory: string, prefix: string): Promise<void> {
  for (const [name, selector] of SHOT_REGIONS) {
    await page.locator(selector).first().screenshot({ path: join(directory, `${prefix}-${name}.png`) })
  }
}

describe('web e2e: Noven inline code components', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let isolatedRoot: string
  let originalEnvironment: Record<string, string | undefined>
  let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }

  beforeAll(async () => {
    isolatedRoot = await mkdtemp(join(tmpdir(), 'noven-inline-code-'))
    originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
    process.env.NOVEN_HOME = join(isolatedRoot, 'library')
    process.env.NOVEN_PROJECTS_ROOT = join(isolatedRoot, 'projects')
    process.env.NOVEN_CHANNEL = 'test'
    await mkdir(process.env.NOVEN_HOME, { recursive: true })
    await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
    scaffold = await launchWebScaffold({
      harnessHome: join(isolatedRoot, 'harness'),
      profile: { packages: BUNDLES.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
      extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
      extraOverlayPath: [PRODUCT_OVERLAY, PREVIEW_OVERLAY],
    })
    await createScaffoldWorkspace(scaffold, '内联组件验收')
    await seedSession(scaffold, sessionFixture(), SESSION_ID, undefined, { createdAt: Date.UTC(2026, 0, 1) })
    await writeFile(join(scaffold.workspaceCwd, 'inline-aqi.svg'), AQI)
    await writeFile(join(scaffold.workspaceCwd, 'inline-scene.svg'), SCENE)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.addInitScript((id) => {
      localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
    }, SESSION_ID)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('.nv-mode-switch').first().waitFor({ timeout: 60_000 })
    await page.locator('[data-inline-block="code"]').first().waitFor({ timeout: 30_000 })
  }, 180_000)

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
    if (failures.length > 1) throw new AggregateError(failures, 'inline code acceptance cleanup failed')
  })

  it('renders every component family, resolves real images, and adapts without an iframe', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-inline-code-layout'))
    const selectors = [
      '.nv-code-dialogue', '.nv-code-narration', '.nv-code-story', '.nv-code-choices',
      '.nv-code-diffRow', '.nv-code-conflict', '.nv-code-mediaGrid', '.nv-code-palette',
      '.nv-code-stat', '.nv-code-meter', '.nv-code-bars', '.nv-code-linePath', '.nv-code-radarValue',
      '.nv-code-iconText', '.nv-code-badge', '.nv-code-mediaImage', '.nv-code-split', '.nv-code-frame',
    ]
    for (const selector of selectors) expect(await page.locator(selector).count(), selector).toBeGreaterThan(0)
    expect(await page.locator('[data-inline-block="code"] iframe').count()).toBe(0)
    expect(await page.locator('strong', { hasText: '阿七' }).count()).toBeGreaterThan(0)
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.nv-code-mediaImage')]
      .filter(image => image.src.includes('inline-')).every(image => image.complete && image.naturalWidth > 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const shots = process.env.NOVEN_INLINE_SHOTS
    if (shots !== undefined) {
      await mkdir(shots, { recursive: true })
      await captureRegions(page, shots, 'wide')
    }

    const lightColor = await page.locator('.nv-code-root').first().evaluate(element => getComputedStyle(element).color)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => page.locator('.nv-code-root').first().evaluate(element => getComputedStyle(element).color), { timeout: 10_000 }).not.toBe(lightColor)
    if (shots !== undefined) await captureRegions(page, shots, 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 600, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (shots !== undefined) await captureRegions(page, shots, 'narrow')
    await page.setViewportSize({ width: 1440, height: 900 })
  }, 120_000)

  it('replaces same-group chips, appends other groups, and sends ordinary text without new files', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-inline-code-choices'))
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-inline-block="code"]').first().waitFor({ timeout: 30_000 })
    const filesBefore = (await readdir(scaffold.workspaceCwd)).sort()
    await page.locator('.nv-code-choice').nth(1).click()
    await page.locator('[data-composer-chip]', { hasText: '剧情分支 · 要求证明' }).waitFor()
    await page.locator('.nv-code-choice').nth(0).click()
    await page.locator('[data-composer-chip]', { hasText: '剧情分支 · 相信阿七' }).waitFor()
    expect(await page.locator('[data-composer-chip]', { hasText: '剧情分支 · 要求证明' }).count()).toBe(0)
    expect(await page.locator('[data-composer-chip]').count()).toBe(1)

    await page.locator('.nv-code-color').first().click()
    await page.locator('.nv-code-action').first().click()
    expect(await page.locator('[data-composer-chip]').count()).toBe(3)
    const composer = page.locator('[data-composer-input]').first()
    await composer.click()
    await composer.press('End')
    await composer.pressSequentially('继续写这一段。')
    await composer.press('Enter')
    const flow = page.locator('[data-chat-flow]')
    await flow.getByText(/我选了《剧情分支》|I chose 相信阿七/).first().waitFor({ timeout: 15_000 })
    await expect.poll(() => flow.textContent()).toContain('继续写这一段。')
    expect((await readdir(scaffold.workspaceCwd)).sort()).toEqual(filesBefore)
    const adminFile = join(ledgerDirSync(scaffold.workspaceCwd), 'sidecar', 'admin.json')
    await expect.poll(async () => {
      try {
        await readFile(adminFile, 'utf8')
        return true
      } catch {
        return false
      }
    }).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
