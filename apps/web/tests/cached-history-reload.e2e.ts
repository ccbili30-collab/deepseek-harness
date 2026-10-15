/** Web e2e: a persisted transcript remains visible when only its history stream is blocked. */
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  launchWebScaffold, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, writeComposerDraft } from './support.ts'

const PROMPT = 'Reply with the single word LIGHTHOUSE and stop.'

describe('web e2e: cached history reload', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps the exact transcript read-only while session/follow is blocked, then yields to Host history', async () => {
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const settled = scaffold.whenTurnSettled()
    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, PROMPT)
    await input.press('Enter')
    await settled
    const transcript = page.locator('[data-chat-flow]').first()
    await expect.poll(() => transcript.innerText()).toContain('LIGHTHOUSE')
    const before = await transcript.innerText()
    let blockedFollow = 0
    let blockHistory = true
    await page.routeWebSocket('**/api/remote.mux', (route) => {
      const server = route.connectToServer()
      const blockedStreams = new Set<string>()
      route.onMessage((message) => {
        const frame = JSON.parse(String(message)) as { type: string; endpoint?: string; streamId: string }
        if (blockHistory && frame.type === 'open' && frame.endpoint === 'session/follow') {
          blockedFollow += 1
          blockedStreams.add(frame.streamId)
          return
        }
        if (!blockedStreams.has(frame.streamId)) server.send(message)
      })
    })
    await page.route('**/api/session/page', route => blockHistory ? route.abort() : route.continue())
    try {
      await page.reload({ waitUntil: 'load' })
      await page.locator('[data-history-preview]').waitFor({ timeout: 15_000 })
      expect(blockedFollow).toBeGreaterThan(0)
      const restored = (await transcript.innerText()).replace(/^Local conversation restored; syncing…\n?/, '')
      expect(restored).toBe(before)
      expect(await page.locator('[data-composer-input]').first().getAttribute('aria-disabled')).toBe('true')
      expect(await page.getByText('Into the Unknown', { exact: false }).count()).toBe(0)
    } finally {
      blockHistory = false
      await page.unroute('**/api/session/page')
      await page.reload({ waitUntil: 'load' })
      await expect.poll(() => page.locator('[data-history-preview]').count()).toBe(0)
      await expect.poll(() => transcript.innerText()).toBe(before)
    }
  }, 90_000)
})
