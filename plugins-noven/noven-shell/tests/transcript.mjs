/**
 * transcript 黄金样例（r2 B1.0）：fixtures/transcript/*.json 即解析规格——
 * 「输入原文 → 期望 transcript JSON」。手机侧跑同一批样例对账；
 * 改样例 = 改协议，须同步手机侧。流式中间态样例由手机侧补（PC 读不到流帧，
 * streaming 恒 false——已登记的 PC 已知差异）。
 *
 * Run: node tests/transcript.mjs（先 tsc，测的是 lib/client/ 产物）
 * @module noven-shell/tests/transcript
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildTranscript } from '../lib/client/stage-transcript.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'transcript')

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
  if (!ok) failures += 1
}

const REQ = ['id', 'messageId', 'segment', 'role', 'kind', 'text', 'html', 'src', 'streaming']
const OPT = ['speaker', 'turnId']
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** 段比对：必选键全等；可选键出现在任何一侧都必须一致。 */
function segEq(actual, expected) {
  for (const k of REQ) if (!eq(actual[k], expected[k])) return `键 ${k}: ${JSON.stringify(actual[k])} ≠ ${JSON.stringify(expected[k])}`
  for (const k of OPT) {
    if (k in actual || k in expected) {
      if (!eq(actual[k], expected[k])) return `可选键 ${k}: ${JSON.stringify(actual[k])} ≠ ${JSON.stringify(expected[k])}`
    }
  }
  return null
}

for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const fx = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const actual = buildTranscript(fx.input, fx.cast ?? [])
  if (actual.length !== fx.expected.length) {
    check(false, `${file} ${fx.name} — 段数 ${actual.length} ≠ ${fx.expected.length}`)
    continue
  }
  let bad = null
  for (let i = 0; i < actual.length; i++) {
    bad = segEq(actual[i], fx.expected[i])
    if (bad !== null) { bad = `段 ${i} ${bad}`; break }
  }
  check(bad === null, `${file} ${fx.name}${bad === null ? '' : ` — ${bad}`}`)
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
