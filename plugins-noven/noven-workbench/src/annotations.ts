/**
 * Image-annotation sidecars — one JSON document per annotated image, stored
 * under the project's `.noven/annotations/` tree mirroring the image's
 * workspace-relative path (`视觉/x.png` → `.noven/annotations/视觉/x.png.json`).
 * Coordinates are fractions of the rendered image (0..1), so overlays scale
 * with any display size.
 *
 * The annotation route (see index.ts) is the only writer; the model is never
 * asked to hand-edit these files.
 * @module noven-workbench/annotations
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { ledgerDir, liftTree } from 'noven-ledger'

/** One rectangle annotation over an image. */
export interface AnnotationRecord {
  readonly id: string
  /** Left edge, fraction of image width (0..1). */
  readonly x: number
  /** Top edge, fraction of image height (0..1). */
  readonly y: number
  /** Width, fraction of image width (0..1). */
  readonly w: number
  /** Height, fraction of image height (0..1). */
  readonly h: number
  readonly text: string
  readonly created: number
}

/** The sidecar document for one image. */
export interface AnnotationDoc {
  version: 1
  image: string
  annotations: readonly AnnotationRecord[]
}

/** The route rejects a payload with this; the message is shown to the user. */
export class AnnotationValidationError extends Error {}

/** Hard cap on one sidecar, so a runaway client cannot bloat the project. */
const MAX_ANNOTATIONS = 100

/**
 * Normalize a workspace-relative image path, or reject it.
 * @param path - the path as the client sent it.
 * @returns the normalized path, or undefined when it tries to escape.
 */
export function safeImageRel(path: string): string | undefined {
  if (path.length === 0 || path.length > 512 || path.includes('\0')) return undefined
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/u.test(normalized)) return undefined
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.')
  if (parts.length === 0 || parts.includes('..')) return undefined
  return parts.join('/')
}

/** Absolute sidecar path for one image — app-side under the project's ledger; the legacy `.noven/annotations/` tree is lifted once. */
export async function annotationPath(projectRoot: string, imageRel: string): Promise<string> {
  const dir = join(await ledgerDir(projectRoot), 'annotations')
  await liftTree(join(projectRoot, '.noven', 'annotations'), dir)
  return join(dir, `${imageRel}.json`)
}

/** The empty document for an image nothing has annotated yet. */
export function emptyAnnotationDoc(imageRel: string): AnnotationDoc {
  return { version: 1, image: imageRel, annotations: [] }
}

/**
 * Load one image's sidecar.
 * @param projectRoot - the session workspace root.
 * @param imageRel - the image's workspace-relative path.
 * @returns the stored document, or undefined when none exists yet.
 */
export async function readAnnotations(projectRoot: string, imageRel: string): Promise<AnnotationDoc | undefined> {
  let raw: string
  try {
    raw = await readFile(await annotationPath(projectRoot, imageRel), 'utf8')
  } catch {
    return undefined
  }
  return parseAnnotationDoc(JSON.parse(raw), imageRel)
}

/**
 * Persist one image's sidecar through a temp file + rename.
 * @param projectRoot - the session workspace root.
 * @param imageRel - the image's workspace-relative path.
 * @param doc - the validated document.
 */
export async function writeAnnotations(projectRoot: string, imageRel: string, doc: AnnotationDoc): Promise<void> {
  // Belt and braces: the rel-path check already forbade escape, but the write
  // refuses to land anywhere but under the ledger's annotations/ regardless.
  const folder = resolve(join(await ledgerDir(projectRoot), 'annotations'))
  const target = resolve(await annotationPath(projectRoot, imageRel))
  if (target !== folder && !target.startsWith(`${folder}${sep}`)) {
    throw new AnnotationValidationError('sidecar escapes the annotations folder')
  }
  const temp = join(dirname(target), `.${Math.random().toString(36).slice(2)}.noven-tmp`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temp, `${JSON.stringify(doc, null, 2)}\n`)
  await rename(temp, target)
}

/**
 * Validate an untrusted payload into a storable document.
 * @param raw - the parsed request body.
 * @param imageRel - the image path the query named; the document is keyed to it.
 * @returns the validated document.
 * @throws AnnotationValidationError when the payload is malformed.
 */
export function parseAnnotationDoc(raw: unknown, imageRel: string): AnnotationDoc {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AnnotationValidationError('body must be an object')
  }
  const list = (raw as Record<string, unknown>).annotations
  if (!Array.isArray(list)) throw new AnnotationValidationError('annotations must be an array')
  if (list.length > MAX_ANNOTATIONS) throw new AnnotationValidationError(`too many annotations (max ${String(MAX_ANNOTATIONS)})`)
  const seen = new Set<string>()
  const annotations = list.map((item): AnnotationRecord => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new AnnotationValidationError('each annotation must be an object')
    }
    const a = item as Record<string, unknown>
    const id = typeof a.id === 'string' ? a.id : ''
    if (id.length === 0 || id.length > 64 || seen.has(id)) {
      throw new AnnotationValidationError('annotation ids must be unique strings (max 64 chars)')
    }
    seen.add(id)
    const { x, y, w, h } = a
    if (![x, y, w, h].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) {
      throw new AnnotationValidationError('x/y/w/h must be fractions in [0,1]')
    }
    if ((w as number) <= 0 || (h as number) <= 0) {
      throw new AnnotationValidationError('w/h must be positive')
    }
    const text = typeof a.text === 'string' ? a.text : ''
    if (text.length > 500) throw new AnnotationValidationError('text too long (max 500 chars)')
    const created = typeof a.created === 'number' && Number.isFinite(a.created) ? a.created : Date.now()
    return { id, x: x as number, y: y as number, w: w as number, h: h as number, text, created }
  })
  return { version: 1, image: imageRel, annotations }
}
