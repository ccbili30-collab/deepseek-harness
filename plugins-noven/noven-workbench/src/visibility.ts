/**
 * Workbench visibility matching (CreatX registry V3 port): `*` matches inside
 * one path segment, `**` matches across segments, `?` one character. Patterns
 * are normalized workbench-relative paths (`/` separators, no leading slash).
 * A file is visible when it matches at least one include (or include is
 * empty) and no exclude; when `autoIncludeNewFiles` is off the frozen `files`
 * list is the complete answer instead.
 * @module noven-workbench/visibility
 */
import type { WorkbenchVisibility } from './registry.ts'

/** Compile one glob pattern into a segment-aware matcher. */
function compile(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map(segment => segment
      .replace(/[.+^${}()|[\]\\]/gu, ch => `\\${ch}`)
      .replace(/\*\*/gu, '')
      .replace(/\*/gu, '[^/]*')
      .replace(/\?/gu, '[^/]')
      .replace(//gu, '.*'))
    .join('/')
  return new RegExp(`^${source}$`, 'u')
}

/**
 * Build the visibility predicate for one workbench record.
 * @param visibility - the record's visibility spec, or undefined for "show everything".
 * @returns a predicate over workbench-relative file paths.
 */
export function visibilityMatcher(visibility: WorkbenchVisibility | undefined): (rel: string) => boolean {
  if (visibility === undefined) return () => true
  if (!visibility.autoIncludeNewFiles) {
    const frozen = new Set((visibility.files ?? []).map(rel => rel.normalize('NFC')))
    return rel => frozen.has(rel.normalize('NFC'))
  }
  const include = visibility.include.map(compile)
  const exclude = visibility.exclude.map(compile)
  return rel => (include.length === 0 || include.some(re => re.test(rel)))
    && !exclude.some(re => re.test(rel))
}
