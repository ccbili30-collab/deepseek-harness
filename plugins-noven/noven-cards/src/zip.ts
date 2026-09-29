/**
 * 零依赖 ZIP 读写（交换包用）：写 deflate 压缩条目；读 central directory。
 * 文件名 UTF-8；不加密不分卷——交换包自用足够。
 * @module noven-cards/zip
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buffer: Uint8Array): number {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

/** 一个要写入的条目。 */
export interface ZipEntry { name: string, data: Uint8Array }

/** 打包条目列表为 ZIP 字节。 */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const data = Buffer.from(entry.data)
    const compressed = deflateRawSync(data, { level: 6 })
    const crc = crc32(entry.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBytes, compressed)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x0800, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(0, 12)
    directory.writeUInt16LE(0, 14)
    directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(entry.data.length, 24)
    directory.writeUInt16LE(nameBytes.length, 28)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }
  const centralBytes = Buffer.concat(central.map(entry => Buffer.from(entry)))
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks.map(chunk => Buffer.from(chunk)), centralBytes, end]))
}

/** 读 ZIP：返回条目名 → 字节。仅支持 store/deflate。 */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const buffer = Buffer.from(bytes)
  // locate EOCD from the tail
  let end = -1
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65536; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('zip_eocd_missing')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const entries = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('zip_central_invalid')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)
    const data = method === 0 ? raw : method === 8 ? new Uint8Array(inflateRawSync(raw)) : undefined
    if (data === undefined) throw new Error(`zip_method_unsupported:${String(method)}`)
    if (entries.has(name)) throw new Error(`zip_duplicate_entry:${name}`)
    entries.set(name, data)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
