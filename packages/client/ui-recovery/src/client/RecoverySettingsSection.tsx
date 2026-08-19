/** Full checkpoint administration surface inside Settings. */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RecoveryOverview } from '@deepseek-ai/dsh-api-remotes/client'
import type { RecoveryCenterFace } from './types.ts'
import css from './RecoverySettingsSection.module.css'

export type RecoverySettingsSectionProps = PropsRuntime<'settings.section'>
  & InjectFace<RecoveryCenterFace> & PropsLocale<'recovery'>

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Render checkpoint history, verification, and exact-id restore confirmation. */
export function RecoverySettingsSection({ list, create, verify, restore, t }: RecoverySettingsSectionProps) {
  const [overview, setOverview] = useState<RecoveryOverview>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [restarting, setRestarting] = useState(false)

  const refresh = async (): Promise<void> => {
    setError('')
    try { setOverview(await list()) } catch (cause) { setError(messageOf(cause)) }
  }

  useEffect(() => { void refresh() }, [])

  const perform = async (key: string, action: () => Promise<void>): Promise<void> => {
    /* v8 ignore next -- every settings action is disabled for the complete busy interval. */
    if (busy !== '') return
    setBusy(key)
    setError('')
    try { await action() } catch (cause) { setError(messageOf(cause)) } finally { setBusy('') }
  }

  return (
    <section className={css.section} aria-label={t('settingsTitle')}>
      <header className={css.header}>
        <div><h2>{t('settingsTitle')}</h2><p>{t('settingsIntro')}</p></div>
        <button
          type="button"
          className={css.create}
          disabled={busy !== '' || overview?.available !== true || restarting}
          onClick={() => { void perform('create', async () => { await create(); await refresh() }) }}
        >{busy === 'create' ? t('creating') : t('create')}</button>
      </header>
      <div className={css.meta}>
        {overview !== undefined && <><span>{t('sourceLocation')}</span><code>{overview.sourceRoot || '—'}</code><span>{t('storeLocation')}</span><code>{overview.storeRoot}</code></>}
      </div>
      {overview?.available === false && <p className={css.warning}>{t('unavailable', { reason: overview.unavailableReason })}</p>}
      {error !== '' && <p className={css.error}>{error}</p>}
      {restarting && <p className={css.success}>{t('restarting')}</p>}
      {overview !== undefined && overview.checkpoints.length === 0 && <p className={css.empty}>{t('empty')}</p>}
      <ul className={css.rows}>
        {overview?.checkpoints.map(checkpoint => (
          <li key={checkpoint.id} className={css.row} data-corrupt={checkpoint.status === 'corrupt' || undefined}>
            <div className={css.rowHead}>
              <code>{checkpoint.id}</code>
              <span>{checkpoint.status === 'corrupt' ? t('corrupt') : checkpoint.reason === 'pre-restore' ? t('preRestore') : t('manual')}</span>
            </div>
            {checkpoint.label !== '' && <p>{checkpoint.label}</p>}
            <small>{checkpoint.status === 'corrupt' ? checkpoint.error : `${new Date(checkpoint.createdAt).toLocaleString()} · ${t('files', { count: checkpoint.sourceFiles + checkpoint.dshFiles })}`}</small>
            {confirming === checkpoint.id ? (
              <div className={css.confirm}>
                <strong>{t('confirmTitle')}</strong>
                <p>{t('confirmHint')}</p>
                <input
                  autoFocus
                  value={confirmation}
                  placeholder={t('confirmPlaceholder')}
                  onChange={(event) => { setConfirmation(event.target.value) }}
                />
                <div className={css.actions}>
                  <button type="button" onClick={() => { setConfirming(''); setConfirmation('') }}>{t('cancel')}</button>
                  <button
                    type="button"
                    className={css.danger}
                    disabled={confirmation !== checkpoint.id || busy !== ''}
                    onClick={() => { void perform(`restore:${checkpoint.id}`, async () => {
                      await restore(checkpoint.id)
                      setRestarting(true)
                    }) }}
                  >{t('confirmAction')}</button>
                </div>
              </div>
            ) : checkpoint.status === 'published' && (
              <div className={css.actions}>
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => { void perform(`verify:${checkpoint.id}`, async () => {
                    await verify(checkpoint.id)
                    setVerified(current => new Set(current).add(checkpoint.id))
                  }) }}
                >{verified.has(checkpoint.id) ? t('verified') : t('verify')}</button>
                <button
                  type="button"
                  className={css.dangerText}
                  disabled={busy !== '' || !overview.available}
                  onClick={() => { setConfirming(checkpoint.id); setConfirmation('') }}
                >{t('restore')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
