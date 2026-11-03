/** Workbench subject mapping and persistence. Run after building lib/client/. */
import { createNovenSubjectStore, frameLayoutPolicy, modeOfSubject, subjectOfMode } from '../lib/client/arrangement.js'

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

check(frameLayoutPolicy('conversation').primary === 'main' && frameLayoutPolicy('conversation').canvasSide === 'right', '会话主体：对话主区、画布最右侧')
check(frameLayoutPolicy('canvas').primary === 'rightbar' && frameLayoutPolicy('canvas').canvasSide === 'right', '画布主体：画布主区、对话右侧')
check(frameLayoutPolicy('conversation').topbar === false && frameLayoutPolicy('canvas').topbar === false, '两种主体都使用品牌行，不挂独立顶栏')
check(frameLayoutPolicy('conversation').contentInset === 4 && frameLayoutPolicy('canvas').contentInset === 4, '内容列 4px 外框缝与窗口安全区分离')
check(frameLayoutPolicy('conversation').sideChrome === 'content' && frameLayoutPolicy('canvas').sideChrome === 'content', '辅助画布 chrome 归活动叶所有')
check(modeOfSubject('canvas') === 'ide' && subjectOfMode('ide') === 'canvas', '模式只是主体位置的投影')

const first = createNovenSubjectStore().create()
first.actions.setSubject('canvas')
check(first.getSnapshot().subject === 'canvas', '唯一主体写入口更新全局状态')
check(Object.keys(first.getSnapshot()).join(',') === 'subject', '主体记录不含 Session 或画布业务状态')
const restored = createNovenSubjectStore().create()
check(restored.getSnapshot().subject === 'canvas', '主体只按全局键恢复')

localStorage.setItem('noven.shell.subject.v1', JSON.stringify({ subject: 'invalid' }))
const invalid = createNovenSubjectStore().create()
check(invalid.getSnapshot().subject === 'conversation', '损坏的主体记录回退会话')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
