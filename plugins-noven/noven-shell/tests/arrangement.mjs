/** Global Agent/Handcraft mode mapping and persistence. Run after building lib/client/. */
import { createNovenModeStore, frameLayoutPolicy } from '../lib/client/arrangement.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const values = new Map()
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)) },
  removeItem: key => { values.delete(key) },
}

check(frameLayoutPolicy('agent').primary === 'main' && frameLayoutPolicy('agent').canvasSide === 'right', 'Agent 对话主区、画布最右侧')
check(frameLayoutPolicy('ide').primary === 'rightbar' && frameLayoutPolicy('ide').canvasSide === 'right', 'IDE 画布主区、对话右侧')

const first = createNovenModeStore().create()
first.actions.setMode('ide')
check(first.getSnapshot().mode === 'ide', '唯一模式写入口更新全局状态')
check(Object.keys(first.getSnapshot()).join(',') === 'mode', '模式记录不含 Session 或画布业务状态')
const restored = createNovenModeStore().create()
check(restored.getSnapshot().mode === 'ide', '模式只按全局键恢复')

localStorage.setItem('noven.shell.mode.v1', JSON.stringify({ mode: 'invalid' }))
const invalid = createNovenModeStore().create()
check(invalid.getSnapshot().mode === 'agent', '损坏的模式记录回退 Agent')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
