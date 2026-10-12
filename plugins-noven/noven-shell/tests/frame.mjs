/**
 * v0.3 帧骨架自测：buildEnv 档位映射、realWebview 解析、frameReason 优先级
 *（branch > send > ime > turn，首帧 init）。
 *
 * Run: node tests/frame.mjs（先 tsc，测的是 lib/client/ 产物）
 * @module noven-shell/tests/frame
 */
import { WEBVIEW_BASELINE, SIM_IME, buildEnv, frameReason, realWebview } from '../lib/client/stage-frame.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

// 1. buildEnv：基线内核 + 键盘收/弹
const env0 = buildEnv({ sizeKey: 'p390', imeOn: false, webview: 'baseline' })
check(env0.platform === 'pc-shell' && env0.bridgeVersion === 2, 'env 平台与桥版本')
check(env0.webview === WEBVIEW_BASELINE, `baseline 模式上报 ${WEBVIEW_BASELINE}`)
check(env0.ime.visible === false && env0.ime.height === 0, '键盘收起：height=0')
const env1 = buildEnv({ sizeKey: 'p390', imeOn: true, webview: 'baseline' })
check(env1.ime.visible === true && env1.ime.height === SIM_IME.p390, 'p390 键盘高度 300')
for (const [key, h] of Object.entries(SIM_IME)) {
  const e = buildEnv({ sizeKey: key, imeOn: true, webview: 'baseline' })
  check(e.ime.height === h, `档位 ${key} → ${h}`)
}
check(buildEnv({ sizeKey: 'nope', imeOn: true, webview: 'baseline' }).ime.height === SIM_IME.p390, '未知档位回落 p390')

// 2. realWebview：UA 解析与回退
check(realWebview('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36') === 124, 'UA 解析 Chrome/124')
check(realWebview('not a ua') === WEBVIEW_BASELINE, '坏 UA 回退基线')
check(realWebview() === WEBVIEW_BASELINE, 'node 无 navigator 回退基线')
check(buildEnv({ sizeKey: 'p390', imeOn: false, webview: 'real', ua: 'x Chrome/130.0 y' }).webview === 130, 'real 模式报真实版本')

// 3. frameReason 优先级
const base = { session: 's1', env: env0 }
check(frameReason(undefined, base) === 'init', '首帧 init')
check(frameReason(base, base) === 'turn', '无变化帧 → turn')
check(frameReason(base, { ...base, session: 's2' }) === 'branch', 'session 变 → branch')
check(frameReason(base, { ...base, env: env1 }) === 'ime', 'ime 变 → ime')
check(frameReason(base, { ...base, sendResult: { result: 'accepted', why: null } }) === 'send', 'sendResult 新对象 → send')
const sr = { result: 'accepted', why: null }
check(frameReason({ ...base, sendResult: sr }, { ...base, sendResult: sr }) === 'turn', 'sendResult 同一引用不算新发送')
check(frameReason(base, { ...base, session: 's2', sendResult: sr }) === 'branch', 'branch 优先于 send')
check(frameReason(base, { ...base, env: env1, sendResult: sr }) === 'send', 'send 优先于 ime')

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
