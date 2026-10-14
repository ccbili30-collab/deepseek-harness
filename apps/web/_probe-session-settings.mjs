// C5 会话设置验收：右栏「会话设置」页签渲染三组字段；设置随会话持久到
// .noven/session/<id>.json（刷新后留存）；自动整理开关按会话落 sidecar
// sessionPaused；旧 sim 文件不被误写。
// 用法：node _probe-session-settings.mjs <token>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TOKEN = process.argv[2]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctxBrowser = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctxBrowser.newPage()
p.setDefaultTimeout(8000)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []
const check = (ok, w) => { out.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'} ${w}`) }
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://127.0.0.1:3083/?token=${TOKEN}`)
await p.waitForSelector('.nv-tree-project', { timeout: 30000 })
await sleep(2500)

const sid = await p.evaluate(() => JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}').sessionId ?? null)
check(typeof sid === 'string' && sid.length > 4, `取到当前会话 id（${String(sid).slice(0, 10)}…）`)

// ── A. 右栏导轨有「会话设置」入口，点击后渲染三组与六个字段 ──
const railBtn = p.locator('[class*="featureRow"]').filter({ hasText: '会话设置' })
check(await railBtn.count() >= 1, '右栏导轨出现「会话设置」')
// 导轨在收起/停放态下 featureRow 不可见——直接派发 DOM click（React 事件照常触发）。
await p.locator('[class*="featureRow"]').filter({ hasText: '会话设置' }).first().evaluate(el => el.click())
await sleep(700)
await p.waitForSelector('.nv-sesset', { timeout: 8000 })
const groups = await p.locator('.nv-sesset-group h4').allInnerTexts()
check(groups.length === 3 && groups.includes('身份与回答') && groups.includes('使用的设定') && groups.includes('内容与工具'),
  `三组分区齐全（${groups.join(' / ')}）`)
check(await p.locator('.nv-sesset-field textarea').count() === 6, '六个文本字段')
check(await p.locator('.nv-sesset .nv-sesset-row').count() === 1, '自动整理开关一行')

// ── B. 字段改动落盘 .noven/session/<id>.json ──
const answer = p.locator('.nv-sesset-field').filter({ hasText: '回答身份' }).locator('textarea')
await answer.fill('测试身份·验收C5')
await sleep(1000)
const found = execSync(
  `find "$HOME/诺文" "/Users/noven/Documents/Deep other" -path "*/.noven/session/${sid}.json" -print -quit 2>/dev/null`,
  { encoding: 'utf8' },
).trim()
check(found.length > 0, '磁盘上找到 .noven/session/<sid>.json')
let parsed = null
if (found) {
  try { parsed = JSON.parse(readFileSync(found, 'utf8')) } catch { /* */ }
}
check(parsed?.answerIdentity === '测试身份·验收C5', '回答身份已落盘')

const legacyFound = execSync(
  `find "$HOME/诺文" "/Users/noven/Documents/Deep other" -path "*/.noven/sim/${sid}.json" -print -quit 2>/dev/null`,
  { encoding: 'utf8' },
).trim()
check(legacyFound.length === 0, '没有误写旧 sim 文件')

// ── C. 刷新页面后设置仍在（缓存态留存 + 真持久） ──
await p.reload()
await p.waitForSelector('.nv-tree-project', { timeout: 30000 })
await sleep(2500)
const sidAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}').sessionId ?? null)
check(sidAfter === sid, `刷新后当前会话不变（${String(sidAfter).slice(0, 10)}…）`)
await p.locator('[class*="featureRow"]').filter({ hasText: '会话设置' }).first().evaluate(el => el.click())
await p.waitForSelector('.nv-sesset', { timeout: 8000 })
await sleep(1200)
const retained = await p.locator('.nv-sesset-field').filter({ hasText: '回答身份' }).locator('textarea').inputValue()
check(retained === '测试身份·验收C5', `刷新后回答身份仍在（${retained || '空'}）`)

// ── D. 自动整理开关 = 会话级：本会话关掉，GET 回 paused=true ──
const sw = p.locator('.nv-sesset-row').first().locator('[role="switch"]')
if (await sw.getAttribute('aria-checked') !== 'false') await sw.click()
await sleep(800)
const sc = await p.evaluate(async s => {
  const r = await fetch(`/api/noven-sidecar?session=${encodeURIComponent(s)}`)
  return { status: r.status, body: await r.json() }
}, sid)
check(sc.status === 200 && sc.body.paused === true, `本会话自动整理已停（paused=${sc.body?.paused}）`)

// entities.json 里开关按会话 id 落 sessionPaused
// 实体库在 ~/.noven/ledger/<项目id>/sidecar/entities.json；按本会话 id 精确定位。
const entitiesFile = execSync(
  `grep -rl ${JSON.stringify(sid)} "$HOME/.noven/ledger" --include=entities.json 2>/dev/null | grep '/sidecar/entities.json' | head -1`,
  { encoding: 'utf8' },
).trim()
check(entitiesFile.length > 0, '找到记录本会话的 sidecar/entities.json')
let ent = null
try { ent = JSON.parse(readFileSync(entitiesFile, 'utf8')) } catch { /* */ }
check(ent?.sessionPaused?.[sid] === true, `entities.json sessionPaused 按会话记录（${entitiesFile}）`)
check(ent?.paused === undefined || ent?.paused !== true, '没有再写旧的 workspace 顶层 paused')

// ── E. 恢复开关 + 清空验收字段，留干净项目 ──
if (await sw.getAttribute('aria-checked') === 'false') await sw.click()
await sleep(700)
const sc2 = await p.evaluate(async s => (await (await fetch(`/api/noven-sidecar?session=${encodeURIComponent(s)}`)).json()).paused, sid)
check(sc2 === false, '恢复后本会话 paused=false')
const answer2 = p.locator('.nv-sesset-field').filter({ hasText: '回答身份' }).locator('textarea')
await answer2.fill('')
await sleep(1000)
let parsed2 = null
try { parsed2 = JSON.parse(readFileSync(found, 'utf8')) } catch { /* */ }
check(parsed2?.answerIdentity === '', '验收字段已清空')

check(errs.length === 0, `零 pageerror ${JSON.stringify(errs.slice(0, 3))}`)
await b.close()
console.log(out.every(Boolean) ? '\nALL PASS' : `\n${out.filter(x => !x).length} FAILURES`)
