/**
 * Handcraft-scene verification: drive the real 3080 instance in Playwright
 * Chromium (the in-app browser skips View Transitions entirely), capture a
 * frame burst across the transition, and keep a video of the run.
 * Run: node apps/web/_probe-handcraft-scene.mjs '<full token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc'
const runDir = join(repo, '.playwright-mcp', 'handcraft-scene')
mkdirSync(join(runDir, 'videos'), { recursive: true })
mkdirSync(join(runDir, 'frames'), { recursive: true })

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const size = { width: 1440, height: 900 }
const context = await browser.newContext({ viewport: size, recordVideo: { dir: join(runDir, 'videos'), size }, locale: 'zh-CN' })
const page = await context.newPage()
const video = page.video()

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
await page.getByRole('button', { name: '创作' }).waitFor()
await page.getByRole('button', { name: '创作' }).click()
const card = page.locator('.nv-create-path').filter({ hasText: '手作' })
await card.waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: join(runDir, 'frames', '00-rest.png') })

await card.click()
const t0 = Date.now()
for (let i = 1; i <= 14; i += 1) {
  const target = i * 80
  const wait = target - (Date.now() - t0)
  if (wait > 0) await page.waitForTimeout(wait)
  await page.screenshot({ path: join(runDir, 'frames', `${String(i).padStart(2, '0')}-${target}ms.png`) })
}
await page.waitForTimeout(600)
await page.screenshot({ path: join(runDir, 'frames', '99-settled.png') })

await context.close()
await video.saveAs(join(runDir, 'handcraft-scene.webm'))
await browser.close()
console.log('frames + video at', runDir)
