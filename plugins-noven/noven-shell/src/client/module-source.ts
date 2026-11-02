/**
 * Session-scoped addresses for inline card modules. Authored references stay
 * small (`card:<cardId>/<moduleId>`); the container adds the Session and root.
 * @module noven-shell/client/module-source
 */

/** The two object ids named by an authored module reference. */
export interface ModuleReference {
  readonly cardId: string
  readonly moduleId: string
}

/** A resolved card endpoint plus the display scope encoded by the container. */
export interface ResolvedModuleSource extends ModuleReference {
  readonly endpoint: string
  readonly sessionId: string
  readonly workspaceRoot: string
}

/**
 * Parse one authored module reference.
 * @param src - `card:<cardId>/<moduleId>` reference from a directive.
 * @returns The two ids, or undefined for another or incomplete reference.
 */
export function parseModuleReference(src: string): ModuleReference | undefined {
  const match = /^card:([^/]+)\/([^/]+)$/u.exec(src)
  const cardId = match?.[1]?.trim() ?? ''
  const moduleId = match?.[2]?.trim() ?? ''
  return cardId === '' || moduleId === '' ? undefined : { cardId, moduleId }
}

/**
 * Resolve an authored reference for the viewed workspace.
 * @param src - Authored `card:` reference.
 * @param sessionId - Session whose card API reads the object.
 * @param workspaceRoot - Workspace root used for card resource URLs.
 * @returns A card API address with the module id in its fragment.
 */
export function resolveModuleSource(src: string, sessionId: string, workspaceRoot: string | undefined): string | undefined {
  const ref = parseModuleReference(src)
  if (ref === undefined || sessionId === '') return undefined
  const params = new URLSearchParams({ session: sessionId, card: ref.cardId })
  if (workspaceRoot !== undefined && workspaceRoot !== '') params.set('root', workspaceRoot)
  return `/api/noven-cards?${params.toString()}#module=${encodeURIComponent(ref.moduleId)}`
}

/**
 * Read a resolved module address at the browser/wire boundary.
 * @param src - Address produced by resolveModuleSource.
 * @param base - Base used for relative addresses.
 * @returns The fetch endpoint and display scope, or undefined for an invalid address.
 */
export function readModuleSource(src: string, base = 'http://noven.local'): ResolvedModuleSource | undefined {
  try {
    const url = new URL(src, base)
    if (url.pathname !== '/api/noven-cards') return undefined
    const cardId = url.searchParams.get('card') ?? ''
    const sessionId = url.searchParams.get('session') ?? ''
    const moduleId = new URLSearchParams(url.hash.slice(1)).get('module') ?? ''
    if (cardId === '' || sessionId === '' || moduleId === '') return undefined
    return {
      endpoint: `${url.pathname}${url.search}`,
      sessionId,
      workspaceRoot: url.searchParams.get('root') ?? '',
      cardId,
      moduleId,
    }
  } catch {
    return undefined
  }
}
