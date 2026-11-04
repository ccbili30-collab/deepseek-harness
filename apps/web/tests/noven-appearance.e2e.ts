import { access, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createScaffoldWorkspace, launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { AQI, SCENE, sessionFixture } from './noven-inline-fixture.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const PLUGIN_ROOT = fileURLToPath(new URL('../../../plugins-noven', import.meta.url))
const PRODUCT_OVERLAY = fileURLToPath(new URL('../../desktop/noven/profile/cordis.patch.yml', import.meta.url))
const BROWSE_OVERLAY = fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url))
const ASSETS = fileURLToPath(new URL('../../../plugins-noven/noven-shell/assets', import.meta.url))
const AUDIO_MIME = 'audio/wav'
const SHOTS = join(tmpdir(), `noven-appearance-shots-${process.pid}`)
const BUNDLES = [
  'noven-study', 'noven-brand', 'noven-shell', 'noven-dock', 'noven-image',
  'noven-workbench', 'noven-draw-comic', 'noven-docs', 'noven-cards', 'noven-library', 'noven-skills', 'noven-explore',
] as const
const SESSION_ID = 'noven-appearance'
const ISOLATED_ENV = ['NOVEN_HOME', 'NOVEN_PROJECTS_ROOT', 'NOVEN_CHANNEL'] as const

function wavTone(frequency: number): Buffer {
  const sampleRate = 8000
  const samples = 800
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(index / sampleRate * frequency * Math.PI * 2) * 1000), 44 + index * 2)
  }
  return buffer
}

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

interface SoundtrackResponse {
  readonly kind: 'asset'
  readonly path: string
  readonly volume?: number
  readonly loop?: boolean
  readonly source?: 'global'
}

