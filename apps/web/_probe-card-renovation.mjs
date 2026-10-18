/**
 * Card renovation probe: open the running 3080 instance in Playwright
 * Chromium, enter the desk, and capture the overview plus each widget page.
 * Run: node apps/web/_probe-card-renovation.mjs '<token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc'
const out = join(repo, '.playwright-mcp', 'card-renovation')
mkdirSync(out, { recursive: true })

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
page.on('console', message => {
  if (message.type() === 'error') console.log('console error:', message.text())
})

const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('shot', name)
}
const treeClick = async (name) => {
  const row = page.locator('.nv-tree-name', { hasText: name }).first()
  await row.waitFor({ timeout: 8000 })
  await row.click()
  await page.waitForTimeout(700)
}

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2000)
await page.locator('.nv-create-path').filter({ hasText: '手作' }).click()
await page.waitForTimeout(1600)
await shot('01-desk')

await treeClick('沈青梧')
await shot('02-character-overview')

await treeClick('基本信息')
await shot('03-character-form')

await treeClick('多形态')
await shot('04-character-gallery')

await treeClick('关系图')
await shot('05-character-relation')

await page.locator('.nv-tree-name',{ hasText: '玄天大陆 11' }).first().click()
await page.waitForTimeout(700)
await shot('06-world-overview')

await page.locator('.nv-tree-name',{ hasText: '势力名录' }).last().click()
await page.waitForTimeout(700)
await shot('07-factions')

await page.locator('.nv-tree-name',{ hasText: '地图' }).last().click()
await page.waitForTimeout(2000)
await shot('08-map')

await page.locator('.nv-tree-name',{ hasText: '时间线' }).last().click()
await page.waitForTimeout(700)
await shot('09-timeline')

await browser.close()
console.log('screenshots at', out)
