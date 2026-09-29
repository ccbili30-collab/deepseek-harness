/**
 * The Noven image-generation settings page: endpoint, model, output folder,
 * and the key — which is written through the credentials domain, never into
 * the settings section, so the literal never rides a response.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { NovenImageCardFace } from './noven-image-card-controller.ts'

/** Props the renderer binds for the image settings section. */
export type NovenImageSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.novenImage'>
  & InjectFace<NovenImageCardFace>

/**
 * Render the image provider's settings page as a top-level settings section.
 * @param props - section owner props, locale copy, the form snapshot, and its actions.
 * @returns the section page.
 */
export function NovenImageSection(props: NovenImageSectionProps) {
  const { t } = props
  const state = props.useNovenImageCard(snapshot => snapshot)
  const disabled = !state.writable
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsSecretField
        id="plugin-config-noven-image-key"
        label={t('apiKey')}
        hint={t('apiKeyHint')}
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('apiKeySet') : t('apiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <SettingsValueField
        id="plugin-config-noven-image-endpoint"
        label={t('baseUrl')}
        hint={t('baseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidValue')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <SettingsValueField
        id="plugin-config-noven-image-model"
        label={t('model')}
        hint={t('modelHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidValue')}
        disabled={disabled}
        {...state.model}
        onEdit={(text) => { props.edit('model', text) }}
        onReset={() => { props.resetField('model') }}
      />
      <SettingsValueField
        id="plugin-config-noven-image-output-dir"
        label={t('outputDir')}
        hint={t('outputDirHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidValue')}
        disabled={disabled}
        {...state.outputDir}
        onEdit={(text) => { props.edit('outputDir', text) }}
        onReset={() => { props.resetField('outputDir') }}
      />
      <SettingsValueField
        id="plugin-config-noven-image-key-env"
        label={t('apiKeyEnv')}
        hint={t('apiKeyEnvHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidValue')}
        disabled={disabled}
        {...state.apiKeyEnv}
        onEdit={(text) => { props.edit('apiKeyEnv', text) }}
        onReset={() => { props.resetField('apiKeyEnv') }}
      />
    </SettingsForm>
  )
}
