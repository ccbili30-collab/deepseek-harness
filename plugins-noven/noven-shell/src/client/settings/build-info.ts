/**
 * Product identity baked into the client bundle at build time.
 *
 * `NOVEN_BUILD_ID` is the release identity (date + short commit); the version
 * field stays a constant until the product needs real semantic versioning.
 */

/** Product version shown in About; build IDs carry release identity. */
export const NOVEN_VERSION = pick(process.env.NOVEN_VERSION, '0.1.0')

/** One build's identity: `YYYYMMDD-<short commit>` (or `dev`). */
export const NOVEN_BUILD_ID = pick(process.env.NOVEN_BUILD_ID, 'dev')

/** DSH kernel version this client bundle was built against. */
export const NOVEN_KERNEL_VERSION = pick(process.env.NOVEN_KERNEL_VERSION, 'dev')

/** The bundle define replaces each argument before this function runs. */
function pick(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback
}
