// 一次性修复：把会话日志里的 noven/* 事件标记成 ignorable（插件事件不在
// 仓库词汇表里，不标会被读取端拒载）。逐帧解→改→压，保留帧边界。
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { scanZstdFrames, decompressZstdFrame, compressZstdFrame } from '../packages/session/session-persistence-jsonl/src/zstd.ts'

const file = process.argv[2]
if (!file) throw new Error('usage: repair-sidecar-events.mjs <session.v4.jsonl.zstd>')

const source = readFileSync(file)
const { frames } = scanZstdFrames(source)
const out = []
let patched = 0
for (const range of frames) {
  const plain = await decompressZstdFrame(source.subarray(range.start, range.end))
  const lines = plain.toString().split('\n')
  const next = lines.map(line => {
    if (line.length === 0) return line
    const event = JSON.parse(line)
    if (typeof event.type === 'string' && event.type.startsWith('noven/')) {
      patched++
      return JSON.stringify({ ...event, ignorable: true })
    }
    return line
  })
  out.push(await compressZstdFrame(next.join('\n')))
}
copyFileSync(file, `${file}.bak`)
writeFileSync(file, Buffer.concat(out))
console.log(`patched ${patched} noven events in ${frames.length} frames`)
