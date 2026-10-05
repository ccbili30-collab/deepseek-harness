/**
 * noven-brand browser half — fills the generic brand slots with the Noven
 * mark and wordmark, mirroring how @deepseek-ai/dsh-client-ui-brand-official
 * occupies them for the official build.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
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

/**
 * Blank-session hero brand block: the Noven seal over the wordmark and the
 * product tagline. The host still renders its own headline text beside this
 * seat; noven-shell's sheet hides that native title group so this block is
 * the only hero headline.
 */
export function NovenHeroBrand({ size }: HeroBrandMarkOwnerProps) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <NovenMark size={Math.max(size, 40)} />
      <NovenName />
      <span style={{ fontSize: '0.5em', fontWeight: 400, opacity: 0.55, letterSpacing: '0.04em' }}>让创作更简单</span>
    </span>
  )
}

/** Fill the sidebar and hero brand slots once their declaring entries are up. */
export function apply(ctx: ClientContext): void {
  document.title = '诺文 Noven'
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, NovenMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, NovenName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, NovenHeroBrand)
      })))
}
