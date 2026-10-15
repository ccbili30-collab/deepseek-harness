/**
 * 冷层自测（设计理念 §14）：
 *  1. 树快照按项目根写/读 localStorage（注入内存 store）；
 *  2. LRU：超过上限淘汰最久未访问；
 *  3. 移出项目 forget 后读不到，且索引同步移除；
 *  4. tree-api 首帧先出冷层快照、后台轮询覆盖；刷新后新源（模拟内存清空）仍立刻有内容。
 *
 * Run: node tests/tree-cache.mjs（先 tsc）
 * @module noven-shell/tests/tree-cache
 */
import { readCachedTree, writeCachedTree, forgetCachedTree, cachedTreeRoots } from '../lib/client/tree-cache.js'
import { novenTreeSource, bindTreeColdCache } from '../lib/client/tree-api.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const makeStore = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: k => { m.delete(k) },
    _size: () => m.size,
  }
}
const t1 = (rev) => ({ revision: rev, cards: [{ cardId: rev }], docs: [], works: [], sections: [], files: { count: 0 } })

// 1. 写读
{
  const s = makeStore()
  check(readCachedTree('/A', s) === undefined, '空存储读不到')
  writeCachedTree('/A', t1('a-1'), s)
  check(readCachedTree('/A', s)?.revision === 'a-1', '按项目根读回快照')
  check(readCachedTree('/B', s) === undefined, '别的项目读不到')
}

// 2. LRU
{
  const s = makeStore()
  for (let i = 0; i < 42; i++) writeCachedTree(`/p${i}`, t1(`r${i}`), s)
  const roots = cachedTreeRoots(s)
  check(roots.length === 40, `最多保留 40 个项目（${roots.length}）`)
  check(!roots.includes('/p0') && !roots.includes('/p1'), '最旧的两个被淘汰')
  check(roots[0] === '/p41', '最近写的排在最前')
  writeCachedTree('/p2', t1('r2b'), s)
  check(cachedTreeRoots(s)[0] === '/p2', '再次访问提到最前')
  check(readCachedTree('/p2', s)?.revision === 'r2b', '重访读到新内容')
}

// 3. forget
{
  const s = makeStore()
  writeCachedTree('/A', t1('a'), s); writeCachedTree('/B', t1('b'), s)
  forgetCachedTree('/A', s)
  check(readCachedTree('/A', s) === undefined, '移出项目后快照删除')
  check(JSON.stringify(cachedTreeRoots(s)) === JSON.stringify(['/B']), '索引同步移除')
}

// 4. 冷层喂给 tree-api：全新源（模拟刷新）首帧即有，再被后台覆盖
{
  const s = makeStore()
  writeCachedTree('/cold', t1('cold-cached'), s)
  bindTreeColdCache({
    read: root => readCachedTree(root, s),
    write: (root, tree) => { writeCachedTree(root, tree, s) },
  })
  globalThis.fetch = async url => {
    const u = new URL(url, 'http://t')
    if (u.searchParams.get('root') === '/cold') {
      await sleep(40)
      return new Response(JSON.stringify(t1('cold-fresh')), { status: 200 })
    }
    return new Response(null, { status: 500 })
  }
  const target = () => ({ root: '/cold', scope: '/cold' })
  let publishes = []
  const src = novenTreeSource(target)
  src.subscribe(() => { publishes.push(src.getSnapshot()?.revision) })
  // 订阅即首帧：冷层
  check(src.getSnapshot()?.revision === 'cold-cached', '新源首帧直接出本地缓存（不等待网络）')
  await sleep(90)
  check(publishes.includes('cold-fresh'), '后台新树到达后静默覆盖')
  check(readCachedTree('/cold', s)?.revision === 'cold-fresh', '覆盖同时回写本地')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
