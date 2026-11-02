import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { AQI, SCENE, sessionFixture } from './noven-inline-fixture.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const ASSETS = fileURLToPath(new URL('../../../plugins-noven/noven-shell/assets', import.meta.url))
const SHOTS = join(tmpdir(), `noven-appearance-shots-${process.pid}`)
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-sidecar', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
] as const
const SESSION_ID = 'noven-appearance'
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const

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
    if (failures.length > 1) throw new AggregateError(failures, 'appearance acceptance cleanup failed')
  })()
  return closing
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

interface AppearanceResponse {
  readonly revision: number
  readonly workspace: {
    readonly shared?: { readonly path: string }
    readonly conversation?: {
      readonly kind: string
      readonly focus?: string
      readonly dim?: number
      readonly blur?: number
      readonly material?: string
      readonly foreground?: string
    }
  }
  readonly resolved: {
    readonly shell: { readonly kind: string; readonly path?: string } | null
    readonly canvas: { readonly kind: string; readonly path?: string } | null
    readonly conversation: { readonly kind: string; readonly path?: string } | null
    readonly assistantAvatar: { readonly path?: string } | null
  }
}

async function appearance(body: Record<string, unknown>): Promise<AppearanceResponse> {
  const response = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`appearance write failed: ${await response.text()}`)
  return await response.json() as AppearanceResponse
}

async function backgroundImage(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate(element => getComputedStyle(element).backgroundImage)
}

