/** Recovery Center sidebar composition. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { RecoveryCenter } from './RecoveryCenter.tsx'
import { RecoverySettingsSection } from './RecoverySettingsSection.tsx'
import type { RecoveryCenterFace } from './types.ts'
import { en, NS, zh } from './locales.ts'

export type { RecoveryCenterFace } from './types.ts'
export type { RecoveryCenterProps } from './RecoveryCenter.tsx'
export type { RecoverySettingsSectionProps } from './RecoverySettingsSection.tsx'

export const inject = ['slots', 'locale', 'remote', 'remote.recovery']

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Register the power-style entry beside Settings (above it on the rail). */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-recovery: dictionaries')
  const injected = (): RecoveryCenterFace => ({
    list: async () => unwrap(await ctx.remote.recovery.list()),
    create: async () => unwrap(await ctx.remote.recovery.create('Manual checkpoint')),
    verify: async snapshot => unwrap(await ctx.remote.recovery.verify(snapshot)),
    restore: async snapshot => unwrap(await ctx.remote.recovery.scheduleRestore(snapshot)),
    shutdown: async () => unwrap(await ctx.remote.recovery.shutdown()),
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'recovery-center',
    locale: NS,
    inject: injected,
  }, RecoveryCenter))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'recovery',
    order: 40,
    label: () => ctx.locale.bind(NS)('settingsNav'),
    locale: NS,
    inject: injected,
  }, RecoverySettingsSection))
}
