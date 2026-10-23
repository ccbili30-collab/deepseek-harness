/**
 * About & updates settings page: current version, release channel, a manifest
 * check that works before Desktop packaging, and the repository releases link.
 * @module noven-shell/client/settings/UpdatesSection
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isNewerVersion, manifestUrl, normalizeManifest, type UpdateChannel, type UpdateManifest } from '../update-check.ts'

const CHANNEL_KEY = 'noven.update.channel'
const BASE_KEY = 'noven.update.manifestBase'
const REPOSITORY = 'https://github.com/ccbili30-collab/noven-pc/releases'

type Status = 'idle' | 'checking' | 'current' | 'available' | 'unconfigured' | 'error'

function readStored(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

function writeStored(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* private mode: the choice simply does not persist */ }
}

function runningVersion(): string {
  try {
    return typeof process !== 'undefined' && typeof process.env?.DSH_CLIENT_VERSION === 'string'
      ? process.env.DSH_CLIENT_VERSION
      : 'dev'
  } catch {
    return 'dev'
  }
}

/**
 * Render the About & updates page.
 * @param props - slot runtime and localized copy.
 * @returns the settings section.
 */
export function UpdatesSection({ t }: PropsRuntime<'settings.section'> & PropsLocale<'novenShell'>) {
  const current = runningVersion()
  const [channel, setChannel] = useState<UpdateChannel>(() => readStored(CHANNEL_KEY) === 'beta' ? 'beta' : 'stable')
  const [base, setBase] = useState(() => readStored(BASE_KEY))
  const [draftBase, setDraftBase] = useState(() => readStored(BASE_KEY))
  const [status, setStatus] = useState<Status>('idle')
  const [manifest, setManifest] = useState<UpdateManifest | undefined>(undefined)
  const [lastChecked, setLastChecked] = useState<Date | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saved, setSaved] = useState(false)

  useEffect(() => { writeStored(CHANNEL_KEY, channel) }, [channel])
  useEffect(() => { setStatus('idle'); setManifest(undefined); setError(undefined) }, [channel])

  const compareBase = useMemo(() => base.trim().replace(/\/+$/u, ''), [base])

  const check = useCallback(async (): Promise<void> => {
    if (compareBase === '') { setStatus('unconfigured'); return }
    setStatus('checking')
    setError(undefined)
    setManifest(undefined)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(manifestUrl(compareBase, channel), {
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const next = normalizeManifest(await response.json())
      if (next === undefined) throw new Error(t('updates.invalid'))
      setManifest(next)
      setLastChecked(new Date())
      const running = current === 'dev' ? '0.0.0-dev' : current
      setStatus(isNewerVersion(next.version, running) ? 'available' : 'current')
    } catch (reason: unknown) {
      setError(reason instanceof Error && reason.name === 'AbortError' ? t('updates.timeout') : t('updates.error'))
      setStatus('error')
    } finally {
      window.clearTimeout(timer)
    }
  }, [channel, compareBase, current, t])

  const download = manifest?.url ?? REPOSITORY
  return (
    <div className="nv-upd">
      <header className="nv-upd-head">
        <h2 className="nv-upd-title">{t('updates.title')}</h2>
        <p className="nv-upd-lead">{t('updates.lead')}</p>
      </header>

      <section className="nv-upd-card">
        <div className="nv-upd-row">
          <span className="nv-upd-label">{t('updates.current')}</span>
          <span className="nv-upd-value">{current}</span>
        </div>
        <div className="nv-upd-field">
          <span className="nv-upd-label">{t('updates.channel')}</span>
          <div className="nv-upd-channels" role="radiogroup" aria-label={t('updates.channel')}>
            {(['stable', 'beta'] as const).map(item => (
              <button key={item} type="button" role="radio" aria-checked={channel === item}
                className="nv-upd-channel" data-on={channel === item || undefined}
                onClick={() => setChannel(item)}>
                <strong>{t(item === 'stable' ? 'updates.stable' : 'updates.beta')}</strong>
                <small>{t(item === 'stable' ? 'updates.stable.hint' : 'updates.beta.hint')}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="nv-upd-actions">
          <button type="button" className="nv-upd-check" onClick={() => { void check() }} disabled={status === 'checking'}>
            {status === 'checking' ? t('updates.checking') : t('updates.check')}
          </button>
          <a className="nv-upd-link" href={REPOSITORY} target="_blank" rel="noreferrer">{t('updates.github')}</a>
        </div>
        <p className="nv-upd-status" data-status={status}>
          {status === 'unconfigured' && t('updates.unconfigured')}
          {status === 'current' && t('updates.upToDate')}
          {status === 'available' && manifest !== undefined && t('updates.available', { version: manifest.version })}
          {status === 'error' && (error ?? t('updates.error'))}
          {status === 'idle' && (lastChecked === undefined ? t('updates.never') : t('updates.lastChecked', { time: lastChecked.toLocaleString() }))}
          {status === 'checking' && t('updates.checkingHint')}
        </p>
        {lastChecked !== undefined && status !== 'idle' && (
          <p className="nv-upd-last">{t('updates.lastChecked', { time: lastChecked.toLocaleString() })}</p>
        )}
      </section>

      {manifest !== undefined && status === 'available' && (
        <section className="nv-upd-card nv-upd-release">
          <div className="nv-upd-releasehead">
            <strong>{manifest.version}</strong>
            {manifest.publishedAt !== undefined && <span>{new Date(manifest.publishedAt).toLocaleDateString()}</span>}
          </div>
          <p className="nv-upd-notes">{manifest.notes ?? t('updates.noNotes')}</p>
          <a className="nv-upd-check" href={download} target="_blank" rel="noreferrer">{t('updates.download')}</a>
        </section>
      )}

      <p className="nv-upd-note">{t('updates.privateNote')}</p>

      <details className="nv-upd-advanced">
        <summary>{t('updates.advanced')}</summary>
        <p className="nv-upd-hint">{t('updates.baseHint')}</p>
        <div className="nv-upd-base">
          <input value={draftBase} placeholder="https://example.com/noven/updates"
            aria-label={t('updates.base')} onChange={event => { setDraftBase(event.target.value); setSaved(false) }} />
          <button type="button" onClick={() => {
            const next = draftBase.trim().replace(/\/+$/u, '')
            setBase(next)
            writeStored(BASE_KEY, next)
            setSaved(true)
          }}>{saved ? t('updates.saved') : t('updates.save')}</button>
        </div>
      </details>
    </div>
  )
}
