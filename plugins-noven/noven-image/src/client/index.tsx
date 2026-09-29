/**
 * noven-image browser half — the 生图 card on the Plugins settings page,
 * mirroring @deepseek-ai/dsh-client-ui-settings-web-search.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: the ctx.slots Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { NovenImageCard } from './NovenImageCard.tsx'
import { NOVEN_IMAGE_NS, NovenImageCardController } from './noven-image-card-controller.ts'
import { en, zh, type NovenImageSettingsLocaleKey } from './locales.ts'

export type { NovenImageCardProps } from './NovenImageCard.tsx'
export type { NovenImageCardFace, NovenImageCardState, NovenImageSettings } from './noven-image-card-controller.ts'
export type { NovenImageSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image-generation settings page copy. */
    'settings.novenImage': NovenImageSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.novenImage'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'configForms']

/**
 * Mount the image settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'noven-image: dictionaries')
  const card = new NovenImageCardController(ctx.configForms.get(NOVEN_IMAGE_NS), ctx)
  ctx.effect(() => () => { card.dispose() }, 'noven-image: form subscription')
  // The credential the page reports is not part of any settings section, so
  // its scope publishes nothing when one is written. This is the only signal
  // that a key written on another surface reached the Host.
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref: string) => { card.refreshCredential(ref) }),
    'noven-image: credential invalidations',
  )
  ctx.effect(() => ctx.configForms.whileServed([NOVEN_IMAGE_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'noven-image', order: 40, label: () => t('title'), locale: NS, inject: () => card.inject(),
  }, NovenImageCard))), 'noven-image: page')
}
