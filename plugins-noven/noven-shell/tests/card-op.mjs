/**
 * cardOp 的 409 契约：JSON 回执是版本冲突（CardConflict），守卫的纯文本回执是
 * 普通 Error 且保留原因——两者不能混成一个 SyntaxError。
 *
 * Run: node tests/card-op.mjs（先 pnpm run build）
 * @module noven-shell/tests/card-op
 */
import { CardConflict, cardOp } from '../lib/client/card-api.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const addr = { root: '/tmp/noven-card-op-test' }
const respond = (status, body) => async () => new Response(body, { status })
const catchOf = async (op) => {
  try {
    await cardOp(addr, op)
    return undefined
  } catch (error) {
    return error
  }
}

globalThis.fetch = respond(409, JSON.stringify({ version: 'v7' }))
const conflict = await catchOf({ op: 'commit', cardId: 'c1' })
check(conflict instanceof CardConflict && conflict.currentVersion === 'v7', '409 JSON 仍是 CardConflict（带版本）')

globalThis.fetch = respond(409, '这张卡仍被 1 处模块引用；先移除或转换引用再删除')
const refusal = await catchOf({ op: 'delete', cardId: 'c1' })
check(refusal instanceof Error && !(refusal instanceof CardConflict), '409 纯文本不冒充版本冲突')
check(refusal instanceof Error && refusal.message.includes('仍被 1 处模块引用'), '409 纯文本保留服务端原因')

globalThis.fetch = respond(200, JSON.stringify({ ok: true }))
const okResult = await cardOp(addr, { op: 'delete', cardId: 'c1' })
check(okResult.ok === true, '200 回执正常解析')

console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
