/** PNG-entry ICO encoding shared by committed and channel-specific icon generation. */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICON_DIRECTORY_BYTES = 6
const ICON_ENTRY_BYTES = 16

/** @typedef {{ readonly size: number, readonly png: Buffer }} IcoEntry */

function pngDimensions(png) {
  if (png.length < 24 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('tray icon: bitmap is not a PNG stream')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/**
 * Pack PNG bitmaps into one ICO file.
 * @param {readonly IcoEntry[]} entries - Bitmaps in ascending size; each PNG must be square with the declared edge.
 * @returns {Buffer} The encoded ICO bytes.
 */
export function packIco(entries) {
  const header = Buffer.alloc(ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((entry, index) => {
    if (entry.size < 1 || entry.size > 256) throw new Error(`tray icon: unsupported bitmap edge ${String(entry.size)}`)
    const { width, height } = pngDimensions(entry.png)
    if (width !== entry.size || height !== entry.size) {
      throw new Error(`tray icon: bitmap ${String(index)} is ${String(width)}x${String(height)}, expected ${String(entry.size)}`)
    }
    const at = ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * index
    header.writeUInt8(entry.size % 256, at)
    header.writeUInt8(entry.size % 256, at + 1)
    header.writeUInt8(0, at + 2)
    header.writeUInt8(0, at + 3)
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(entry.png.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })
  return Buffer.concat([header, ...entries.map(entry => entry.png)])
}

/**
 * Read the bitmaps back out of one ICO file.
 * @param {Buffer} ico - Bytes written by packIco or another PNG-entry ICO producer.
 * @returns {IcoEntry[]} Entries in directory order, each checked against its declared edge.
 */
export function unpackIco(ico) {
  if (ico.length < ICON_DIRECTORY_BYTES || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
    throw new Error('tray icon: not an ICO file')
  }
  const count = ico.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const at = ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * index
    const declared = ico.readUInt8(at)
    const size = declared === 0 ? 256 : declared
    const length = ico.readUInt32LE(at + 8)
    const offset = ico.readUInt32LE(at + 12)
    const png = ico.subarray(offset, offset + length)
    const { width, height } = pngDimensions(png)
    if (width !== size || height !== size) throw new Error(`tray icon: entry ${String(index)} declares ${String(size)} but holds ${String(width)}x${String(height)}`)
    return { size, png }
  })
}
