/**
 * Conversation-morph scene probe: drive the real instance in Playwright
 * Chromium (the in-app browser skips View Transitions entirely), let the app
 * restore its last session so the create page's blank host lands bound to that
 * workspace, send a ping from the hero composer, and capture a frame burst
 * across the morph. Also asserts the OLD hero composer carried the morph name
 * at capture time — without it the scene degenerates to a plain crossfade.
 * Run: node apps/web/_probe-conversation-scene.mjs '<full token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc'
const runDir = join(repo, '.playwright-mcp', 'conversation-scene')
mkdirSync(join(runDir, 'frames'), { recursive: true })

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
const createNav = page.getByRole('button', { name: '创作', exact: true })
await createNav.waitFor()
// Wait out the startup restore so the ensured blank host inherits the
// restored session's workspace (an unbound host's hero stays disarmed).
await page.waitForTimeout(1500)
await createNav.click()
await page.locator('.nv-create-page').waitFor()

// Instrument the next View Transition: timings plus whether the morph's old
// anchors (hero composer + ritual page) were named at capture time.
await page.evaluate(() => {
  window.__probe = { start: 0, updateDone: null, ready: null, finished: null, oldComposerNamed: null, pageNamed: null }
  const orig = document.startViewTransition.bind(document)
  document.startViewTransition = (update) => {
    window.__probe.start = performance.now()
    window.__probe.oldComposerNamed = document.querySelector('.nv-create-hero [data-composer-card]')?.style.viewTransitionName ?? null
    window.__probe.pageNamed = document.querySelector('.nv-create-page')?.style.viewTransitionName ?? null
    const t = orig(async () => {
      await update()
      window.__probe.updateDone = Math.round(performance.now() - window.__probe.start)
    })
    t.ready.then(() => { window.__probe.ready = Math.round(performance.now() - window.__probe.start) },
      () => { window.__probe.ready = 'rejected' })
    t.finished.then(() => { window.__probe.finished = Math.round(performance.now() - window.__probe.start) },
      () => { window.__probe.finished = 'rejected' })
    return t
  }
})

const editor = page.locator('.nv-create-hero [data-composer-card] [contenteditable="true"]')
await editor.waitFor()
await editor.click()
await page.keyboard.type('ping')
await page.screenshot({ path: join(runDir, 'frames', '00-typed.png') })
await page.keyboard.press('Enter')

const t0 = Date.now()
for (let i = 1; i <= 12; i += 1) {
  const target = i * 80
  const wait = target - (Date.now() - t0)
  if (wait > 0) await page.waitForTimeout(wait)
  await page.screenshot({ path: join(runDir, 'frames', `${String(i).padStart(2, '0')}-${target}ms.png`) })
}
await page.waitForTimeout(900)
await page.screenshot({ path: join(runDir, 'frames', '99-settled.png') })

const probe = await page.evaluate(() => window.__probe)
const landed = await page.evaluate(() => ({
  conversationRegion: !!document.querySelector('[data-conversation-region="chat"]'),
  composerMounted: !!document.querySelector('[data-composer-card]'),
  stillCreatePage: !!document.querySelector('.nv-create-page'),
}))
console.log(JSON.stringify({ probe, landed }))
console.log('frames at', join(runDir, 'frames'))

await context.close()
await browser.close()
