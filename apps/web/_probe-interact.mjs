// 前端地基第 1 步验收：菜单内二次确认 / 行内改名 / 删除回执+撤销 / 统一弹层 / 菜单动效 / token。
// 只在临时测试卡与临时分组上操作，跑完清理。用法：node _probe-interact.mjs <token> [base]
import { chromium } from 'playwright'
import fs from 'node:fs'

const TOKEN = process.argv[2]
const BASE = process.argv[3] ?? 'http://127.0.0.1:3083'
const OUT = '/tmp/interact-e2e'
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
let nativeDialog = 0
page.on('dialog', d => { nativeDialog += 1; void d.dismiss() })

await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.nv-tree, .nv-tree-rail', { timeout: 30000 })
if (await page.$('.nv-tree-railbtn')) { await page.click('.nv-tree-railbtn'); await sleep(600) }
await page.waitForSelector('.nv-tree-project', { timeout: 20000 })
console.log('loaded'); await shot('00-loaded')

// token 生效
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return { micro: cs.getPropertyValue('--nv-dur-micro').trim(), ui: cs.getPropertyValue('--nv-dur-ui').trim(), danger: cs.getPropertyValue('--nv-danger').trim() }
})
check(tokens.micro === '120ms' && tokens.ui === '200ms' && tokens.danger !== '', `motion/颜色 token 生效 ${JSON.stringify(tokens)}`)

// 拿到当前项目根，经 API 建一张临时卡
const root = await page.evaluate(async (token) => {
  const r = await fetch(`/api/noven-tree?token=${token}`).catch(() => null)
  return r === null ? null : r.status
}, TOKEN)
const cardName = `验收临时卡${Date.now() % 100000}`
// 通过树底「新建」走不稳定，直接用页面上下文里的会话地址：读取树行里任一卡的 api 地址不可得，
// 所以用 create 对话框：树底 ＋新建 → 新建卡。
await page.locator('.nv-tree-foot .nv-tree-foothalf').filter({ hasText: '新建' }).first().click()
await sleep(400)
await shot('01-newmenu')
const menuAnim = await page.evaluate(() => {
  const el = document.querySelector('.nv-tree-newmenu')
  return el === null ? null : getComputedStyle(el).animationName
})
check(menuAnim === 'nv-menu-in', `诺文菜单有弹出动效（animation=${menuAnim}）`)
await page.locator('[role="menuitem"]').filter({ hasText: /新建卡/ }).first().click()
await sleep(500)
const nameInput = page.locator('.nv-create-name').first()
await nameInput.fill(cardName)
await page.keyboard.press('Enter')
await sleep(2500)
let cardRow = page.locator('.nv-tree-card').filter({ hasText: cardName }).first()
check(await cardRow.count() === 1, `临时卡「${cardName}」出现在树里（tree status ${root}）`)

// ── A. 行内改名（卡行）：Esc 取消、Enter 提交 ──
const openMenu = async (row) => { await row.hover(); await row.locator('.nv-tree-more').first().click(); await sleep(300) }
const item = (text) => page.locator('.nv-tree-newmenu [role="menuitem"]').filter({ hasText: text }).first()
await openMenu(cardRow)
await item('修改卡名').click()
await sleep(200)
const renameIn = page.locator('.nv-tree-renamein').first()
check(await renameIn.count() === 1 && await renameIn.evaluate(el => el === document.activeElement && el.selectionEnd - el.selectionStart === el.value.length), '改名输入框聚焦且全选')
await renameIn.fill('不该生效')
await page.keyboard.press('Escape')
await sleep(300)
check(await page.locator('.nv-tree-card').filter({ hasText: cardName }).count() === 1, 'Esc 取消改名，原名保留')
const renamed = `${cardName}改`
await openMenu(cardRow)
await item('修改卡名').click()
await sleep(200)
await page.locator('.nv-tree-renamein').first().fill(renamed)
await page.keyboard.press('Enter')
await sleep(2800)
cardRow = page.locator('.nv-tree-card').filter({ hasText: renamed }).first()
check(await cardRow.count() === 1, 'Enter 提交改名，树里换成新名')

// ── B. 菜单内二次确认：第一下武装（菜单不关），超时还原；第二下执行 ──
await openMenu(cardRow)
await item('删除卡片').click()
await sleep(250)
const armedText = await page.locator('.nv-tree-newmenu .nv-armed').first().textContent().catch(() => null)
check(armedText === '确认删除？', `第一下：菜单不关、行变「确认删除？」（${armedText}）`)
await shot('02-armed')
await sleep(3300)
check(await page.locator('.nv-tree-newmenu .nv-armed').count() === 0, '3s 无操作后武装态还原')
await item('删除卡片').click()
await sleep(200)
await page.locator('.nv-tree-newmenu [role="menuitem"]').filter({ hasText: '确认删除' }).first().click()
await sleep(1500)
check(await page.locator('.nv-tree-card').filter({ hasText: renamed }).count() === 0, '第二下：卡从树里删除')
const receipt = await page.locator('.nv-undo').textContent().catch(() => null)
check(receipt !== null && receipt.includes(renamed) && receipt.includes('撤销'), `删除回执出现且带撤销（${receipt}）`)
await shot('03-receipt')

