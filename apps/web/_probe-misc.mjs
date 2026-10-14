// B1 杂项项目验收：项目列表含杂项、不能移出/改名、无项目新建落杂项。
import { chromium } from 'playwright'
const TOKEN = process.argv[2]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.setDefaultTimeout(8000)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []; const check = (ok, w) => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${w}`) }
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://127.0.0.1:3083/?token=${TOKEN}`)
await p.waitForSelector('.nv-tree-project', { timeout: 30000 }); await sleep(2500)

// ── A. 创作库项目列表（/api/noven-projects）含杂项且带 misc 标记 ──
const projects = await p.evaluate(async () => {
  const r = await fetch('/api/noven-projects'); const d = await r.json()
  return d.projects.map(x => ({ root: x.root, title: x.title, misc: x.misc === true }))
})
const misc = projects.find(x => x.root.endsWith('/诺文/杂项'))
check(misc !== undefined, `创作库列表含杂项（${projects.length} 个项目）`)
check(misc?.title === '杂项' && misc.misc === true, `杂项带固定名和 misc 标记（${JSON.stringify(misc)}）`)

// ── B. 服务端拒绝移出/改名杂项 ──
const rm = await p.evaluate(async root => {
  const r = await fetch('/api/noven-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'unregister', root }) })
  return { status: r.status, body: await r.text() }
}, misc.root)
check(rm.status === 400, `移出杂项被服务端拒绝（${rm.status} ${rm.body}）`)
const rn = await p.evaluate(async root => {
  const r = await fetch('/api/noven-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'rename', root, title: '别的' }) })
  return { status: r.status }
}, misc.root)
check(rn.status === 400, `改名杂项被服务端拒绝（${rn.status}）`)

// ── C. 创作库项目页里杂项没有「移出创作库 / 重命名」菜单入口（DOM 始终挂载，直接查）──
const tileMenuCount = await p.locator('.nv-proj-grid > *').filter({ hasText: '杂项' }).first().locator('.nv-cardmenu-dot').count()
  .catch(() => -1)
check(tileMenuCount === 0, `创作库杂项瓷砖没有 ⋯ 菜单（count=${tileMenuCount}；0=隐藏，-1=概览未挂载）`)

check(errs.length === 0, `零 pageerror ${JSON.stringify(errs.slice(0, 2))}`)
await b.close()
console.log(out.every(Boolean) ? '\nALL PASS' : `\n${out.filter(x => !x).length} FAILURES`)
