/**
 * Desk verification: enter the handcraft IDE, assert the 案头 renders, then
 * exercise each entry — preset world card (template modules), the built-in
 * manual tab, and the blank document tab. Screenshots each landing.
 * Run: node apps/web/_probe-desk.mjs '<full token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc-handcraft-desk'
const runDir = join(repo, '.playwright-mcp', 'desk')
mkdirSync(runDir, { recursive: true })

const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(String(error).slice(0, 200)))

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
const nav = page.getByRole('button', { name: '创作', exact: true })
await nav.waitFor()
// Let the session/workspace lists hydrate first: handcraft reuses the most
// recent Session, and a too-early click falls back to a project-less one.
await page.waitForTimeout(2500)
await nav.click()
await page.locator('.nv-create-page').waitFor()
const card = page.locator('.nv-create-path').filter({ hasText: '手作' })
await card.click()

// 1) 案头 renders in the canvas start tab.
await page.locator('.nv-desk').waitFor({ timeout: 30000 })
await page.waitForTimeout(600)
await page.screenshot({ path: join(runDir, '1-desk.png') })
const desk = await page.evaluate(() => ({
  lead: document.querySelector('.nv-desk-lead')?.textContent ?? null,
  labels: [...document.querySelectorAll('.nv-desk-label')].map(el => el.textContent),
  tiles: [...document.querySelectorAll('.nv-desk-tile .nv-desk-name')].map(el => el.textContent),
  start: document.querySelector('.nv-desk-start strong')?.textContent ?? null,
}))
console.log('desk:', JSON.stringify(desk))

// 2) 世界卡 preset → template card with skeleton modules.
await page.locator('.nv-desk-tile').filter({ hasText: '世界卡' }).click()
await page.locator('.nv-cardpage, .nv-canvas-cardbody').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(runDir, '2-world-card.png') })
const worldText = await page.evaluate(() => document.body.textContent?.includes('世界规则') === true)
console.log('world template modules present:', worldText)

// 3) Back to the desk tab, then 说明书.
await page.locator('.nv-canvas-tab, [class*="nv-canvas-tab"]').filter({ hasText: '起点' }).first().click().catch(() => {})
await page.waitForTimeout(500)
const manualTile = page.locator('.nv-desk-tile').filter({ hasText: '说明书' })
await manualTile.click()
await page.locator('.nv-manual').waitFor({ timeout: 15000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: join(runDir, '3-manual.png') })
const manual = await page.evaluate(() => document.querySelector('.nv-manual')?.textContent?.slice(0, 120) ?? null)
console.log('manual head:', JSON.stringify(manual))

// 4) Back to the desk, then 文稿 start → blank doc tab.
await page.locator('[class*="nv-canvas-tab"]').filter({ hasText: '起点' }).first().click().catch(() => {})
await page.waitForTimeout(500)
await page.locator('.nv-desk-start').click()
await page.locator('.nv-canvas-docbody, .nv-ed').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(runDir, '4-doc.png') })
const docTitle = await page.evaluate(() => document.querySelector('.nv-ed-title')?.textContent ?? document.querySelector('[class*="tab"][class*="on"]')?.textContent ?? null)
console.log('doc title:', JSON.stringify(docTitle))

console.log('page errors:', JSON.stringify(errors))
await context.close()
await browser.close()
