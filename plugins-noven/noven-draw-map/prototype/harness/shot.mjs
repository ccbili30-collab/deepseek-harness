// 截图 harness：本机 Chrome + playwright。node shot.mjs [url-suffix] [name]
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(
  '/Users/noven/Documents/Codex/noven-pc/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.js')

const suffix = process.argv[2] ?? ''
const name = process.argv[3] ?? 'shot'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
page.on('console', m => console.log('[console]', m.type(), m.text()))
page.on('pageerror', e => console.log('[pageerror]', e.message))
await page.goto(`http://localhost:8572/index.html${suffix}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${name}.png` })
await browser.close()
console.log('saved', `${name}.png`)
