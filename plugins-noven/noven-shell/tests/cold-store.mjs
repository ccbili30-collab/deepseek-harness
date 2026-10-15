/** Card cold-mirror tests; Session history persistence is owned by session-controller. */
import { writeCold, readColdSync, forgetCold, forgetColdWhere } from '../lib/client/ui/cold-store.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const mem = new Map()
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)) },
  removeItem: k => { mem.delete(k) },
  clear: () => mem.clear(),
}
writeCold('card', '/A::c1', { name: '关羽', content: 'x' })
check(readColdSync('card', '/A::c1')?.name === '关羽', '卡片快照写入后可同步读')
forgetCold('card', '/A::c1')
check(readColdSync('card', '/A::c1') === undefined, 'forget 后读不到')
writeCold('card', '/A::c1', 1)
writeCold('card', '/A::c2', 2)
writeCold('card', '/B::c3', 3)
forgetColdWhere('card', k => k.startsWith('/A::'))
check(readColdSync('card', '/A::c1') === undefined && readColdSync('card', '/A::c2') === undefined, '按项目前缀清掉 A 的卡')
check(readColdSync('card', '/B::c3') === 3, '别的项目卡保留')
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
