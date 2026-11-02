// Keyless committed-session snapshot for the appearance settings model. The
// authored V4 log is replay input; no model request is issued. The golden
// records the scoped editor, shared image, advanced effects, and light-seam controls.
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, createScaffoldWorkspace, launchWebScaffold,
  realizeSeedFixture, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { snapshotSessionFixture } from './noven-inline-fixture.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/noven-appearance', import.meta.url))
const SEED = join(SNAPSHOT_DIR, 'session.v4.jsonl')
const EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const CANVAS_EXPECTED = join(SNAPSHOT_DIR, 'canvas.expected.md')
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const ASSETS = fileURLToPath(new URL('../../../plugins-noven/noven-shell/assets', import.meta.url))
const SESSION_ID = 'noven-appearance-snapshot'
const MODE = webSnapshotMode()
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-sidecar', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
] as const

let scaffold: WebScaffold
let browser: Browser
let page: Page
let isolatedRoot: string
let tripwire: ReturnType<typeof watchConsole> = { warnings: [], pageErrors: [] }
const originalEnvironment = Object.fromEntries(ISOLATED_ENV.map(key => [key, process.env[key]]))
let closing: Promise<void> | undefined
const onSignal = (): void => { void close().then(() => { process.exit(0) }) }
async function close(): Promise<void> {
  closing ??= (async () => {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
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
    if (failures.length > 1) throw new AggregateError(failures, 'appearance snapshot cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

beforeAll(async () => {
  isolatedRoot = await mkdtemp(join(tmpdir(), 'noven-appearance-snapshot-'))
  process.env.NOVEN_HOME = join(isolatedRoot, 'library')
  process.env.NOVEN_PROJECTS_ROOT = join(isolatedRoot, 'projects')
  process.env.NOVEN_CHANNEL = 'test'
  await mkdir(process.env.NOVEN_HOME, { recursive: true })
  await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
  scaffold = await launchWebScaffold({
    harnessHome: join(isolatedRoot, 'harness'),
    profile: { packages: BUNDLES.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
    extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
    extraOverlayPath: [PRODUCT_OVERLAY],
  })
  await createScaffoldWorkspace(scaffold, '外观快照')
  await mkdir(join(scaffold.workspaceCwd, '外观'), { recursive: true })
  await copyFile(join(ASSETS, 'cover-yueban.webp'), join(scaffold.workspaceCwd, '外观', 'shared.webp'))
  await writeFile(join(scaffold.workspaceCwd, '外观说明.md'), '# 外观快照\n')
  const raw = await readFile(SEED, 'utf8')
  expect(raw, 'committed fixture must match its authored source').toBe(snapshotSessionFixture())
  await seedSession(scaffold, realizeSeedFixture(scaffold, raw, SESSION_ID), SESSION_ID, undefined, {
    createdAt: Date.UTC(2026, 0, 1),
  })
  for (const body of [
    { action: 'visual', view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.85 },
    { action: 'shared', background: { kind: 'image', imagePath: '外观/shared.webp' } },
    {
      action: 'conversation', scope: 'workspace',
      background: { kind: 'shared', focus: 'top', dim: 0.25, blur: 8, material: 'frosted' },
    },
  ]) {
    const response = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`appearance snapshot setup failed: ${await response.text()}`)
  }
  browser = await chromium.launch()
  page = await newEnglishPage(browser)
  tripwire = watchConsole(page)
  await page.addInitScript((id) => {
    localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
  }, SESSION_ID)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await page.locator('.nv-mode-switch').first().waitFor({ timeout: 60_000 })
  await page.locator('[data-inline-block="code"]').first().waitFor({ timeout: 30_000 })
}, 240_000)

afterAll(async () => { await close() })

describe('web snapshot: Noven appearance settings', () => {
  it('records the scoped editor and treatment controls without a model call', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-snapshot'))
    const manual = page.getByRole('button', { name: '切换到手作', exact: true })
    if (await manual.count() > 0) await manual.click()
    await page.locator('.nv-canvas').waitFor({ timeout: 30_000 })
    const canvasAria = await captureStableAria(page, '.nv-canvas', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CANVAS_EXPECTED, canvasAria, MODE)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^外观$|^Appearance$/ }).click()
    await page.locator('.nv-ap-preview').waitFor({ timeout: 30_000 })
    await page.locator('.nv-ap-target').selectOption('conversation')
    await page.getByRole('button', { name: /^(高级效果|Advanced effects)$/ }).click()
    await expect.poll(() => page.getByLabel(/^(背景|Background)$/, { exact: true }).inputValue()).toBe('shared')
    expect(await page.locator('html').getAttribute('data-noven-conversation-blur')).toBe('')
    expect(await page.locator('html').getAttribute('data-noven-conversation-skin')).toBe('frosted')
    expect(await page.locator('html').getAttribute('data-noven-conversation-foreground')).toBe('light')
    expect(tripwire.pageErrors).toEqual([])
    const aria = await captureStableAria(page, '.nv-appearance', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, aria, MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.v4.jsonl', 'canvas.expected.md', 'ui.expected.md'])
  }, 120_000)
})
