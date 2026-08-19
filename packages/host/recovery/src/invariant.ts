/** Package-owned invariant companion. @module @deepseek-ai/dsh-host-recovery/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-recovery'
export const name = 'host-recovery-invariant'
export const inject = ['invariants']
/** No runtime invariant: the external checkpoint store is authoritative and each endpoint is request-scoped. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
