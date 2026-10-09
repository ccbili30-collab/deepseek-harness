// 全流程验货：无底图入口 → 草稿 → 标注（面/路/地标） → 争议 → 修改（拉伸/涂抹）
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)(
  '/Users/noven/Documents/Codex/noven-pc/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.js')

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } })
page.on('pageerror', e => console.log('[pageerror]', e.message))
await page.goto('http://localhost:8572/index.html?img=0', { waitUntil: 'networkidle' })
const shot = async n => { await page.waitForTimeout(250); await page.screenshot({ path: `${n}.png` }); console.log('saved', n) }

// 1. 入口
await shot('s1-entry')
await page.getByText('手绘草稿').click()
await shot('s2-draft-empty')

// 2. 草稿：抹一块海 + 一块陆
const cv = await page.locator('canvas').boundingBox()
const drag = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 6 })
  await page.mouse.up()
}
const at = (x, y) => [cv.x + x * cv.width, cv.y + y * cv.height]
await page.getByText('海').click()
await drag([at(.15, .75), at(.3, .8), at(.5, .82), at(.65, .78)])
await page.getByText('陆').click()
await drag([at(.4, .35), at(.55, .3), at(.7, .36), at(.55, .45)])
await shot('s3-draft-painted')

// 3. 标注：圈一个王国面
await page.getByRole('button', { name: '标注' }).click()
await shot('s4-annotate')
await drag([at(.35, .25), at(.55, .22), at(.62, .4), at(.45, .5), at(.32, .4), at(.35, .25)])
await shot('s5-kingdom-face')

// 4. 画一条路 + 一条河（路吸附面边不用管，看效果）
await page.locator('.nv-maped-panel').getByRole('button', { name: '道路' }).click()
await drag([at(.2, .7), at(.45, .55), at(.7, .5), at(.9, .45)])
await page.locator('.nv-maped-panel').getByRole('button', { name: '河流' }).click()
await drag([at(.8, .15), at(.75, .35), at(.82, .55), at(.78, .8)])
await shot('s6-lines')

// 5. 地标
await page.locator('.nv-maped-panel').getByRole('button', { name: '地标' }).click()
await page.mouse.click(cv.x + cv.width * .5, cv.y + cv.height * .32)
await shot('s7-landmark')

// 6. 再画一个重叠王国 → 争议
await page.locator('.nv-maped-panel').getByRole('button', { name: '王国' }).click()
await drag([at(.5, .3), at(.72, .3), at(.75, .55), at(.55, .55), at(.5, .3)])
await shot('s8-dispute')

// 7. 修改模式：点选面 → 拖边线拉伸
await page.getByRole('button', { name: '修改' }).click()
await shot('s9-edit')
// 点在面内选中
await page.mouse.click(cv.x + cv.width * .48, cv.y + cv.height * .35)
await shot('s10-selected')
// 拖上边线
await drag([at(.5, .22), at(.52, .12)])
await shot('s11-stretched')

await browser.close()
console.log('done')
