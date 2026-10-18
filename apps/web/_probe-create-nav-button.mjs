/**
 * Create-nav-button regression probe: with the create page active, the
 * sidebar「创作」row must stay mounted and visible. Reports the button's DOM
 * presence, bounding box, and the sidebar column's box before/after activation.
 * Run: node apps/web/_probe-create-nav-button.mjs '<full token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')

const repo = '/Users/noven/Documents/Codex/noven-pc'
const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()

const report = async (label) => {
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('nav[class*="panelList"] button')]
      .find(b => b.getAttribute('aria-label') === '创作')
    const rectOf = (el) => {
      if (el == null) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        ariaCurrent: el.getAttribute('aria-current') }
    }
    const sidebar = document.querySelector('div[class*="SidebarRoot"], [class*="sidebar"][class*="root"]')
    return {
      createBtn: rectOf(btn ?? null),
      createBtnInDom: btn != null,
      sidebar: rectOf(sidebar),
      bodyHasCreatePage: document.querySelector('.nv-create-page') != null,
    }
  })
  console.log(label, JSON.stringify(info, null, 1))
}

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
await page.getByRole('button', { name: '创作' }).waitFor()
await report('BEFORE:')
await page.getByRole('button', { name: '创作' }).click()
await page.locator('.nv-create-page').waitFor()
await page.waitForTimeout(400)
await report('AFTER:')
await browser.close()
