/**
 * Stage one of the gallery's registration: what the `noven.workbench` tab
 * type IS. A page type, not a viewer — it claims no address; the images it
 * shows stay files, and opening one elsewhere goes through the standard
 * `dsh-resource://file` viewers.
 * @module noven-workbench/client/definition
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const WORKBENCH_KIND = 'noven.workbench'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const WORKBENCH_ID = 'noven/workbench'

/**
 * The gallery type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function workbenchDefinition(t: TranslateNS<'novenWorkbench'>): SidebarRightTabDefinition {
  return {
    id: WORKBENCH_ID,
    kind: WORKBENCH_KIND,
    title: () => t('type.label'),
    guide: [{
      id: 'noven-gallery',
      order: 30,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
    }],
  }
}
