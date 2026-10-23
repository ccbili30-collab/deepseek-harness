/**
 * Update manifest parsing and version comparison for the About & updates page.
 * Pure functions only: the page owns storage, network, and rendering.
 * @module noven-shell/client/update-check
 */

/** Release track the user selected. */
export type UpdateChannel = 'stable' | 'beta'

/** One channel manifest published beside the installers. */
export interface UpdateManifest {
  readonly version: string
  readonly publishedAt?: string
  readonly notes?: string
  /** Optional download page for this release; falls back to the repository releases page. */
  readonly url?: string
  /** Optional per-platform download URLs. */
  readonly assets?: Readonly<Record<string, string>>
}

/** Parse and validate one manifest document; malformed input is undefined. */
export function normalizeManifest(raw: unknown): UpdateManifest | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  if (typeof value.version !== 'string' || value.version.trim() === '') return undefined
  const assets = value.assets
  if (assets !== undefined && (assets === null || typeof assets !== 'object' || Array.isArray(assets))) return undefined
  const normalizedAssets: Record<string, string> = {}
  for (const [key, target] of Object.entries(assets ?? {})) {
    if (typeof target === 'string' && target !== '') normalizedAssets[key] = target
  }
  return {
    version: value.version.trim(),
    ...(typeof value.publishedAt === 'string' && value.publishedAt !== '' ? { publishedAt: value.publishedAt } : {}),
    ...(typeof value.notes === 'string' && value.notes !== '' ? { notes: value.notes } : {}),
    ...(typeof value.url === 'string' && value.url !== '' ? { url: value.url } : {}),
    ...(Object.keys(normalizedAssets).length === 0 ? {} : { assets: normalizedAssets }),
  }
}

/** Split a semantic version into numeric core parts and prerelease identifiers. */
function splitVersion(value: string): { core: number[], pre: string[] } | undefined {
  const clean = value.trim().replace(/^v/u, '')
  const [corePart, ...preParts] = clean.split('-')
  if (corePart === undefined || corePart === '') return undefined
  const core = corePart.split('.')
  if (core.some(part => !/^\d+$/u.test(part))) return undefined
  const pre = preParts.join('-').split('.').filter(part => part !== '')
  return { core: core.map(Number), pre }
}

/** Compare two semantic versions; returns -1, 0, or 1. */
export function compareVersions(left: string, right: string): number {
  const a = splitVersion(left)
  const b = splitVersion(right)
  if (a === undefined || b === undefined) return 0
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    const delta = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  // A release outranks its own prereleases.
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const x = a.pre[index]
    const y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/u.test(x)
    const yNumeric = /^\d+$/u.test(y)
    if (xNumeric && yNumeric) {
      const delta = Number(x) - Number(y)
      if (delta !== 0) return delta > 0 ? 1 : -1
      continue
    }
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** Whether a manifest version is newer than the running client. */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0
}

/** Resolve the channel manifest URL from a base directory. */
export function manifestUrl(base: string, channel: UpdateChannel): string {
  return `${base.trim().replace(/\/+$/u, '')}/${channel}.json`
}