// ── C. 撤销：卡回到树里 ──
await page.locator('.nv-undo-undo').click()
await sleep(2800)
check(await page.locator('.nv-tree-card').filter({ hasText: renamed }).count() === 1, '撤销后卡回到树里（restore）')

// ── D. 关菜单即复位：武装后点外面，再开不带武装 ──
cardRow = page.locator('.nv-tree-card').filter({ hasText: renamed }).first()
await openMenu(cardRow)
await item('删除卡片').click()
await sleep(200)
await page.keyboard.press('Escape')
await sleep(300)
await openMenu(cardRow)
check(await page.locator('.nv-tree-newmenu .nv-armed').count() === 0, '关掉菜单后再开，武装态已复位')
await page.keyboard.press('Escape')
await sleep(200)

// ── E. 统一弹层：用户分组删除（只在临时分组上）──
const groupName = `验收组${Date.now() % 10000}`
// 用户分组只在文件视图里渲染（实体视图隐藏 sections）：先切过去。
await page.click('.nv-tree-head .nv-tree-eye')
await sleep(600)
await page.locator('.nv-tree-foot .nv-tree-foothalf').filter({ hasText: '新建' }).first().click()
await sleep(300)
const groupItem = page.locator('[role="menuitem"]').filter({ hasText: /新建分组/ }).first()
let groupMade = false
if (await groupItem.count() === 1) {
  await groupItem.click(); await sleep(400)
  const gi = page.locator('.nv-create-name').first()
  await gi.fill(groupName); await page.keyboard.press('Enter'); await sleep(2800)
  groupMade = await page.locator('.nv-tree-grouptitle', { hasText: groupName }).count() === 1
  if (!groupMade) { await shot('04-nogroup'); console.log('titles:', JSON.stringify(await page.$$eval('.nv-tree-grouptitle', els => els.map(e => e.textContent)))) }
}
check(groupMade, `临时分组「${groupName}」已建`)
if (groupMade) {
  const grp = page.locator('.nv-tree-group').filter({ has: page.locator('.nv-tree-grouptitle', { hasText: groupName }) }).first()
  await grp.hover()
  await grp.locator('.nv-tree-del').first().click()
  await sleep(350)
  const veil = await page.evaluate(() => {
    const card = document.querySelector('.nv-veil-card')
    return card === null ? null : { title: card.querySelector('.nv-veil-title')?.textContent, anim: getComputedStyle(card).animationName, focus: document.activeElement?.classList.contains('nv-veil-ok') }
  })
  check(veil !== null && veil.title?.includes(groupName) && veil.anim === 'nv-veil-in' && veil.focus === true, `弹层：标题含组名、进场动效、焦点在确认钮 ${JSON.stringify(veil)}`)
  await shot('04-veil')
  await page.keyboard.press('Escape')
  await sleep(400)
  check(await page.locator('.nv-veil').count() === 0 && await page.locator('.nv-tree-grouptitle', { hasText: groupName }).count() === 1, 'Esc 关弹层，分组未删')
  await grp.hover()
  await grp.locator('.nv-tree-del').first().click()
  await sleep(350)
  await page.keyboard.press('Enter')
  await sleep(2800)
  check(await page.locator('.nv-tree-grouptitle', { hasText: groupName }).count() === 0, 'Enter 确认，分组删除')
}

// 切回实体视图，清理本次及往次残留的全部「验收临时卡*」
await page.click('.nv-tree-head .nv-tree-eye')
await sleep(600)
for (let guard = 0; guard < 6; guard++) {
  const left = page.locator('.nv-tree-card').filter({ hasText: '验收临时卡' }).first()
  if (await left.count() === 0) break
  await openMenu(left)
  await item('删除卡片').click(); await sleep(200)
  await item('确认删除').click()
  await sleep(2000)
}
check(await page.locator('.nv-tree-card').filter({ hasText: '验收临时卡' }).count() === 0, '临时卡已清理')

check(nativeDialog === 0, `全程未弹原生 confirm/prompt（${nativeDialog}）`)
check(errors.length === 0, `控制台零 pageerror ${JSON.stringify(errors.slice(0, 3))}`)
await browser.close()
const failed = results.filter(r => !r[0]).length
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
clearTimeout(kill)
