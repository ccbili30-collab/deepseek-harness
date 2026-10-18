/**
 * Freeze-frame probe for the handcraft scene: click 手作, catch the running
 * View Transition animations, pause them at chosen timestamps, and screenshot
 * each frozen frame. Verifies the seed lift and ritual-page exit actually
 * play (they were silently absent while the commit ran before the capture).
 * Run: node apps/web/_probe-handcraft-freeze.mjs '<full token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc'
const runDir = join(repo, '.playwright-mcp', 'handcraft-scene')
mkdirSync(join(runDir, 'frames'), { recursive: true })

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
const createNav = page.getByRole('button', { name: '创作', exact: true })
await createNav.waitFor()
await page.waitForTimeout(1500)
await createNav.click()
const card = page.locator('.nv-create-path').filter({ hasText: '手作' })
await card.waitFor()
await page.waitForTimeout(400)

await page.evaluate(() => {
  window.__freeze = { seen: 0, names: [] }
  const orig = document.startViewTransition.bind(document)
  document.startViewTransition = (update) => {
    const t = orig(update)
    const grab = () => {
      const anims = document.getAnimations()
      window.__freeze.seen = anims.length
      window.__freeze.names = anims.map(a => a.animationName)
      if (anims.length > 0) { window.__freeze.anims = anims; return }
      setTimeout(grab, 10)
    }
    t.ready.then(grab, () => { window.__freeze.seen = -1 })
    return t
  }
})
await card.click()
await page.waitForFunction(() => (window.__freeze?.seen ?? 0) > 0, undefined, { timeout: 8000 })

for (const [label, at] of [['10-seed', 150], ['20-land', 300]]) {
  await page.evaluate((ms) => {
    for (const a of window.__freeze.anims) { a.pause(); a.currentTime = ms }
  }, at)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(runDir, 'frames', `freeze-${label}.png`) })
}
await page.evaluate(() => { for (const a of window.__freeze.anims) a.play() })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(runDir, 'frames', 'freeze-99-settled.png') })
console.log('animation names:', JSON.stringify(await page.evaluate(() => window.__freeze.names)))
await context.close()
await browser.close()
