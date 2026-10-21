/**
 * Read-only probe: does the content tree's multi-select expose batch operations,
 * and does the row ⋯ menu ignore the selection?
 * Run: node apps/web/_probe-tree-selection.mjs '<token URL>'
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

const url = process.argv[2]
if (url === undefined) throw new Error('pass the full token URL')
const repo = '/Users/noven/Documents/Codex/noven-pc'
const out = join(repo, '.playwright-mcp', 'tree-selection')
mkdirSync(out, { recursive: true })
const { chromium } = createRequire(join(repo, 'apps/web/package.json'))('playwright')
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(String(error)))

await page.goto(url)
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)
if (await page.locator('.nv-tree').count() === 0 || !(await page.locator('.nv-tree').first().isVisible())) {
  const expand = page.locator('button[aria-label="打开右侧边栏"], button[aria-label="Open right sidebar"]')
  if (await expand.count() > 0) { await expand.first().click(); await page.waitForTimeout(700) }
}
if (await page.locator('.nv-tree').count() === 0 || !(await page.locator('.nv-tree').first().isVisible())) {
  const handcraft = page.locator('.nv-create-path').filter({ hasText: '手作' })
  if (await handcraft.count() > 0) { await handcraft.first().click(); await page.waitForTimeout(1800) }
}
await page.locator('.nv-tree').first().waitFor({ timeout: 10000 })

const rows = await page.evaluate(() => [...document.querySelectorAll('.nv-tree-row')].map(row => ({
  name: row.querySelector('.nv-tree-name')?.textContent ?? '',
  sel: row.getAttribute('data-sel'),
  group: row.closest('.nv-tree-group')?.querySelector('.nv-tree-groupname')?.textContent ?? row.parentElement?.className ?? '',
})).slice(0, 40))
console.log('rows:', JSON.stringify(rows, null, 1))

const names = rows.filter(row => row.name !== '').map(row => row.name)
const start = names.findIndex(name => name.includes('未命名文稿'))
if (start < 0 || names.length - start < 3) throw new Error('docs group rows not found')
const first = page.locator('.nv-tree-name', { hasText: names[start] }).first()
const third = page.locator('.nv-tree-name', { hasText: names[start + 2] }).first()
await first.click({ modifiers: ['Meta'] })
await page.waitForTimeout(300)
await third.click({ modifiers: ['Shift'] })
await page.waitForTimeout(500)

const selected = await page.evaluate(() => ({
  selRows: document.querySelectorAll('.nv-tree-row[data-sel]').length,
  selbar: document.querySelector('.nv-tree-selbar') !== null,
  selbarText: document.querySelector('.nv-tree-selbar')?.textContent ?? '',
  buttons: [...document.querySelectorAll('.nv-tree-selbar button')].map(b => ({
    text: b.textContent, disabled: b.disabled, title: b.getAttribute('title'),
  })),
}))
console.log('after shift-select:', JSON.stringify(selected, null, 1))
await page.screenshot({ path: join(out, '01-selected.png') })

if (selected.selbar) {
  const more = page.locator('.nv-tree-row[data-sel] .nv-tree-more').first()
  if (await more.count() > 0) {
    await more.click()
    await page.waitForTimeout(400)
    const menu = await page.evaluate(() => [...document.querySelectorAll('.nv-tree-newmenu [role="menuitem"], .nv-tree-newmenu button, .nv-tree-newmenu li')]
      .map(node => node.textContent?.trim()).filter(text => text !== undefined && text !== ''))
    console.log('row menu items while multi-selected:', JSON.stringify(menu))
    await page.screenshot({ path: join(out, '02-row-menu.png') })

    const batchDelete = page.locator('.nv-tree-newmenu').getByText(/删除选中的 \d+ 项/).first()
    console.log('batch delete item present:', await batchDelete.count() > 0)
    if (await batchDelete.count() > 0) {
      await batchDelete.click()
      await page.waitForTimeout(500)
      const dialog = await page.evaluate(() => ({
        open: document.querySelector('.nv-veil') !== null,
        title: document.querySelector('.nv-veil-title')?.textContent ?? '',
        body: document.querySelector('.nv-veil-body')?.textContent ?? '',
        buttons: [...document.querySelectorAll('.nv-veil-actions button')].map(b => b.textContent?.trim()),
      }))
      console.log('batch delete confirm:', JSON.stringify(dialog))
      await page.screenshot({ path: join(out, '03-batch-confirm.png') })
      const cancel = page.locator('.nv-veil-actions .nv-veil-btn').first()
      if (await cancel.count() > 0) await cancel.click()
      await page.waitForTimeout(500)
      console.log('after cancel — selRows:', await page.locator('.nv-tree-row[data-sel]').count(), 'confirm open:', await page.locator('.nv-veil').count())
    }
  }
}
console.log('pageerrors:', errors.length, errors.slice(0, 3))
await browser.close()
