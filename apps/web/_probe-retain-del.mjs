// 温层 × 删除：开过的卡被删后，再开同 id 不得渲出旧快照；撤销后回来。
import { chromium } from 'playwright'
const TOKEN = process.argv[2]
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
p.setDefaultTimeout(8000)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const out = []; const check = (ok, w) => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${w}`) }
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://127.0.0.1:3083/?token=${TOKEN}`)
await p.waitForSelector('.nv-tree-project', { timeout: 30000 })
await p.locator('.nv-tree-card').first().waitFor({ timeout: 15000 })
const name = `留存删除测${Date.now() % 100000}`
await p.locator('.nv-tree-foot .nv-tree-foothalf').filter({ hasText: '新建' }).first().click(); await sleep(300)
await p.locator('[role="menuitem"]').filter({ hasText: '新建卡' }).first().click(); await sleep(400)
await p.locator('.nv-create-name').first().fill(name); await p.keyboard.press('Enter'); await sleep(2500)
const row = () => p.locator('.nv-tree-card').filter({ hasText: name }).first()
check(await row().count() === 1, `临时卡建出 ${name}`)
await row().locator('.nv-tree-main').click(); await sleep(800)
check((await p.locator('.nv-cardpage-name').first().textContent())?.trim() === name, '卡页打开（快照入缓存）')
await row().hover(); await row().locator('.nv-tree-more').click(); await sleep(250)
const it = t => p.locator('.nv-tree-newmenu [role="menuitem"]').filter({ hasText: t }).first()
await it('删除卡片').click(); await sleep(150); await it('确认删除').click(); await sleep(1500)
check(await p.locator('.nv-cardpage-name').filter({ hasText: name }).count() === 0, '删除后画布不再显示该卡（页签关闭、快照失效）')
await p.locator('.nv-undo-undo').click(); await sleep(2500)
check(await row().count() === 1, '撤销后卡回树')
await row().locator('.nv-tree-main').click(); await sleep(900)
check((await p.locator('.nv-cardpage-name').first().textContent())?.trim() === name, '撤销后重开，卡页正常渲出')
// 清理
await row().hover(); await row().locator('.nv-tree-more').click(); await sleep(250)
await it('删除卡片').click(); await sleep(150); await it('确认删除').click(); await sleep(1500)
check(errs.length === 0, `零 pageerror ${JSON.stringify(errs.slice(0, 2))}`)
await b.close()
console.log(out.every(Boolean) ? '\nALL PASS' : '\nFAILURES')
