/**
 * noven-brand browser half — fills the generic brand slots with the Noven
 * mark and wordmark, mirroring how @deepseek-ai/dsh-client-ui-brand-official
 * occupies them for the official build.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NovenMark } from './NovenMark.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/** The Noven wordmark: the Chinese name with the Latin name as its companion. */
export function NovenName() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.375em', fontWeight: 600 }}>
      <span>诺文</span>
      <span style={{ fontWeight: 400, opacity: 0.66, fontSize: '0.72em', letterSpacing: '0.08em' }}>Noven</span>
    </span>
  )
}

/** Fill the sidebar brand slots once their declaring entries are up. */
export function apply(ctx: ClientContext): void {
  document.title = '诺文 Noven'
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, NovenMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, NovenName)
    }))
}