interface AppearanceResponse {
  readonly revision: number
  readonly globalRevision: number
  readonly global: {
    readonly unified?: {
      readonly kind: string
      readonly path?: string
      readonly focus?: string
      readonly dim?: number
      readonly blur?: number
      readonly material?: string
      readonly foreground?: string
    }
  }
  readonly workspace: {
    readonly shared?: { readonly path: string }
    readonly unified?: {
      readonly kind: string
      readonly focus?: string
      readonly dim?: number
      readonly blur?: number
      readonly material?: string
      readonly foreground?: string
    }
    readonly canvas?: {
      readonly kind: string
      readonly focus?: string
      readonly dim?: number
      readonly blur?: number
      readonly material?: string
      readonly foreground?: string
    }
    readonly conversation?: {
      readonly kind: string
      readonly focus?: string
      readonly dim?: number
      readonly blur?: number
      readonly material?: string
      readonly foreground?: string
    }
    readonly canvasTrack?: SoundtrackResponse
  }
  readonly file?: {
    readonly canvas?: { readonly kind: string; readonly path?: string }
    readonly track?: SoundtrackResponse
    readonly foreground?: string
  }
  readonly session: {
    readonly track?: SoundtrackResponse
    readonly foreground?: string
  }
  readonly resolved: {
    readonly shell: { readonly kind: string; readonly path?: string; readonly source?: 'global' } | null
    readonly canvas: { readonly kind: string; readonly path?: string; readonly source?: 'global' } | null
    readonly conversation: { readonly kind: string; readonly path?: string; readonly source?: 'global' } | null
    readonly assistantAvatar: { readonly path?: string } | null
    readonly conversationTrack: SoundtrackResponse | null
    readonly canvasTrack: SoundtrackResponse | null
    readonly conversationForeground: string
    readonly canvasForeground: string
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

async function resetCanvasLayout(): Promise<void> {
  await page.evaluate(() => { localStorage.removeItem('noven.canvas.tabs.v4') })
  await page.reload({ waitUntil: 'load' })
  await page.locator('.nv-mode-switch').first().waitFor({ timeout: 30_000 })
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
    agentPresets: { default: 'create' },
    extraInstallAnchors: ['noven-fmg', 'noven-ledger'].map(name => join(PLUGIN_ROOT, name, 'package.json')),
    extraOverlayPath: [PRODUCT_OVERLAY, BROWSE_OVERLAY],
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
  await writeFile(join(assets, '案头.wav'), wavTone(220))
  await writeFile(join(assets, '雨声.wav'), wavTone(330))
  await writeFile(join(assets, '林间.wav'), wavTone(440))
  await seedSession(scaffold, sessionFixture(), SESSION_ID, 'create', { createdAt: Date.UTC(2026, 0, 1) })
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
    expect(await page.locator('[data-sidebar-col]').evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none')
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('conversation.webp')
    expect(await page.locator('[data-conversation-root]').evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: getComputedStyle(element).overflow,
      border: getComputedStyle(element).borderTopColor,
    }))).toEqual({ radius: '12px', overflow: 'hidden', border: 'rgba(0, 0, 0, 0)' })
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
    await expect.poll(() => page.locator('.nv-leaf[data-noven-surface="desk"]').evaluate(element => ({
      color: getComputedStyle(element).backgroundColor,
      borderWidth: getComputedStyle(element).borderTopWidth,
      overflow: getComputedStyle(element).overflow,
    })), { timeout: 15_000 }).toEqual({ color: 'rgba(0, 0, 0, 0)', borderWidth: '0px', overflow: 'hidden' })
    await page.screenshot({ path: join(SHOTS, 'custom-start-desk.png'), fullPage: true })
    await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
    await page.locator('.nv-ed-title').waitFor({ timeout: 30_000 })
    await page.getByRole('tab', { name: /未命名文稿/ }).first().waitFor({ timeout: 30_000 })
    const filePath = '文稿/未命名文稿.md'
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('canvas.webp')
    expect(await page.locator('.nv-leaf').first().evaluate(element => ({
      borderWidth: getComputedStyle(element).borderTopWidth,
      clip: getComputedStyle(element).backgroundClip,
    }))).toEqual({ borderWidth: '0px', clip: 'border-box' })
    expect(await page.locator('.nv-canvas').first().evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
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
    expect(await page.locator('.nv-canvas').first().evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')
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
    await page.locator('[data-noven-canvas-switch]').click()
    await page.getByRole('menuitem', { name: '起点', exact: true }).click()
    await expect.poll(() => page.locator('.nv-leaf[data-noven-surface="desk"]').evaluate(element => ({
      image: getComputedStyle(element).backgroundImage,
      color: getComputedStyle(element).backgroundColor,
      borderWidth: getComputedStyle(element).borderTopWidth,
    })), { timeout: 15_000 }).toEqual({ image: 'none', color: 'rgb(255, 255, 255)', borderWidth: '0px' })
    await page.screenshot({ path: join(SHOTS, 'default-start-desk.png'), fullPage: true })
    await page.getByRole('tab', { name: /未命名文稿/ }).first().click()
    const expectPaperInsets = async (
      selector: string,
      expected: { top: number; right: number; bottom: number; left: number },
    ): Promise<void> => {
      const insets = await page.locator(selector).first().evaluate((element) => {
        const paper = element.getBoundingClientRect()
        const host = element.closest('[data-center-col], [data-rightbar-col]')!.getBoundingClientRect()
        return {
          top: paper.top - host.top,
          right: host.right - paper.right,
          bottom: host.bottom - paper.bottom,
          left: paper.left - host.left,
        }
      })
      expect(insets).toEqual(expected)
    }
    await expectPaperInsets('.nv-canvas', { top: 4, right: 4, bottom: 4, left: 4 })
    for (const selector of ['.nv-leaf', '[data-conversation-root]']) {
      await expect.poll(() => page.locator(selector).first().evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgb(255, 255, 255)')
    }
    for (const selector of ['.nv-canvas', '[data-conversation-root]']) {
      expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).borderTopWidth)).not.toBe('0px')
      expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')
    }
    const scene = await page.locator('[data-product-frame]').evaluate(element => ({
      color: getComputedStyle(element).backgroundColor,
      image: getComputedStyle(element).backgroundImage,
      radius: getComputedStyle(element).borderTopLeftRadius,
    }))
    expect(scene.color).not.toBe('rgba(0, 0, 0, 0)')
    expect(scene.image).toContain('linear-gradient')
    expect(scene.radius).toBe('16px')
    await appearance({ action: 'visual', view: 'dark', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('light')
    await appearance({ action: 'visual', view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 1 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('dark')
    const lightScene = await page.locator('[data-product-frame]').evaluate(element => ({
      color: getComputedStyle(element).backgroundColor,
      image: getComputedStyle(element).backgroundImage,
    }))
    expect(lightScene.color).not.toBe('rgb(255, 255, 255)')
    expect(lightScene.image).toContain('linear-gradient')
    await page.screenshot({ path: join(SHOTS, 'light-native-frame.png'), fullPage: true })
    await appearance({ action: 'visual', view: 'light', surface: 'auto', foreground: 'system', backgroundVisibility: 0.75 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBeNull()
    expect(await page.locator('[data-sidebar-col]').evaluate(element => ({
      color: getComputedStyle(element).backgroundColor,
      image: getComputedStyle(element).backgroundImage,
    }))).toEqual({ color: 'rgba(0, 0, 0, 0)', image: 'none' })
    expect(await page.locator('[data-integrated-brand]').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    for (const selector of ['[data-work]', '[data-sidebar-right-canvas-host]']) {
      expect(await page.locator(selector).first().evaluate(element => ({
        color: getComputedStyle(element).backgroundColor,
        borderWidth: getComputedStyle(element).borderLeftWidth,
      }))).toEqual({ color: 'rgba(0, 0, 0, 0)', borderWidth: '0px' })
    }
    for (const selector of ['[data-center-col]', '[data-rightbar-col]']) {
      expect(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    }
    expect(await page.locator('[data-center-col]').evaluate(element => getComputedStyle(element).borderLeftWidth)).toBe('0px')
    expect(await page.locator('.nv-leaf').first().evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      border: getComputedStyle(element).borderTopWidth,
      overflow: getComputedStyle(element).overflow,
    }))).toEqual({ radius: '0px', border: '0px', overflow: 'hidden' })
    expect(await page.locator('.nv-canvas').first().evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: getComputedStyle(element).overflow,
    }))).toEqual({ radius: '12px', overflow: 'hidden' })
    expect(await page.locator('[data-conversation-root]').evaluate(element => ({
      radius: getComputedStyle(element).borderTopLeftRadius,
      overflow: getComputedStyle(element).overflow,
    }))).toEqual({ radius: '12px', overflow: 'hidden' })
    await page.screenshot({ path: join(SHOTS, 'default-native-frame.png'), fullPage: true })
    await page.getByRole('button', { name: '切换到Agent', exact: true }).click()
    await page.locator('[data-conversation-root]').waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => document.querySelector('[data-animating]') === null)
    await page.waitForTimeout(600)
    await expectPaperInsets('[data-conversation-root]', { top: 4, right: 4, bottom: 4, left: 4 })
    const recoveryFold = page.locator('[data-conversation-root] [data-chrome-command="reveal-auxiliary"]:visible')
    if (await recoveryFold.count() > 0) {
      const peers = await recoveryFold.evaluate((button) => {
        const rect = button.getBoundingClientRect()
        const titleRow = button.closest('[class*="titleRow"]')!
        const utilities = [...titleRow.querySelectorAll('[class*="headerUtilities"] button')]
          .filter(element => element.getBoundingClientRect().width > 0)
        const overlaps = utilities.filter((element) => {
          const other = element.getBoundingClientRect()
          return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top
        }).length
        return {
          width: rect.width,
          height: rect.height,
          centerY: rect.y + rect.height / 2,
          peerY: utilities.map((element) => {
            const other = element.getBoundingClientRect()
            return other.y + other.height / 2
          }),
          overlaps,
        }
      })
      expect(peers.width).toBe(28)
      expect(peers.height).toBe(28)
      expect(peers.overlaps).toBe(0)
      expect(peers.peerY.every(value => Math.abs(value - peers.centerY) <= 1)).toBe(true)
      await recoveryFold.click()
    }
    await page.waitForFunction(() => document.querySelector('[data-work][data-animating]') === null)
    await expectPaperInsets('.nv-canvas', { top: 4, right: 4, bottom: 4, left: 0 })
    const columnGap = await page.evaluate(() => {
      const conversation = document.querySelector('[data-conversation-root]')!.getBoundingClientRect()
      const canvas = document.querySelector('.nv-canvas')!.getBoundingClientRect()
      return canvas.left - conversation.right
    })
    expect(columnGap).toBe(4)
    expect(await page.locator('[data-side-trailing]:visible').count()).toBe(0)
    const canvasStrip = page.locator('.nv-canvas-strip:visible').first()
    const directory = canvasStrip.locator('[data-workspace-side-directory]')
    await directory.waitFor({ timeout: 15_000 })
    const chromeY = async (selector: string): Promise<number> => canvasStrip.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.y + rect.height / 2
    })
    const toolsY = await chromeY('[data-noven-canvas-tools]')
    expect(await chromeY('[data-workspace-side-directory]')).toBe(toolsY)
    expect(await chromeY('[data-side-fold]')).toBe(toolsY)
    await page.screenshot({ path: join(SHOTS, 'default-conversation-border.png'), fullPage: true })
    expect(tripwire.pageErrors).toEqual([])
    console.log(`NOVEN_APPEARANCE_SHOTS=${SHOTS}`)
  }, 180_000)

  it('switches unified backgrounds, edits one scope, autosaves, and switches between defaults and presets', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-editor'))
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'transparent' } })
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

    expect(await page.getByLabel(/^(编辑对象|Edit target)$/, { exact: true }).count()).toBe(0)
    const backgroundScope = page.getByLabel(/^(生效范围|Apply to)$/, { exact: true })
    expect(await backgroundScope.inputValue()).toBe('workspace')
    const defaultChoice = page.getByRole('button', { name: /^(默认|Default)$/, exact: true })
    const addChoice = page.getByRole('button', { name: /^(添加自定义背景|Add custom background)$/, exact: true })
    expect(await defaultChoice.getAttribute('aria-pressed')).toBe('true')
    expect(await addChoice.getAttribute('aria-pressed')).toBe('false')
    await addChoice.click()
    await page.locator('.nv-ap-background-control input[type="file"][accept*="image"]').setInputFiles(join(scaffold.workspaceCwd, '外观/conversation.webp'))
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('/api/noven-appearance/asset')
    await expect.poll(async () => {
      const persisted = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
      return persisted.workspace.unified?.kind
    }, { timeout: 15_000 }).toBe('asset')
    expect(await defaultChoice.getAttribute('aria-pressed')).toBe('false')
    expect(await addChoice.getAttribute('aria-pressed')).toBe('true')
    expect(await addChoice.textContent()).toBe('+')
    expect(await addChoice.locator('img').count()).toBe(0)
    expect(await addChoice.evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none')

    await page.getByRole('button', { name: /^(分别设置|Customize scopes)$/ }).click()
    await page.locator('.nv-ap-target').selectOption('conversation')
    await page.getByLabel(/^(背景|Background)$/, { exact: true }).selectOption('custom')
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
    await expect.poll(async () => {
      const current = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
      return current.workspace.shared?.path
    }, { timeout: 15_000 }).toBe('外观/conversation.webp')
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

    await page.getByRole('button', { name: /^(收起分别设置|Hide scope controls)$/ }).click()
    await page.getByRole('button', { name: /^(保存为预设|Save as preset)$/ }).click()
    const preset = page.locator('.nv-ap-preset-list').getByRole('button', { name: /我的外观 1|My appearance 1/ })
    await preset.waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /恢复 Noven 默认|Restore Noven defaults/ }).click()
    await expect.poll(() => page.locator('html[data-noven-conversation-appearance]').count(), { timeout: 15_000 }).toBe(0)
    expect(await preset.count()).toBe(1)
    await preset.click()
    await expect.poll(async () => page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element, '::before').backgroundImage), { timeout: 15_000 }).toContain('/api/noven-appearance/asset')
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
    await page.setViewportSize({ width: 1440, height: 900 })
    await appearance({ action: 'shell', background: { kind: 'image', imagePath: '外观/shell.webp' } })
    await appearance({ action: 'visual', view: 'dark', surface: 'frosted', foreground: 'system', backgroundVisibility: 0.75 })
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-skin'), { timeout: 15_000 }).toBe('frosted')
    await expect.poll(() => page.locator('html').getAttribute('data-noven-shell-foreground'), { timeout: 15_000 }).toBe('light')
    await expect.poll(async () => page.locator('[data-integrated-brand]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    expect(await page.locator('[data-shell-topbar]').count()).toBe(0)
    await expect.poll(async () => page.locator('[data-sidebar-col]').evaluate(element => getComputedStyle(element).backgroundColor), { timeout: 15_000 }).toBe('rgba(0, 0, 0, 0)')
    for (const selector of ['[data-center-col]', '[data-rightbar-col]']) {
      expect(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    }
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
    if (await activeCanvasTab.locator('.nv-canvas-tabx').count() === 0) {
      await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
      await page.locator('.nv-ed-title').waitFor({ timeout: 30_000 })
    }
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
    const modeSwitch = page.locator('.nv-mode-switch-brand')
    const modeSwitchHidden = await modeSwitch.count() === 0 || await modeSwitch.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('.nv-canvas') !== null
    })
    expect(modeSwitchHidden).toBe(true)
    await page.screenshot({ path: join(SHOTS, 'canvas-window-fullscreen.png'), fullPage: true })
    await page.locator('.nv-canvas-fullscreentoggle').first().click()
    await expect.poll(() => page.locator('.nv-canvas[data-canvas-fullscreen]').count()).toBe(0)
    await modeSwitch.waitFor({ timeout: 15_000 })

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

    const heroSession = await scaffold.ctx.sessionController.create({
      sessionId: SessionId('noven-appearance-hero'), cwd: scaffold.workspaceCwd, agentPreset: 'create',
    })
    const heroPage = await newEnglishPage(browser)
    const heroConsole = watchConsole(heroPage)
    try {
      await heroPage.addInitScript((id) => {
        localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
      }, heroSession.sessionId)
      await heroPage.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await heroPage.locator('.nv-create-novel').waitFor({ timeout: 30_000 })
      const workspacePicker = heroPage.locator('[data-composer-input][aria-label="选择工作区"]')
      if (await workspacePicker.count() > 0) {
        await workspacePicker.click()
        await heroPage.getByRole('menuitem', { name: /外观验收/ }).click()
        await heroPage.locator('[data-composer-input][contenteditable="true"]').waitFor({ timeout: 15_000 })
      }
      const blankHeader = heroPage.locator('[data-slot="conversation.header"] > header')
      await expect.poll(() => blankHeader.evaluate(element => element.getBoundingClientRect().height), { timeout: 15_000 }).toBe(0)
      await expect.poll(() => heroPage.locator('.nv-create-novel').evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        backdrop: getComputedStyle(element).backdropFilter,
      })), { timeout: 15_000 }).toEqual({ background: 'rgba(0, 0, 0, 0)', backdrop: 'none' })
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
          icon: icon == null ? undefined : getComputedStyle(icon).color,
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
    expect(await page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('0px')
    expect(await page.locator('.nv-canvas').first().evaluate(element => getComputedStyle(element).borderTopLeftRadius)).toBe('12px')
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
    expect(await page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('conversation.webp')
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'image', imagePath: '外观/session.webp' } })
    await expect.poll(() => backgroundImage(page, '[data-conversation-root]'), { timeout: 15_000 }).toContain('session.webp')
    expect(await page.locator('[data-conversation-root]').evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
    await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain('conversation.webp')

    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'shared', blur: 10 } })
    await expect.poll(() => page.locator('.nv-leaf').first().getAttribute('data-noven-canvas-blur'), { timeout: 15_000 }).toBe('')
    await expect.poll(async () => page.locator('.nv-leaf').first().evaluate(element => getComputedStyle(element, '::before').filter), { timeout: 15_000 }).toBe('blur(10px)')
    expect(await page.locator('.nv-canvas').first().evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
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

  it('edits independent backgrounds through file tabs and preserves them across splits and reloads', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-tabs'))
    await resetCanvasLayout()
    const manual = page.getByRole('button', { name: '切换到手作', exact: true })
    if (await manual.count() > 0) await manual.click()
    const createDocument = async (): Promise<string> => {
      if (await page.locator('[data-noven-canvas-switch]').count() > 0) {
        await page.locator('[data-noven-canvas-switch]').first().click()
        await page.getByRole('menuitem', { name: '起点', exact: true }).click()
      }
      await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
      await page.locator('.nv-ed-title').waitFor({ timeout: 15_000 })
      const title = await page.locator('.nv-ed-title').textContent()
      if (title === null || title === '') throw new Error('created document has no title')
      return title
    }
    const firstTitle = await createDocument()
    const secondTitle = await createDocument()
    const firstPath = `文稿/${firstTitle}.md`
    const secondPath = `文稿/${secondTitle}.md`
    const fileBackground = async (filePath: string): Promise<string | undefined> => {
      const response = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}&file=${encodeURIComponent(filePath)}`)
      if (!response.ok) return undefined
      const view = await response.json() as AppearanceResponse
      return view.file?.canvas?.kind === 'asset' ? view.file.canvas.path : undefined
    }
    const expectUploadedBackground = async (filePath: string): Promise<void> => {
      await expect.poll(() => fileBackground(filePath), { timeout: 15_000 }).toContain('.noven/appearance/')
      const uploaded = await fileBackground(filePath)
      if (uploaded === undefined) throw new Error(`file background missing for ${filePath}`)
      await expect.poll(() => backgroundImage(page, '.nv-leaf'), { timeout: 15_000 }).toContain(encodeURIComponent(uploaded))
    }

    const backgroundButton = page.locator('[data-noven-canvas-tab-background]')
    await expect.poll(() => backgroundButton.count()).toBe(1)
    await backgroundButton.click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('背景', { exact: true }).selectOption('custom')
    await dialog.locator('.nv-ap-background-control input[type="file"][accept*="image"]').setInputFiles(join(scaffold.workspaceCwd, '外观/canvas.webp'))
    await expectUploadedBackground(secondPath)
    const secondImage = await backgroundImage(page, '.nv-leaf')
    const imageIdentity = (image: string): string => image.replace(/([?&])revision=\d+/, '')
    expect(await dialog.getByLabel('界面视图', { exact: true }).count()).toBe(0)
    expect(await dialog.getByLabel('编辑对象', { exact: true }).count()).toBe(0)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()

    await page.locator('.nv-canvas-tabtitle').filter({ hasText: firstTitle }).first().click()
    await backgroundButton.click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('背景', { exact: true }).selectOption('custom')
    await dialog.locator('.nv-ap-background-control input[type="file"][accept*="image"]').setInputFiles(join(scaffold.workspaceCwd, '外观/file.webp'))
    await expectUploadedBackground(firstPath)
    const firstImage = await backgroundImage(page, '.nv-leaf')
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()

    await page.locator('.nv-canvas-tabtitle').filter({ hasText: secondTitle }).click()
    await expect.poll(async () => imageIdentity(await backgroundImage(page, '.nv-leaf')), { timeout: 15_000 }).toBe(imageIdentity(secondImage))
    await page.evaluate(() => {
      const key = 'noven.canvas.tabs.v4'
      const raw = localStorage.getItem(key)
      if (raw === null) throw new Error('canvas persistence missing')
      const persisted = JSON.parse(raw) as { state?: Record<string, unknown> } & Record<string, unknown>
      const state = (persisted.state ?? persisted) as {
        layout: Record<string, { tabs: string[]; active?: string } | Record<string, unknown>>
        focus: Record<string, string>
      }
      for (const [scope, node] of Object.entries(state.layout)) {
        if (!('tabs' in node) || !Array.isArray(node.tabs) || node.tabs.length < 2) continue
        const first: unknown = node.tabs[0]
        const second: unknown = node.tabs[1]
        if (typeof first !== 'string' || typeof second !== 'string') continue
        state.layout[scope] = {
          id: 'appearance-split', dir: 'x', ratio: 0.5,
          a: { id: 'appearance-leaf-a', tabs: [first], active: first },
          b: { id: 'appearance-leaf-b', tabs: [second], active: second },
        }
        state.focus[scope] = 'appearance-leaf-a'
      }
      localStorage.setItem(key, JSON.stringify(persisted))
    })
    await page.reload({ waitUntil: 'load' })
    await page.locator('.nv-canvas').first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('.nv-leaf').count(), { timeout: 15_000 }).toBe(2)
    const readSplitImages = (): Promise<string[]> => page.locator('.nv-leaf').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundImage))
    await expect.poll(async () => (await readSplitImages()).map(imageIdentity), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([imageIdentity(secondImage), imageIdentity(firstImage)]))
    const splitImages = await readSplitImages()
    expect(await page.locator('.nv-leaf').evaluateAll(elements => elements.map(element => getComputedStyle(element).borderTopWidth)))
      .toEqual(splitImages.map(() => '0px'))
    expect(await page.locator('.nv-canvas').first().evaluate(element => getComputedStyle(element).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)')

    await page.reload({ waitUntil: 'load' })
    await page.locator('.nv-canvas').first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('.nv-leaf').count(), { timeout: 15_000 }).toBe(2)
    await expect.poll(async () => (await readSplitImages()).map(imageIdentity), { timeout: 15_000 }).toEqual(splitImages.map(imageIdentity))
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)

  it('inherits global backgrounds across workspaces while preserving local white and object exceptions', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-appearance-global'))
    await appearance({ action: 'unified', background: { kind: 'default' } })
    await appearance({ action: 'shell', background: { kind: 'default' } })
    await appearance({ action: 'canvas', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'conversation', scope: 'workspace', background: { kind: 'default' } })
    await appearance({ action: 'canvas', scope: 'file', filePath: '外观说明.md', background: { kind: 'image', imagePath: '外观/file.webp' } })
    await appearance({ action: 'conversation', scope: 'session', background: { kind: 'image', imagePath: '外观/session.webp' } })
    const switchAgent = page.getByRole('button', { name: '切换到Agent', exact: true })
    if (await switchAgent.count() > 0) await switchAgent.click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: /^通用设置$|^General settings$/ }).click()
    await page.getByRole('button', { name: /^外观$|^Appearance$/ }).click()
    await page.locator('.nv-ap-preview').waitFor({ timeout: 30_000 })
    const backgroundScope = page.getByLabel(/^(生效范围|Apply to)$/, { exact: true })
    await backgroundScope.selectOption('global')
    expect(await page.getByRole('button', { name: /^(保存为预设|Save as preset)$/ }).count()).toBe(0)
    const defaultChoice = page.getByRole('button', { name: /^(默认|Default)$/, exact: true })
    const addChoice = page.getByRole('button', { name: /^(添加自定义背景|Add custom background)$/, exact: true })
    await addChoice.click()
    await page.locator('.nv-ap-background-control input[type="file"][accept*="image"]').setInputFiles(join(scaffold.workspaceCwd, '外观/shell.webp'))
    await expect.poll(async () => {
      const current = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
      return current.globalRevision
    }, { timeout: 15_000 }).toBe(1)
    const globalView = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
    const globalAssetId = globalView.global.unified?.path
    if (globalAssetId === undefined) throw new Error('global asset id missing')
    expect(globalAssetId).not.toContain('/')
    expect(globalAssetId).not.toContain('\\')
    expect(globalView.resolved.shell).toMatchObject({ kind: 'asset', source: 'global', path: globalAssetId })
    expect(globalView.resolved.canvas).toMatchObject({ kind: 'asset', source: 'global', path: globalAssetId })
    expect(globalView.resolved.conversation).toMatchObject({ kind: 'asset', path: '外观/session.webp' })
    await expect.poll(() => backgroundImage(page, '[data-product-frame]'), { timeout: 15_000 }).toContain('/api/noven-appearance/global-asset')

    await page.getByRole('button', { name: /^(分别设置|Customize scopes)$/ }).click()
    expect(await page.locator('.nv-ap-target').count()).toBe(0)
    expect(await page.getByRole('button', { name: /^(保存为预设|Save as preset)$/ }).count()).toBe(0)
    await page.getByRole('button', { name: /^(收起分别设置|Hide scope controls)$/ }).click()
    await backgroundScope.selectOption('workspace')
    await defaultChoice.click()
    await expect.poll(async () => {
      const current = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
      return current.resolved.shell
    }, { timeout: 15_000 }).toBeNull()
    const whiteView = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
    expect(whiteView.workspace.unified).toEqual({ kind: 'builtin' })
    expect(whiteView.globalRevision).toBe(1)
    expect(whiteView.resolved.canvas).toBeNull()
    expect(whiteView.resolved.conversation).toMatchObject({ kind: 'asset', path: '外观/session.webp' })
    const whiteFileView = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}&file=${encodeURIComponent('外观说明.md')}`)).json() as AppearanceResponse
    expect(whiteFileView.resolved.canvas).toMatchObject({ kind: 'asset', path: '外观/file.webp' })

    const other = join(isolatedRoot, 'global-second')
    await mkdir(other, { recursive: true })
    await scaffold.ctx.workspaceRegistry.create(other, '第二工作区')
    const secondSession = await scaffold.ctx.sessionController.create({ sessionId: SessionId('noven-appearance-global-b'), cwd: other, agentPreset: 'create' })
    const secondPage = await newEnglishPage(browser)
    const secondConsole = watchConsole(secondPage)
    try {
      await secondPage.addInitScript((id) => {
        localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: id }))
      }, secondSession.sessionId)
      await secondPage.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await secondPage.locator('.nv-mode-switch').first().waitFor({ timeout: 60_000 })
      await expect.poll(() => backgroundImage(secondPage, '[data-product-frame]'), { timeout: 15_000 }).toContain('/api/noven-appearance/global-asset')
      const secondView = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(secondSession.sessionId)}`)).json() as AppearanceResponse
      expect(secondView.revision).toBe(0)
      expect(secondView.globalRevision).toBe(1)
      expect(secondView.resolved.shell).toMatchObject({ kind: 'asset', source: 'global', path: globalAssetId })
      expect(secondView.resolved.canvas).toMatchObject({ kind: 'asset', source: 'global', path: globalAssetId })
      expect(secondView.resolved.conversation).toMatchObject({ kind: 'asset', source: 'global', path: globalAssetId })
      const assetResponse = await scaffold.hostFetch(`/api/noven-appearance/global-asset?session=${encodeURIComponent(secondSession.sessionId)}&id=${encodeURIComponent(globalAssetId)}`)
      expect(assetResponse.status).toBe(200)
      expect(assetResponse.headers.get('content-type')).toBe('image/png')
      const invalid = await scaffold.hostFetch(`/api/noven-appearance/global-asset?session=${encodeURIComponent(secondSession.sessionId)}&id=${encodeURIComponent('../outside.png')}`)
      expect(invalid.status).toBe(400)
      await expect(access(join(other, '.noven', 'appearance', globalAssetId))).rejects.toThrow()

      await page.getByRole('button', { name: /^(跟随全部工作区|Follow all workspaces)$/, exact: true }).click()
      await expect.poll(async () => {
        const current = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
        return current.resolved.shell?.source
      }, { timeout: 15_000 }).toBe('global')
      const stale = await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'global_unified', background: { kind: 'default' }, expectedGlobalRevision: 0 }),
      })
      expect(stale.status).toBe(409)

      await backgroundScope.selectOption('global')
      await defaultChoice.click()
      await expect.poll(async () => {
        const current = await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
        return current.globalRevision
      }, { timeout: 15_000 }).toBe(2)
      await expect.poll(() => backgroundImage(secondPage, '[data-product-frame]'), { timeout: 15_000 }).toContain('linear-gradient')
      expect(secondConsole.pageErrors).toEqual([])
    } finally {
      await secondPage.close()
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)

  it('binds soundtracks and independent foregrounds with one central audio owner', async () => {
    onTestFailed(() => saveFailureShot(page, 'noven-soundtrack'))
    if (await page.getByRole('dialog').count() > 0) {
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog').count()).toBe(0)
    }
    await resetCanvasLayout()
    await appearance({ action: 'reset' })
    const requestedAudio: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('audio-asset')) requestedAudio.push(request.url())
    })
    const currentView = async (): Promise<AppearanceResponse> => await (await scaffold.hostFetch(`/api/noven-appearance?session=${encodeURIComponent(SESSION_ID)}`)).json() as AppearanceResponse
    const audioRequests = async (): Promise<string[]> => requestedAudio
    const expectAudio = async (path: string): Promise<void> => {
      await expect.poll(async () => (await audioRequests()).some(name => decodeURIComponent(name).includes(path)),
        { timeout: 15_000 }).toBe(true)
    }
    const createDocument = async (): Promise<string> => {
      if (await page.locator('[data-noven-canvas-switch]').count() > 0) {
        await page.locator('[data-noven-canvas-switch]').first().click()
        await page.getByRole('menuitem', { name: '起点', exact: true }).click()
      }
      await page.getByRole('button', { name: /文稿 从一页白纸开始/ }).click()
      const editorTitle = page.locator('.nv-leaf').first().locator('.nv-ed-title:visible')
      await editorTitle.waitFor({ timeout: 30_000 })
      const title = await editorTitle.textContent()
      if (title === null || title === '') throw new Error('document title missing')
      return title
    }

    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /^(外观|Appearance)$/ }).click()
    await page.getByRole('button', { name: /^(分别设置|Customize scopes)$/ }).click()
    await page.getByLabel(/^(编辑对象|Edit target)$/, { exact: true }).selectOption('session')
    const sessionControls = page.locator('.nv-ap-track-controls[data-track-scope="session"]')
    await sessionControls.locator('input[type="file"]').setInputFiles(join(scaffold.workspaceCwd, '外观/雨声.wav'))
    await expect.poll(async () => (await currentView()).session.track?.path, { timeout: 15_000 }).toContain('.noven/appearance/')
    const uploadedTrack = (await currentView()).session.track!
    expect(uploadedTrack.kind).toBe('asset')
    const audioResponse = await scaffold.hostFetch(`/api/noven-appearance/audio-asset?session=${encodeURIComponent(SESSION_ID)}&path=${encodeURIComponent(uploadedTrack.path)}`)
    expect(audioResponse.status).toBe(200)
    expect(audioResponse.headers.get('content-type')).toBe(AUDIO_MIME)
    const audioHead = await scaffold.hostFetch(`/api/noven-appearance/audio-asset?session=${encodeURIComponent(SESSION_ID)}&path=${encodeURIComponent(uploadedTrack.path)}`, { method: 'HEAD' })
    expect(audioHead.status).toBe(200)
    expect(await audioHead.text()).toBe('')
    await sessionControls.locator('input[type="range"]').evaluate((element) => {
      const input = element as HTMLInputElement
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await sessionControls.locator('input[type="checkbox"]').uncheck()
    await sessionControls.locator('select').selectOption('invert')
    await expect.poll(async () => (await currentView()).session.track?.volume, { timeout: 15_000 }).toBe(0)
    expect((await currentView()).session.track?.loop).toBe(false)
    await expect.poll(async () => (await currentView()).session.foreground, { timeout: 15_000 }).toBe('invert')
    await page.keyboard.press('Escape')
    const switchAgent = page.getByRole('button', { name: '切换到Agent', exact: true })
    if (await switchAgent.count() > 0) await switchAgent.click()

    const projectTitle = page.locator('.nv-hchip[data-has-track]')
    await expect.poll(() => projectTitle.count(), { timeout: 15_000 }).toBe(1)
    await expect.poll(() => projectTitle.isVisible(), { timeout: 15_000 }).toBe(true)
    await projectTitle.hover()
    await expect.poll(() => projectTitle.locator('.nv-title-play').isVisible()).toBe(true)
    await projectTitle.click()
    await expect.poll(() => projectTitle.getAttribute('data-playing'), { timeout: 15_000 }).toBe('true')
    await expectAudio(uploadedTrack.path)
    await projectTitle.click()
    await expect.poll(() => projectTitle.getAttribute('data-playing'), { timeout: 15_000 }).toBeNull()
    expect(await page.locator('[data-conversation-root]').evaluate(element => element.style.getPropertyValue('--nv-primary-text'))).toBe('#000000')

    await appearance({ action: 'track', scope: 'workspace', track: { kind: 'audio', audioPath: '外观/案头.wav', volume: 0.2, loop: false } })
    await page.getByRole('button', { name: '切换到手作', exact: true }).click()
    const firstTitle = await createDocument()
    const firstPath = `文稿/${firstTitle}.md`
    await appearance({ action: 'track', scope: 'file', filePath: firstPath, track: { kind: 'audio', audioPath: '外观/林间.wav' }, foreground: 'dark' })
    const firstTab = page.locator('.nv-canvas-tabtitle').filter({ hasText: firstTitle })
    await expect.poll(() => firstTab.getAttribute('data-has-track'), { timeout: 15_000 }).toBe('true')
    const firstLeafSelectedTab = page.locator('.nv-leaf').first().locator('.nv-canvas-tab[aria-selected="true"]')
    await firstLeafSelectedTab.hover()
    await expect.poll(() => firstTab.locator('.nv-title-play').isVisible()).toBe(true)
    await expect.poll(() => firstLeafSelectedTab.locator('.nv-canvas-tabx').evaluate(element => getComputedStyle(element).opacity)).toBe('1')
    await firstTab.click()
    await expect.poll(() => firstTab.getAttribute('data-playing'), { timeout: 15_000 }).toBe('true')
    await expectAudio((await currentView()).resolved.canvasTrack!.path)
    await expect.poll(() => page.locator('.nv-leaf').first().evaluate(element => element.style.getPropertyValue('--nv-primary-text')), { timeout: 15_000 }).toBe('#16181a')
    await appearance({ action: 'track', scope: 'file', filePath: firstPath, foreground: 'invert' })
    await expect.poll(() => page.locator('.nv-leaf').first().evaluate(element => element.style.getPropertyValue('--nv-primary-text')), { timeout: 15_000 }).toBe('#000000')

    const secondTitle = await createDocument()
    const secondPath = `文稿/${secondTitle}.md`
    await appearance({ action: 'track', scope: 'file', filePath: secondPath, track: { kind: 'audio', audioPath: '外观/雨声.wav' } })
    await page.evaluate(() => {
      const key = 'noven.canvas.tabs.v4'
      const raw = localStorage.getItem(key)
      if (raw === null) throw new Error('canvas persistence missing')
      const persisted = JSON.parse(raw) as { state?: Record<string, unknown> } & Record<string, unknown>
      const state = (persisted.state ?? persisted) as {
        layout: Record<string, { tabs: unknown; active?: unknown } | Record<string, unknown>>
        focus: Record<string, string>
      }
      for (const [scope, node] of Object.entries(state.layout)) {
        if (!('tabs' in node) || !Array.isArray(node.tabs) || node.tabs.length < 2) continue
        const tabs: readonly unknown[] = node.tabs
        const [first, second] = tabs
        if (typeof first !== 'string' || typeof second !== 'string') continue
        state.layout[scope] = {
          id: 'soundtrack-split', dir: 'x', ratio: 0.5,
          a: { id: 'soundtrack-leaf-a', tabs: [first], active: first },
          b: { id: 'soundtrack-leaf-b', tabs: [second], active: second },
        }
        state.focus[scope] = 'soundtrack-leaf-a'
      }
      localStorage.setItem(key, JSON.stringify(persisted))
    })
    await page.reload({ waitUntil: 'load' })
    await page.locator('.nv-canvas').first().waitFor({ timeout: 30_000 })
    await expect.poll(() => page.locator('.nv-leaf').count(), { timeout: 15_000 }).toBe(2)
    expect(await page.locator('.nv-playable-title[data-playing="true"]').count()).toBe(0)
    const firstLeafTab = page.locator('.nv-leaf').nth(0).locator('.nv-canvas-tabtitle').first()
    const secondLeafTab = page.locator('.nv-leaf').nth(1).locator('.nv-canvas-tabtitle').first()
    await firstLeafTab.click()
    await expect.poll(() => firstLeafTab.getAttribute('data-playing'), { timeout: 15_000 }).toBe('true')
    expect(await secondLeafTab.getAttribute('data-playing')).toBeNull()
    await secondLeafTab.click()
    await expect.poll(() => secondLeafTab.getAttribute('data-playing'), { timeout: 15_000 }).toBe('true')
    expect(await firstLeafTab.getAttribute('data-playing')).toBeNull()
    await secondLeafTab.click()
    await expect.poll(() => secondLeafTab.getAttribute('data-playing'), { timeout: 15_000 }).toBeNull()
    await appearance({ action: 'track', scope: 'session', track: { kind: 'default' } })
    await expect.poll(() => secondLeafTab.getAttribute('data-playing'), { timeout: 15_000 }).toBeNull()
    await appearance({ action: 'track', scope: 'workspace', track: { kind: 'default' } })
    await appearance({ action: 'track', scope: 'file', filePath: secondPath, track: { kind: 'default' } })
    await expect.poll(() => secondLeafTab.getAttribute('data-has-track'), { timeout: 15_000 }).toBeNull()
    await appearance({ action: 'reset' })
    expect(tripwire.pageErrors).toEqual([])
  }, 180_000)
})
