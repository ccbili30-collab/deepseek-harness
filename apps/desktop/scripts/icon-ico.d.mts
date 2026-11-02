/** One square PNG bitmap and its declared ICO edge length. */
export interface IcoEntry {
  readonly size: number
  readonly png: Buffer
}

/** Pack PNG bitmaps into one ICO file. */
export function packIco(entries: readonly IcoEntry[]): Buffer

/** Read PNG bitmaps from one ICO file. */
export function unpackIco(ico: Buffer): IcoEntry[]