beforeAll(async () => {
  isolatedRoot = await mkdtemp(join(tmpdir(), 'noven-appearance-web-'))
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
  await createScaffoldWorkspace(scaffold, '外观验收')
  await writeFile(join(scaffold.workspaceCwd, '外观说明.md'), '# 外观验收\n\n背景属于容器，正文、按钮和状态仍由 Noven 渲染。\n')
  await writeFile(join(scaffold.workspaceCwd, 'inline-aqi.svg'), AQI)
  await writeFile(join(scaffold.workspaceCwd, 'inline-scene.svg'), SCENE)
  const assets = join(scaffold.workspaceCwd, '外观')
  await mkdir(assets, { recursive: true })
  for (const [source, target] of [
    ['cover-haibian.webp', 'shell.webp'], ['cover-mori.webp', 'canvas.webp'], ['cover-wudao.webp', 'file.webp'],
    ['cover-yueban.webp', 'conversation.webp'], ['cover-new-world.webp', 'session.webp'],
    ['avatar-yunhe.webp', 'avatar-default.webp'], ['avatar-shenyan.webp', 'avatar-session.webp'],
  ] as const) await copyFile(join(ASSETS, source), join(assets, target))
  await seedSession(scaffold, sessionFixture(), SESSION_ID, undefined, { createdAt: Date.UTC(2026, 0, 1) })
  await mkdir(SHOTS, { recursive: true })
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

describe('web e2e: scoped Noven appearance', () => {
  it('resolves workspace, file, and session layers without changing layout or content', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance'))
    await page.waitForFunction(() => document.querySelector('[data-animating]') === null)
    const applicationMark = page.locator('[data-sidebar-brand-toggle] img').first()
    expect(await applicationMark.getAttribute('src')).toContain('noven-icon.png')
    await expect.poll(() => applicationMark.evaluate(element => (element as HTMLImageElement).naturalWidth > 0)).toBe(true)
    expect(await page.locator('html[data-noven-shell-appearance]').count()).toBe(0)
    const layoutColumns = (): Promise<string> => page.locator('[data-work]').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').map(value => Math.round(Number.parseFloat(value))).join(' '))
    const baselineTemplate = await layoutColumns()
    const baselineText = await page.locator('[data-chat-flow]').textContent()

    const workspace = await appearance({ action: 'shell', background: { kind: 'image', imagePath: '外观/shell.webp' } })
    expect(workspace.revision).toBe(1)
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'image', imagePath: '外观/canvas.webp' } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'image', imagePath: '外观/conversation.webp' }, avatar: { kind: 'image', imagePath: '外观/avatar-default.webp' } })

    await expect.poll(() => page.locator('html[data-noven-shell-appearance]').count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => backgroundImage(page, '[data-product-frame]'), { timeout: 15_000 }).toContain('shell.webp')
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    expect(await page.locator('[data-conversation-root]').evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: getComputedStyle(element).overflow,
    }))).toEqual({ radius: '14px', overflow: 'hidden' })
    await expect.poll(async () => page.locator('[data-conversation-root] header').first().evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    expect(await page.locator('html[data-noven-assistant-avatar]').count()).toBe(1)
    await expect.poll(async () => page.locator('[data-noven-assistant-answer]').first().evaluate(element => getComputedStyle(element, '::before').backgroundImage), { timeout: 15_000 }).toContain('avatar-default.webp')
    expect(await page.locator('[data-inline-block="code"]').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    expect(await layoutColumns()).toBe(baselineTemplate)
    expect(await page.locator('[data-chat-flow]').textContent()).toBe(baselineText)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(SHOTS, 'wide-agent.png'), fullPage: true })
    await page.locator('[data-conversation-scroll]').evaluate((element) => { element.scrollTop = 0 })
    await expect.poll(async () => page.locator('[data-conversation-scroll]').evaluate(element => element.scrollTop), { timeout: 10_000 }).toBe(0)
    await page.screenshot({ path: join(SHOTS, 'wide-agent-top.png'), fullPage: true })

    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
    await page.locator('.nv-ed-title').waitFor({ timeout: 30_000 })
    await page.getByRole('tab', { name: /未命名文稿/ }).first().waitFor({ timeout: 30_000 })
    const filePath = '文稿/未命名文稿.md'
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('canvas.webp')
    expect(await page.locator('.nv-ed-main').evaluate(element => getComputedStyle(element).backdropFilter)).toContain('blur')
    expect(await page.locator('.nv-ed-head').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none')
    expect(await page.locator('.nv-doc-bn .bn-editor').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none')
    await page.screenshot({ path: join(SHOTS, 'wide-manual-file-default.png'), fullPage: true })

    await appearance({ action: 'canvas', scope: 'file', filePath, background: { kind: 'image', imagePath: '外观/file.webp' } })
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('file.webp')
    await page.screenshot({ path: join(SHOTS, 'wide-manual-file-override.png'), fullPage: true })
    await appearance({ action: 'canvas', scope: 'file', filePath, background: { kind: 'transparent' } })
    await expect.poll(async () => page.locator('.nv-leaf').first().evaluate(element => ({
      image: getComputedStyle(element).backgroundImage,
      color: getComputedStyle(element).backgroundColor,
    })), { timeout: 15_000 }).toEqual({ image: 'none', color: 'rgba(0, 0, 0, 0)' })
    await appearance({ action: 'canvas', scope: 'file', filePath, background: { kind: 'default' } })
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('canvas.webp')

    await appearance({ action: 'conversation', scope: 'session', background: { kind: 'image', imagePath: '外观/session.webp' }, avatar: { kind: 'image', imagePath: '外观/avatar-session.webp' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('session.webp')
    await expect.poll(async () => page.locator('[data-noven-assistant-answer]').first().evaluate(element => getComputedStyle(element, '::before').backgroundImage), { timeout: 15_000 }).toContain('avatar-session.webp')
    await appearance({ action: 'conversation', scope: 'session', background: { kind: 'default' }, avatar: { kind: 'default' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    await expect.poll(async () => page.locator('[data-noven-assistant-answer]').first().evaluate(element => getComputedStyle(element, '::before').backgroundImage), { timeout: 15_000 }).toContain('avatar-default.webp')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.screenshot({ path: join(SHOTS, 'wide-dark.png'), fullPage: true })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 600, height: 800 })
    await page.screenshot({ path: join(SHOTS, 'narrow-manual.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 900 })

    await appearance({ action: 'shell', background: { kind: 'default' } })
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'default' }, avatar: { kind: 'default' } })
    await expect.poll(() => page.locator('html[data-noven-shell-appearance]').count(), { timeout: 15_000 }).toBe(0)
    await expect.poll(() => page.locator('html[data-noven-assistant-avatar]').count(), { timeout: 15_000 }).toBe(0)
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toBe('none')
    await expect.poll(() => page.locator('.nv-leaf').first().getAttribute('data-noven-canvas-background'), { timeout: 15_000 }).toBeNull()
    for (const selector of ['.nv-leaf', '[data-conversation-root]']) {
      expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).borderTopWidth)).not.toBe('0px')
      expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')
    }
    expect(await page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('14px')
    expect(await page.locator('[data-conversation-root]').evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: getComputedStyle(element).overflow,
    }))).toEqual({ radius: '14px', overflow: 'hidden' })
    await page.screenshot({ path: join(SHOTS, 'default-content-borders.png'), fullPage: true })
    await page.getByRole('button', { name: '切换到Agent', exact: true }).click()
    await page.locator('[data-conversation-root]').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => document.querySelector('[data-animating]') === null)
    await page.waitForTimeout(600)
    await page.screenshot({ path: join(SHOTS, 'default-conversation-border.png'), fullPage: true })
    expect(tripwire.pageErrors).toEqual([])
    console.log(`NOVEN_APPEARANCE_SHOTS=${SHOTS}`)
  }, 180_000)

  it('edits one scope, autosaves, and switches between defaults and presets', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-editor'))
    const switchAgent = page.getByRole('button', { name: '切换到Agent', exact: true })
    if (await switchAgent.count() > 0) await switchAgent.click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: /^通用设置$|^General settings$/ }).click()
    expect(await page.getByRole('button', { name: /^(浅色|Light|深色|Dark|跟随系统|Follow system)$/ }).count()).toBe(0)
    await page.getByRole('button', { name: /^外观$|^Appearance$/ }).click()
    await page.locator('.nv-ap-preview').waitFor({ timeout: 30_000 })
    await page.locator('.nv-appearance').screenshot({ path: join(SHOTS, 'appearance-settings.png') })
    expect(await page.locator('.nv-ap-row').first().evaluate(element => ({
      padding: getComputedStyle(element).paddingTop,
      divider: getComputedStyle(element).borderBottomWidth,
      title: getComputedStyle(element.querySelector('.nv-ap-title')!).fontSize,
    }))).toEqual({ padding: '16px', divider: '1px', title: '14px' })
    expect(await page.locator('.nv-ap-select').first().evaluate(element => ({
      height: getComputedStyle(element).height,
      border: getComputedStyle(element).borderTopWidth,
      font: getComputedStyle(element).fontSize,
    }))).toEqual({ height: '36px', border: '0px', font: '14px' })
    await page.setViewportSize({ width: 600, height: 800 })
    await page.locator('.nv-appearance').screenshot({ path: join(SHOTS, 'appearance-settings-narrow.png') })
    expect(await page.locator('.nv-appearance').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.locator('.nv-ap-target').selectOption('conversation')
    await page.getByLabel(/^(背景|Background)$/, { exact: true }).selectOption('custom')
    await page.getByRole('button', { name: /^(高级效果|Advanced effects)$/ }).click()
    const advanced = page.locator('.nv-ap-advanced')
    await advanced.getByLabel(/^(自定义图|Custom image)$/).fill('外观/conversation.webp')
    await advanced.getByLabel(/^(自定义图|Custom image)$/).blur()
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    await advanced.locator('.nv-ap-avatar input[type="file"]').setInputFiles(join(scaffold.workspaceCwd, '外观/avatar-default.webp'))
    await expect.poll(() => page.locator('html[data-noven-assistant-avatar]').count(), { timeout: 15_000 }).toBe(1)

    await page.getByLabel(/^(编辑对象|Edit target)$/, { exact: true }).selectOption('file')
    await expect.poll(() => page.locator('.nv-ap-head').textContent(), { timeout: 15_000 }).toContain('文稿/未命名文稿.md')

    await page.getByLabel(/^(编辑对象|Edit target)$/, { exact: true }).selectOption('workspace')
    await page.locator('.nv-ap-target').selectOption('conversation')
    await page.getByLabel(/^(背景|Background)$/, { exact: true }).selectOption('shared')
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    await advanced.locator('select').nth(0).selectOption('top')
    await advanced.locator('select').nth(1).selectOption('frosted')
    await advanced.locator('select').nth(2).selectOption('light')
    await advanced.locator('input[type="range"]').nth(0).evaluate((element, value) => {
      const input = element as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, 25)
    await advanced.locator('input[type="range"]').nth(1).evaluate((element, value) => {
      const input = element as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value))
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, 8)
    await expect.poll(() => page.locator('html').getAttribute('data-noven-conversation-blur'), { timeout: 15_000 }).toBe('')
    await expect.poll(async () => page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').filter), { timeout: 15_000 }).toBe('blur(8px)')
    expect(await backgroundImage(page, '[data-conversation-root]')).toBe('none')
    expect(await page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').backgroundImage)).toContain('0.25')
    expect(await page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').backgroundPosition)).toContain('50% 0%')
    expect(await page.locator('html').getAttribute('data-noven-conversation-skin')).toBe('frosted')
    expect(await page.locator('html').getAttribute('data-noven-conversation-foreground')).toBe('light')
    const persistedResponse = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)
    const persisted = await persistedResponse.json() as AppearanceResponse
    expect(persisted.workspace.conversation).toEqual({ kind: 'shared', focus: 'top', dim: 0.25, blur: 8, material: 'frosted', foreground: 'light' })

    await page.getByRole('button', { name: /^(保存为预设|Save as preset)$/ }).click()
    const preset = page.locator('.nv-ap-preset-list').getByRole('button', { name: /我的外观 1|My appearance 1/ })
    await preset.waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /恢复 Noven 默认|Restore Noven defaults/ }).click()
    await expect.poll(() => page.locator('html[data-noven-conversation-appearance]').count(), { timeout: 15_000 }).toBe(0)
    expect(await preset.count()).toBe(1)
    await preset.click()
    await expect.poll(async () => page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').backgroundImage), { timeout: 15_000 }).toContain('conversation.webp')
    await expect.poll(async () => page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').filter), { timeout: 15_000 }).toBe('blur(8px)')
    expect(await backgroundImage(page, '[data-conversation-root]')).toBe('none')
    await page.getByRole('button', { name: /恢复 Noven 默认|Restore Noven defaults/ }).click()
    await expect.poll(() => page.locator('html[data-noven-conversation-appearance]').count(), { timeout: 15_000 }).toBe(0)
    await appearance({ action: 'canvas', scope: 'file', filePath: '文稿/未命名文稿.md', background: { kind: 'image', imagePath: '外观/file.webp' } })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    await page.getByRole('tab', { name: /未命名文稿/ }).first().click()
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('file.webp')
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)

  it('keeps default, shared, custom, and transparent backgrounds independent per pane', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-panes'))
    await appearance({ action: 'shell', background: { kind: 'image', imagePath: '外观/shell.webp' } })
    await appearance({ action: 'visual', view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-skin'), { timeout: 15_000 }).toBe('frosted')
    expect(await page.locator('html').getAttribute('data-noven-shell-foreground')).toBe('light')
    await expect.poll(async () => page.locator('[data-shell-topbar]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    expect(await page.locator('[data-shell-topbar]').evaluate(element => getComputedStyle(element).borderBottomColor)).toBe('rgba(0, 0, 0, 0)')
    await expect.poll(async () => page.locator('[data-sidebar-col]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    expect(await page.locator('[data-sidebar-col]').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none')
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme'), { timeout: 15_000 }).toBe('')
    await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).colorScheme), { timeout: 15_000 }).toBe('dark')
    await expect.poll(() => page.locator('body').evaluate(element => getComputedStyle(element).getPropertyValue('--dsw-alias-bg-base').trim()), { timeout: 15_000 }).not.toBe('#FFFFFF')

    const agent = page.getByRole('button', { name: '切换到Agent', exact: true })
    if (await agent.count() > 0) await agent.click()
    const newSession = page.locator('button[class*="newSession"]').first()
    await expect.poll(() => newSession.evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(255, 255, 255, 0.15)')
    const manualForTools = page.getByRole('button', { name: '切换到手作', exact: true })
    await manualForTools.click()
    for (const selector of ['[data-center-col]', '[data-sidebar-right-canvas-host]']) {
      await expect.poll(async () => page.locator(selector).first().evaluate(element => getComputedStyle(element).borderLeftColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    }
    const activeCanvasTab = page.locator('.nv-canvas-tab[aria-selected="true"]').first()
    await page.mouse.move(0, 0)
    await expect.poll(() => activeCanvasTab.locator('.nv-canvas-tabx').evaluate(element => getComputedStyle(element).opacity)).toBe('0')
    await activeCanvasTab.hover()
    await expect.poll(() => activeCanvasTab.locator('.nv-canvas-tabx').evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    await page.mouse.move(0, 0)
    await page.locator('[data-noven-canvas-tools]').click()
    await page.locator('[role="menu"]').waitFor({ timeout: 15_000 })
    expect(await page.locator('[data-menu-material]').first().evaluate(element => getComputedStyle(element.firstElementChild!).backgroundColor)).not.toBe('rgb(255, 255, 255)')
    expect(await page.locator('.nv-ed-main').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(14, 19, 17, 0.21)')
    expect(await page.locator('.nv-ed-main').evaluate(element => getComputedStyle(element).boxShadow)).not.toContain('inset')
    await page.screenshot({ path: join(SHOTS, 'tools-menu.png'), fullPage: true })
    for (const label of ['本会话', '会话设置', '设定']) {
      expect(await page.getByRole('menuitem', { name: label, exact: true }).count()).toBe(0)
    }
    await page.keyboard.press('Escape')

    await page.locator('.nv-canvas-fullscreentoggle').first().click()
    const fullscreen = page.locator('.nv-canvas[data-canvas-fullscreen]')
    await fullscreen.waitFor({ timeout: 15_000 })
    const fullscreenBox = await fullscreen.boundingBox()
    expect(fullscreenBox).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
    const topbar = page.locator('.nv-mode-switch-topbar')
    const topbarHidden = await topbar.count() === 0 || await topbar.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('.nv-canvas') !== null
    })
    expect(topbarHidden).toBe(true)
    await page.screenshot({ path: join(SHOTS, 'canvas-window-fullscreen.png'), fullPage: true })
    await page.locator('.nv-canvas-fullscreentoggle').first().click()
    await expect.poll(() => page.locator('.nv-canvas[data-canvas-fullscreen]').count()).toBe(0)
    await topbar.waitFor({ timeout: 15_000 })

    const brandToggle = page.locator('[data-sidebar-brand-toggle]').first()
    await brandToggle.click()
    await page.locator('[data-noven-canvas-switch]').click()
    const createMenu = page.getByRole('menu')
    await createMenu.waitFor({ timeout: 15_000 })
    await createMenu.getByRole('menuitem', { name: '起点', exact: true }).click()
    const createDocument = page.getByRole('button', { name: /文稿 从一页白纸开始/ })
    await createDocument.waitFor({ timeout: 15_000 })
    await createDocument.click()
    await page.locator('.nv-ed-title').waitFor({ timeout: 15_000 })
    await brandToggle.click()

    const heroPage = await newEnglishPage(browser)
    const heroConsole = watchConsole(heroPage)
    try {
      await heroPage.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await heroPage.locator('.nv-create-novel').waitFor({ timeout: 30_000 })
      const blankHeader = heroPage.locator('[data-slot="conversation.header"] > header')
      await expect.poll(() => blankHeader.evaluate(element => element.getBoundingClientRect().height), { timeout: 15_000 }).toBe(0)
      expect(await heroPage.locator('.nv-create-novel').evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        backdrop: getComputedStyle(element).backdropFilter,
      }))).toEqual({ background: 'rgba(0, 0, 0, 0)', backdrop: 'none' })
      await expect.poll(() => heroPage.locator('html').getAttribute('data-noven-shell-skin'), { timeout: 15_000 }).toBe('frosted')
      await expect.poll(async () => heroPage.locator('[data-sidebar-col]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
      for (const selector of ['[data-conversation-scroll]', '[data-composer-card]']) {
        expect(await heroPage.locator(selector).evaluate(element => getComputedStyle(element).boxShadow)).not.toContain('inset')
      }
      await heroPage.screenshot({ path: join(SHOTS, 'create-hero.png'), fullPage: true })
      await heroPage.locator('[data-composer-input]').fill('/')
      await heroPage.locator('[data-trigger-menu]').waitFor({ timeout: 15_000 })
      expect(await heroPage.locator('[data-menu-backing]').first().evaluate(element => getComputedStyle(element).display)).toBe('none')
      await expect.poll(() => heroPage.locator('[data-menu-material]').first().evaluate(element => getComputedStyle(element.firstElementChild!).backgroundColor), { timeout: 15_000 }).toBe('rgba(14, 19, 17, 0.21)')
      const menuColors = await heroPage.locator('[data-trigger-menu]').evaluate((menu) => {
        const option = [...menu.querySelectorAll<HTMLElement>('[role="option"]')].find(element => element.textContent?.includes('goal'))
        const alias = option === undefined ? undefined : [...option.querySelectorAll<HTMLElement>('span')].find(element => element.textContent === 'goal')
        const icon = option?.querySelector<HTMLElement>('[aria-hidden="true"]')
        return {
          option: option === undefined ? undefined : getComputedStyle(option).color,
          alias: alias === undefined ? undefined : getComputedStyle(alias).color,
          icon: icon === undefined ? undefined : getComputedStyle(icon).color,
        }
      })
      expect(menuColors).toEqual({ option: 'rgb(244, 247, 245)', alias: 'rgba(244, 247, 245, 0.68)', icon: 'rgb(244, 247, 245)' })
      await heroPage.screenshot({ path: join(SHOTS, 'create-menu.png'), fullPage: true })
      await heroPage.keyboard.press('Escape')
      const openAppearance = async (): Promise<void> => {
        await heroPage.getByRole('button', { name: /^设置$|^Settings$/ }).click()
        await heroPage.getByRole('button', { name: /^外观$|^Appearance$/ }).click()
        await heroPage.locator('.nv-appearance').waitFor({ timeout: 15_000 })
      }
      await openAppearance()
      let global = heroPage.locator('.nv-appearance')
      await global.getByLabel(/^(界面视图|Interface view)$/, { exact: true }).selectOption('light')
      await expect.poll(() => heroPage.locator('body').evaluate(element => getComputedStyle(element).colorScheme), { timeout: 15_000 }).toBe('light')
      await expect.poll(() => heroPage.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('dark')
      expect(await global.locator('input[type="range"]').evaluate(element => ({
        scheme: getComputedStyle(element).colorScheme,
        accent: getComputedStyle(element).accentColor,
      }))).toEqual({ scheme: 'light', accent: 'rgb(52, 211, 153)' })
      await heroPage.keyboard.press('Escape')
      await expect.poll(() => heroPage.locator('.nv-create-typed-prefix').evaluate(element => getComputedStyle(element).color), { timeout: 15_000 }).toBe('rgb(22, 24, 26)')

      await openAppearance()
      global = heroPage.locator('.nv-appearance')
      await global.getByLabel(/^(界面视图|Interface view)$/, { exact: true }).selectOption('dark')
      await expect.poll(() => heroPage.locator('body').evaluate(element => getComputedStyle(element).colorScheme), { timeout: 15_000 }).toBe('dark')
      await expect.poll(() => heroPage.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('light')
      expect(await global.locator('input[type="range"]').evaluate(element => getComputedStyle(element).colorScheme)).toBe('dark')
      await heroPage.locator('.nv-appearance').screenshot({ path: join(SHOTS, 'appearance-theme-controls.png') })
      await heroPage.keyboard.press('Escape')
      await expect.poll(() => heroPage.locator('.nv-create-typed-prefix').evaluate(element => getComputedStyle(element).color), { timeout: 15_000 }).toBe('rgb(244, 247, 245)')
      expect(heroConsole.pageErrors).toEqual([])
    } catch (error) {
      await saveFailureShot(heroPage, 'noven-appearance-hero')
      throw error
    } finally {
      await heroPage.close()
    }

    const manual = page.getByRole('button', { name: '切换到手作', exact: true })
    if (await manual.count() > 0) await manual.click()
    await page.locator('.nv-leaf').first().waitFor({ timeout: 30_000 })
    const filePath = '文稿/未命名文稿.md'
    const whiteShellControls = await page.locator('[data-product-frame] button').evaluateAll(elements =>
      elements.filter(element => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)')
        .map(element => ({ className: element.getAttribute('class'), text: element.textContent?.trim().slice(0, 30), aria: element.getAttribute('aria-label') })))
    expect(whiteShellControls).toEqual([])
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'canvas', scope: 'file', filePath, background: { kind: 'default' } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'default' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toBe('none')

    const shared = await appearance({ action: 'shared', background: { kind: 'image', imagePath: '外观/conversation.webp' } })
    expect(shared.workspace.shared?.path).toBe('外观/conversation.webp')
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared', focus: 'top', dim: 0.2 } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'shared' } })
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('conversation.webp')
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    for (const selector of ['.nv-canvas', '[data-sidebar-right-canvas-host]', '[data-sidebar-right-canvas]']) {
      await expect.poll(async () => page.locator(selector).first().evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    }
    expect(await page.locator('.nv-leaf').first().getAttribute('data-noven-canvas-blur')).toBeNull()
    expect(await page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element).backgroundPosition)).toContain('50% 0%')
    expect(await page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('14px')
    expect(await page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element).overflow)).toBe('hidden')
    expect(await backgroundImage(page, '.nv-leaf')).toContain('0.2')
    expect(await page.locator('html').getAttribute('data-noven-conversation-surface')).toBeNull()
    expect(await page.locator('body').evaluate(element => element.style.getPropertyValue('--noven-conversation-reading-surface'))).toBe('transparent')
    expect(await page.locator('body').evaluate(element => element.style.getPropertyValue('--noven-shell-child-background'))).toBe('transparent')

    const selectedTabColor = await page.locator('.nv-canvas-tab[aria-selected="true"]').first().evaluate(element => getComputedStyle(element).color)
    while (await page.locator('.nv-canvas-tab').count() > 0) {
      const tab = page.locator('.nv-canvas-tab').first()
      await tab.hover()
      await tab.locator('.nv-canvas-tabx').click()
    }
    expect(await page.getByRole('tab', { name: /起点/ }).count()).toBe(0)
    expect(await page.locator('.nv-canvas-strip').first().evaluate(element => getComputedStyle(element).borderBottomWidth)).toBe('0px')
    const firstTile = page.locator('.nv-desk-tile').first()
    await firstTile.waitFor({ timeout: 30_000 })
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared', material: 'clear', foreground: 'light' } })
    await expect.poll(() => firstTile.evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    expect(await firstTile.evaluate(element => getComputedStyle(element).color)).toBe('rgb(244, 247, 245)')
    const clearBox = await firstTile.boundingBox()
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared', material: 'frosted', foreground: 'light' } })
    await expect.poll(() => firstTile.evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).not.toBe('rgb(255, 255, 255)')
    await expect.poll(() => firstTile.evaluate(element => element.closest('.nv-leaf')?.getAttribute('data-noven-canvas-skin')), { timeout: 15_000 }).toBe('frosted')
    const tileState = await firstTile.evaluate(element => ({
      skin: element.closest('.nv-leaf')?.getAttribute('data-noven-canvas-skin'),
      backdrop: getComputedStyle(element).backdropFilter,
      matched: element.matches('.nv-leaf[data-noven-canvas-skin="frosted"] button'),
    }))
    expect(tileState).toMatchObject({ skin: 'frosted', matched: true })
    expect(tileState.backdrop).toContain('blur')
    expect(await firstTile.evaluate(element => getComputedStyle(element).color)).toBe('rgb(244, 247, 245)')
    const frostedBox = await firstTile.boundingBox()
    expect(frostedBox).toEqual(clearBox)
    await firstTile.click({ trial: true })
    const whiteCanvasControls = await page.locator('.nv-leaf button').evaluateAll(elements =>
      elements.filter(element => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)').length)
    expect(whiteCanvasControls).toBe(0)
    const canvasSelectToken = await page.locator('.nv-leaf').evaluate((root) => {
      const probe = document.createElement('span')
      probe.style.color = 'var(--nv-select)'
      root.appendChild(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })
    expect(selectedTabColor).toBe(canvasSelectToken)
    await page.screenshot({ path: join(SHOTS, 'wide-start-frosted.png'), fullPage: true })

    await appearance({ action: 'visual', view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.85 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('light')
    await expect.poll(() => page.locator('html').getAttribute('data-noven-conversation-foreground'), { timeout: 15_000 }).toBe('light')
    expect(await page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element).getPropertyValue('--nv-primary-text').trim())).toBe('#F4F7F5')
    const strongGlass = await page.locator('[data-conversation-scroll]').evaluate(element => getComputedStyle(element).backgroundColor)
    await appearance({ action: 'visual', backgroundVisibility: 0.95 })
    await expect.poll(async () => page.locator('[data-conversation-scroll]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).not.toBe(strongGlass)
    await appearance({ action: 'visual', view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 })

    const blocked = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'shared', background: { kind: 'default' } }),
    })
    expect(blocked.status).toBe(400)

    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'transparent' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toBe('none')
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('conversation.webp')
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'image', imagePath: '外观/session.webp' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('session.webp')
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('conversation.webp')

    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared', blur: 10 } })
    await expect.poll(() => page.locator('.nv-leaf').first().getAttribute('data-noven-canvas-blur'), { timeout: 15_000 }).toBe('')
    await expect.poll(async () => page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element, '::before').filter), { timeout: 15_000 }).toBe('blur(10px)')
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toBe('none')
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'transparent' } })
    await expect.poll(async () => page.locator('.nv-leaf').first().evaluate(element => ({
      image: getComputedStyle(element).backgroundImage,
      color: getComputedStyle(element).backgroundColor,
    })), { timeout: 15_000 }).toEqual({ image: 'none', color: 'rgba(0, 0, 0, 0)' })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('session.webp')

    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'shell', background: { kind: 'default' } })
    await expect.poll(() => page.locator('html[data-noven-conversation-appearance]').count(), { timeout: 15_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
