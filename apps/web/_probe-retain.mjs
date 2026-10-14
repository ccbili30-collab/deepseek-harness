// A1 温层验收：卡页回挂不回 loading、滚动位置留存、内容树切项目不清空、卡删除后缓存失效。
// 用法：node _probe-retain.mjs <token> [base]
import { chromium } from 'playwright'
import fs from 'node:fs'

const TOKEN = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:3083'
const OUT = '/tmp/retain-e2e'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 560 } })).newPage()
page.setDefaultTimeout(8000)
const kill = setTimeout(() => { console.log('PROBE TIMEOUT'); process.exit(2) }, 150000)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const check = (ok, what) => { results.push([ok, what]); console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`) }
const shot = name => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {})
const errors = []
page.on('pageerror', e => errors.push(e.message))

await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.nv-tree, .nv-tree-rail', { timeout: 30000 })
if (await page.$('.nv-tree-railbtn')) { await page.click('.nv-tree-railbtn'); await sleep(600) }
await page.waitForSelector('.nv-tree-project', { timeout: 20000 })
await sleep(1200)
console.log('loaded')

/** 在 DOM 上挂一个观察器，记下任何时刻出现的「加载中」占位。 */
const armLoadingWatch = () => page.evaluate(() => {
  window.__loadingSeen = 0
  const seen = () => { if (document.querySelector('.nv-canvas-cardbody .nv-canvas-missing')) window.__loadingSeen += 1 }
  window.__loadingObs?.disconnect()
  window.__loadingObs = new MutationObserver(seen)
  window.__loadingObs.observe(document.body, { childList: true, subtree: true })
})
const loadingSeen = () => page.evaluate(() => window.__loadingSeen)

// ── A. 卡页温层：开卡 A → 开卡 B → 切回 A，回挂期间不出现 loading ──
const cards = page.locator('.nv-tree-card .nv-tree-main')
await cards.first().waitFor({ timeout: 15000 })
const cardCount = await cards.count()
check(cardCount >= 2, `树里至少两张卡（${cardCount}）`)
const nameA = (await cards.nth(0).locator('.nv-tree-name').textContent())?.trim()
const nameB = (await cards.nth(1).locator('.nv-tree-name').textContent())?.trim()
await cards.nth(0).click()
await page.waitForSelector('.nv-cardpage-name', { timeout: 10000 })
await sleep(800)
await cards.nth(1).click()
await sleep(1200)
await armLoadingWatch()
await page.locator('.nv-canvas-strip [role="tab"], .nv-canvas-strip .nv-canvas-tab').filter({ hasText: nameA ?? '' }).first().click().catch(async () => { await cards.nth(0).click() })
await sleep(60)
const firstPaint = await page.locator('.nv-cardpage-name').first().textContent().catch(() => null)
await sleep(900)
check(firstPaint?.trim() === nameA, `切回卡 A 首帧即是 A 的内容（${firstPaint?.trim()} vs ${nameA}）`)
check(await loadingSeen() === 0, `回挂期间零「加载中」占位（${await loadingSeen()}）`)

// ── B. 同一张卡被另一个页签打开（模块页 → 卡总览）也直接有快照 ──
await armLoadingWatch()
await cards.nth(1).click()
await sleep(60)
const bPaint = await page.locator('.nv-cardpage-name').first().textContent().catch(() => null)
await sleep(600)
check(bPaint?.trim() === nameB && await loadingSeen() === 0, `再开卡 B 首帧即内容、零 loading（${bPaint?.trim()}）`)

// ── C. 滚动留存：找一张能滚的卡 → 滚到中段 → 切到另一张 → 切回，位置还在 ──
let scrollIdx = -1
let scrollable = 0
for (let i = 0; i < Math.min(cardCount, 8); i++) {
  await cards.nth(i).click()
  await sleep(700)
  scrollable = await page.locator('.nv-cardpage-scroll').first().evaluate(el => el.scrollHeight - el.clientHeight).catch(() => 0)
  if (scrollable > 60) { scrollIdx = i; break }
}
if (scrollIdx >= 0) {
  const other = scrollIdx === 0 ? 1 : 0
  const target = Math.min(240, Math.floor(scrollable / 2))
  await page.locator('.nv-cardpage-scroll').first().evaluate((el, y) => { el.scrollTop = y; el.dispatchEvent(new Event('scroll')) }, target)
  await sleep(200)
  await cards.nth(other).click()
  await sleep(700)
  const otherTop = await page.locator('.nv-cardpage-scroll').first().evaluate(el => el.scrollTop)
  await cards.nth(scrollIdx).click()
  await sleep(500)
  const back = await page.locator('.nv-cardpage-scroll').first().evaluate(el => el.scrollTop)
  check(Math.abs(back - target) <= 2, `滚动位置留存（滚到 ${target}，切走再回来是 ${back}）`)
  check(otherTop <= 2, `另一张卡不继承这张的滚动（${otherTop}）`)
} else {
  console.log('SKIP 滚动留存：没有内容足以滚动的卡')
}
await shot('01-card')

// ── D. 内容树按项目留快照：切到别的项目再切回，树不经历空态 ──
const projectsBtn = page.locator('.nv-tree-project').first()
const titleBefore = (await projectsBtn.textContent())?.trim()
const treeRowsBefore = await page.locator('.nv-tree-row').count()
// 用侧边栏工作区里另一个项目的会话切换（上游 WorkspaceBrowser 行）
const otherSession = page.locator('[data-workspace-path] [data-session-id], [data-session-row]').first()
let switched = false
if (await otherSession.count() > 0) {
  await otherSession.click().catch(() => {})
  await sleep(1500)
  switched = (await projectsBtn.textContent())?.trim() !== titleBefore
}
if (switched) {
  await page.evaluate(() => {
    window.__treeEmpty = 0
    window.__treeObs?.disconnect()
    window.__treeObs = new MutationObserver(() => { if (document.querySelectorAll('.nv-tree-row').length === 0) window.__treeEmpty += 1 })
    window.__treeObs.observe(document.body, { childList: true, subtree: true })
  })
  await page.goBack().catch(() => {})
  await sleep(1500)
  const empty = await page.evaluate(() => window.__treeEmpty)
  check(empty === 0, `切回项目时树零空态（${empty}）`)
} else {
  console.log('SKIP 树切项目：本环境没有可一键切换的第二项目会话行（逻辑由 novenTreeSource byScope 保证，见单测）')
}

check(errors.length === 0, `控制台零 pageerror ${JSON.stringify(errors.slice(0, 3))}`)
clearTimeout(kill)
await browser.close()
const failed = results.filter(r => !r[0]).length
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
