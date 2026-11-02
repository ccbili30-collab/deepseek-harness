// Keyless committed-session snapshot: the authored V4 log is replay input and
// the expected persisted result, while the Web lane renders its inline blocks
// through the shipped Noven composition. No model request is issued.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { AQI, SCENE, snapshotSessionFixture } from './noven-inline-fixture.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/noven-inline-blocks', import.meta.url))
const SEED = join(SNAPSHOT_DIR, 'session.v4.jsonl')
const EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const SESSION_ID = 'noven-inline-blocks-snapshot'
const MODE = webSnapshotMode()
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
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
    if (failures.length > 1) throw new AggregateError(failures, 'inline blocks snapshot cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

beforeAll(async () => {
  isolatedRoot = await mkdtemp(join(tmpdir(), 'noven-inline-blocks-snapshot-'))
  process.env.NOVEN_HOME = join(isolatedRoot, 'library')
  process.env.NOVEN_PROJECTS_ROOT = join(isolatedRoot, 'projects')
  process.env.NOVEN_CHANNEL = 'test'
  await mkdir(process.env.NOVEN_HOME, { recursive: true })
  await mkdir(process.env.NOVEN_PROJECTS_ROOT, { recursive: true })
  scaffold = await launchWebScaffold({
    harnessHome: join(isolatedRoot, 'harness'),
    profile: { packages: BUNDLES.map(name => ({ dir: join(PLUGIN_ROOT, name), enabled: true })) },
    agentPresets: { default: 'create' },
    extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
    extraOverlayPath: [PRODUCT_OVERLAY],
  })
  await createScaffoldWorkspace(scaffold, '内联块快照')
  await writeFile(join(scaffold.workspaceCwd, 'inline-aqi.svg'), AQI)
  await writeFile(join(scaffold.workspaceCwd, 'inline-scene.svg'), SCENE)
  const raw = await readFile(SEED, 'utf8')
  expect(raw, 'committed fixture must match its authored source').toBe(snapshotSessionFixture())
  await seedSession(scaffold, realizeSeedFixture(scaffold, raw, SESSION_ID), SESSION_ID, undefined, {
    createdAt: Date.UTC(2026, 0, 1),
  })
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

describe('web snapshot: Noven inline blocks', () => {
  it('renders a committed session, keeps two text-block choice groups distinct, and matches the golden', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-inline-blocks-snapshot'))
    await page.getByRole('button', { name: /选甲/ }).click()
    await page.getByRole('button', { name: /选丙/ }).click()
    await page.locator('[data-composer-chip]', { hasText: '第一组 · 选甲' }).waitFor()
    await page.locator('[data-composer-chip]', { hasText: '第二组 · 选丙' }).waitFor()
    expect(await page.locator('[data-composer-chip]').count()).toBe(2)
    expect(await page.locator('.nv-code-dialogue').count()).toBeGreaterThan(0)
    expect(await page.locator('.nv-code-chart').count()).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
    const aria = await captureStableAria(page, '[data-conversation-root]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(EXPECTED, aria, MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.v4.jsonl', 'ui.expected.md'])
  }, 120_000)
})
