/**
 * fileOp 的失败面：删除/改名要能区分“文件已不在”（404）与真失败，
 * 否则界面只能回一句没有原因的“没做成”。
 *
 * Run: node tests/file-op.mjs（先 pnpm run build）
 * @module noven-shell/tests/file-op
 */
import { fileOp } from '../lib/client/tree-api.js'

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}
const addr = { root: '/tmp/noven-file-op-test' }
const respond = (status, body) => async () => new Response(body, { status })

globalThis.fetch = respond(200, JSON.stringify({ ok: true }))
const okResult = await fileOp(addr, { op: 'rm', path: '文稿/a.md' })
check(okResult.ok === true && okResult.status === 200, '200 → ok')

globalThis.fetch = respond(404, 'file not found')
const gone = await fileOp(addr, { op: 'rm', path: '文稿/gone.md' })
check(gone.ok === false && gone.status === 404 && gone.error === 'file not found', '404 带状态与原文（文件已不在）')

globalThis.fetch = respond(409, 'target exists or is a directory')
const refused = await fileOp(addr, { op: 'rename', path: '文稿/a.md', name: 'b' })
check(refused.ok === false && refused.status === 409 && refused.error?.includes('directory') === true, '409 带状态与原文')

globalThis.fetch = async () => { throw new Error('offline') }
const offline = await fileOp(addr, { op: 'rm', path: 'x' })
check(offline.ok === false && offline.status === 0, '网络失败 → status 0')

console.log(failures === 0 ? '\nALL PASS' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
