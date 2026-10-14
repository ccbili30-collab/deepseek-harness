/**
 * 温层自测（设计理念 §14）：内容树源按项目留快照——切走再切回立即发布旧快照、
 * 在飞请求不串项目、since token 只在同项目内带。stub 全局 fetch，测 lib 产物。
 *
 * Run: node tests/retain.mjs（先 tsc）
 * @module noven-shell/tests/retain
 */
import { novenTreeSource } from '../lib/client/tree-api.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const tree = (root, rev) => ({ revision: `${root}-${rev}`, cards: [{ cardId: root }], docs: [], works: [], sections: [], files: { count: 0 } })
const calls = []
let delayFor = null
globalThis.fetch = async (url) => {
  const u = new URL(url, 'http://t')
  const root = u.searchParams.get('root')
  const since = u.searchParams.get('since')
  calls.push({ root, since })
  if (delayFor === root) await sleep(60)
  if (since === `${root}-1`) return new Response(null, { status: 304 })
  return new Response(JSON.stringify(tree(root, 1)), { status: 200 })
}

let current = { root: '/A', scope: '/A' }
const src = novenTreeSource(() => current)
const seen = []
const off = src.subscribe(() => { seen.push(src.getSnapshot()?.revision ?? 'EMPTY') })
await sleep(20)
check(src.getSnapshot()?.revision === '/A-1', '首次进入项目 A：取到 A 的树')

current = { root: '/B', scope: '/B' }
seen.length = 0
src.refresh(); await sleep(20)
check(seen[0] === 'EMPTY' && src.getSnapshot()?.revision === '/B-1', '首次进入 B：从未见过才是空，随后是 B 的树')

current = { root: '/A', scope: '/A' }
seen.length = 0
src.refresh()
check(src.getSnapshot()?.revision === '/A-1', '切回 A：同步立即发布 A 的旧快照（不清空）')
await sleep(20)
check(!seen.includes('EMPTY'), `切回 A 全程无空态（发布序列 ${JSON.stringify(seen)}）`)
check(calls.at(-1).root === '/A' && calls.at(-1).since === '/A-1', '切回 A 带的是 A 自己的 since token（304 不改快照）')

// 在飞请求不串项目：A 请求慢，期间切到 B，A 的回包不得覆盖 B
delayFor = '/A'
current = { root: '/A', scope: '/A' }
const fresh = novenTreeSource(() => current)
const off2 = fresh.subscribe(() => {})
await sleep(5)
current = { root: '/B', scope: '/B' }
fresh.refresh()
await sleep(120)
check(fresh.getSnapshot()?.revision === '/B-1', '慢回的 A 请求不覆盖已切到的 B')

off(); off2()
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
