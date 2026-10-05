/**
 * Infer a work kind from a file name's extension. Callers may always override
 * the inference; `other` covers anything unrecognized.
 * @module noven-library/kind
 */
import { extname } from 'node:path'
import type { WorkKind } from './model.ts'

const BY_EXT: Record<string, WorkKind> = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.md': 'text',
  '.txt': 'text',
  '.markdown': 'text',
  '.novexmap': 'map',
  '.novexcomic': 'comic',
  '.novex': 'card',
  '.zip': 'card',
}

/** Best-effort kind for a workspace file; `other` when the extension is unknown. */
export function inferKind(path: string): WorkKind {
  return BY_EXT[extname(path).toLowerCase()] ?? 'other'
}
