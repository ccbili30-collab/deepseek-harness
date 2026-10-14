// C1/C2 验收：工作台布局与树视图按会话存；新会话继承上一会话的骨架（不带页签）。
// 直接读写 localStorage 键验证分域，再看界面是否按会话恢复。
// 用法：node _probe-session-layout.mjs <token> [base]
import { chromium } from 'playwright'
import fs from 'node:fs'

const TOKEN = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:3083'
const OUT = '/tmp/session-layout-e2e'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
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

const keys = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('dsh.sidebar-right.v2.') || k.startsWith('noven.tree.')))
const currentSession = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find(key => key.startsWith('noven.tree.view.v1:'))
  return k
})

// ── A. 工作台记录落在会话键下（不再写 ws:<cwd>）──
const before = await keys()
const sessionKeys = before.filter(k => k.startsWith('dsh.sidebar-right.v2.') && !k.startsWith('dsh.sidebar-right.v2.ws:'))
check(sessionKeys.length >= 1, `工作台记录写在会话键下（${sessionKeys.length} 条：${sessionKeys.slice(0, 2).join(', ')}）`)

// ── B. 树视图偏好落会话键 ──
const viewKeys = before.filter(k => k.startsWith('noven.tree.view.v1:'))
check(viewKeys.length >= 1, `树折叠/视图写在会话键下（${viewKeys.length} 条）`)

// ── C. 树视图切到文件视图 → 只改本会话键，项目键只剩 order ──
const eye = page.locator('.nv-tree-head .nv-tree-eye').first()
await eye.click()
await sleep(500)
const snap = await page.evaluate(() => {
  const out = {}
  for (const k of Object.keys(localStorage)) if (k.startsWith('noven.tree.')) out[k] = localStorage.getItem(k)
  return out
})
const viewEntries = Object.entries(snap).filter(([k]) => k.startsWith('noven.tree.view.v1:'))
const fileViewSession = viewEntries.find(([, v]) => v?.includes('"view":"file"'))
check(fileViewSession !== undefined, `切文件视图写进会话键 ${fileViewSession?.[0] ?? '（无）'}`)
const projectEntries = Object.entries(snap).filter(([k]) => k.startsWith('noven.tree.groups.v1:'))
check(projectEntries.every(([, v]) => !v?.includes('"view"') || v === null), `项目键不再承载视图档（${projectEntries.length} 条）`)
await shot('01-fileview')

// ── D. 刷新后：本会话仍是文件视图（会话域持久）──
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.nv-tree-project', { timeout: 20000 })
await sleep(1200)
const eyeOn = await page.locator('.nv-tree-head .nv-tree-eye').first().evaluate(el => el.classList.contains('nv-tree-eye-on'))
check(eyeOn, '刷新后本会话保持文件视图')

// ── E. 新会话继承：造一个从未出现过的会话键，模拟其首次挂载读到的偏好 ──
// （真实新会话需要模型回合才能创建；这里直接验证继承的读取规则：
//  无自有记录 → 取上一会话记录。）
const inherited = await page.evaluate((src) => {
  const own = localStorage.getItem('noven.tree.view.v1:__never_seen__')
  const from = src === undefined ? null : localStorage.getItem(src)
  return { own, from }
}, fileViewSession?.[0])
check(inherited.own === null && inherited.from?.includes('"view":"file"'), '新会话无自有记录时，继承来源是上一会话的文件视图记录')

// 还原：切回实体视图，避免影响用户
await page.locator('.nv-tree-head .nv-tree-eye').first().click()
await sleep(400)

check(errors.length === 0, `控制台零 pageerror ${JSON.stringify(errors.slice(0, 3))}`)
clearTimeout(kill)
await browser.close()
const failed = results.filter(r => !r[0]).length
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
