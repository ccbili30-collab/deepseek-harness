/**
 * The Noven image-generation settings page: endpoint, model, output folder,
 * and the key — which is written through the credentials domain, never into
 * the settings section, so the literal never rides a response.
 */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { useState } from 'react'
import { Button, SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const [models, setModels] = useState<readonly string[] | undefined>(undefined)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | undefined>(undefined)

  const fetchModels = async (): Promise<void> => {
    setFetching(true)
    setFetchError(undefined)
    try {
      const response = await fetch('/api/noven-image-models', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ base: state.baseURL.text, apiKey: state.apiKey.text }),
      })
      const payload = await response.json() as { models?: string[], error?: string }
      if (!response.ok) {
        setFetchError(payload.error ?? `${t('fetchFailed')} (${String(response.status)})`)
        setModels(undefined)
        return
      }
      const found = payload.models ?? []
      if (found.length === 0) {
        setFetchError(t('fetchEmpty'))
        setModels(undefined)
        return
      }
      setModels(found)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : t('fetchFailed'))
      setModels(undefined)
    } finally {
      setFetching(false)
    }
  }

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -6, paddingBottom: 12 }}>
        <Button size="sm" variant="outline" disabled={disabled || fetching} onClick={() => { void fetchModels() }}>
          {fetching ? t('fetching') : t('fetchModels')}
        </Button>
        {models !== undefined && <select
          aria-label={t('model')}
          value=""
          onChange={(event) => {
            if (event.target.value !== '') props.edit('model', event.target.value)
          }}
          style={{
            padding: '4px 8px', border: '0.5px solid var(--dsw-alias-border-l4)', borderRadius: 'var(--dsw-radius-md)',
            background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', maxWidth: 320,
          }}
        >
          <option value="">{t('pickModel')}</option>
          {models.map(id => <option key={id} value={id}>{id}</option>)}
        </select>}
        {fetchError !== undefined && <span role="status" style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 }}>{fetchError}</span>}
      </div>
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
