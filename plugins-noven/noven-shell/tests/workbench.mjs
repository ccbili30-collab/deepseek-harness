/** Shared workbench preference persistence. Run after building lib/client/. */
import { createNovenWorkbenchStore } from '../lib/client/workbench.js'

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

const first = createNovenWorkbenchStore().create()
check(first.getSnapshot().autoSave === true, '自动保存默认开启')
check(first.getSnapshot().restoreCanvas === true, '项目画布恢复默认开启')
check(first.getSnapshot().lineNumbers === false, '行号默认关闭')
first.actions.setAutoSave(false)
first.actions.setRestoreCanvas(false)
first.actions.setLineNumbers(true)
const restored = createNovenWorkbenchStore().create()
check(restored.getSnapshot().autoSave === false, '自动保存选择跨实例恢复')
check(restored.getSnapshot().restoreCanvas === false, '画布恢复选择跨实例恢复')
check(restored.getSnapshot().lineNumbers === true, '行号选择跨实例恢复')

localStorage.setItem('noven.shell.workbench.v1', JSON.stringify({ autoSave: 'yes', restoreCanvas: 0, lineNumbers: null }))
const invalid = createNovenWorkbenchStore().create()
check(invalid.getSnapshot().autoSave === true && invalid.getSnapshot().restoreCanvas === true && invalid.getSnapshot().lineNumbers === false, '损坏的偏好逐字段回退默认值')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
