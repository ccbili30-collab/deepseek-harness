/** Compact sidebar power menu for recovery and clean shutdown. */

import { useLayoutEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { Tooltip, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RecoveryOverview } from '@deepseek-ai/dsh-api-remotes/client'
import type { RecoveryCenterFace } from './types.ts'
import css from './RecoveryCenter.module.css'

export type RecoveryCenterProps = PropsRuntime<'sidebar.footer.action'>
  & InjectFace<RecoveryCenterFace> & PropsLocale<'recovery'>

function PowerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path d="M12 3v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.2 5.8a8 8 0 1 0 9.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CreateIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}

function RestoreIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden><path d="M5 8v5h5M6.4 12.7a6.8 6.8 0 1 0 1.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Render a Windows-style three-action power menu. */
export function RecoveryCenter({ wide, list, create, restore, shutdown, t }: RecoveryCenterProps) {
  const [open, setOpen] = useState(false)
  const [overview, setOverview] = useState<RecoveryOverview>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState<'restore' | 'shutdown'>()
  const [departing, setDeparting] = useState<'restore' | 'shutdown'>()
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>()
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsidePointer(rootRef, open && departing === undefined, setOpen)

  const refresh = async (): Promise<void> => {
    setError('')
    try { setOverview(await list()) } catch (cause) { setError(messageOf(cause)) }
  }

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const rect = rootRef.current?.getBoundingClientRect()
      /* v8 ignore next -- the layout effect runs only after React attaches the unconditional root ref. */
      if (rect !== undefined) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [open])

  const perform = async (key: string, action: () => Promise<void>): Promise<void> => {
    /* v8 ignore next -- every action control is disabled for the complete busy interval. */
    if (busy !== '') return
    setBusy(key)
    setError('')
    setNotice('')
    try { await action() } catch (cause) { setError(messageOf(cause)) } finally { setBusy('') }
  }

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    setConfirming(undefined)
    setError('')
    setNotice('')
    if (next) void refresh()
  }

  const latest = overview?.checkpoints.find(checkpoint => checkpoint.status === 'published')

  return (
    <div ref={rootRef} className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <Tooltip label={t('trigger')} delayMs={500}>
        <button type="button" className={css.trigger} aria-label={t('trigger')} data-active={open || undefined} onClick={toggle}>
          <PowerIcon />
        </button>
      </Tooltip>
      {open && anchor !== undefined && (
        <section className={css.panel} style={anchor} aria-label={t('quickTitle')}>
          {departing !== undefined ? (
            <p className={css.departing}>{t(departing === 'restore' ? 'restarting' : 'stopping')}</p>
          ) : confirming !== undefined ? (
            <div className={css.confirm}>
              <strong>{t(confirming === 'restore' ? 'quickRestoreConfirm' : 'quickShutdownConfirm')}</strong>
              {confirming === 'restore' && latest !== undefined && <code>{latest.id}</code>}
              <div className={css.confirmActions}>
                <button type="button" onClick={() => { setConfirming(undefined) }}>{t('cancel')}</button>
                <button
                  type="button"
                  className={css.danger}
                  disabled={busy !== ''}
                  onClick={() => { void perform(confirming, async () => {
                    if (confirming === 'restore') {
                      /* v8 ignore next -- restore confirmation opens only from the enabled latest-checkpoint action. */
                      if (latest === undefined) return
                      await restore(latest.id)
                      setDeparting('restore')
                    } else {
                      await shutdown()
                      setDeparting('shutdown')
                    }
                  }) }}
                >{t(confirming === 'restore' ? 'quickRestoreAction' : 'quickShutdownAction')}</button>
              </div>
            </div>
          ) : (
            <>
              <div className={css.menu}>
                <button
                  type="button"
                  disabled={busy !== '' || overview?.available !== true}
                  onClick={() => { void perform('create', async () => {
                    const result = await create()
                    setNotice(t('quickCreated', { id: result.id }))
                    await refresh()
                  }) }}
                ><CreateIcon /><span>{busy === 'create' ? t('creating') : t('create')}</span></button>
                <button
                  type="button"
                  disabled={busy !== '' || latest === undefined || overview?.available !== true}
                  onClick={() => { setConfirming('restore') }}
                ><RestoreIcon /><span>{t('restore')}</span></button>
                <button
                  type="button"
                  className={css.shutdown}
                  disabled={busy !== ''}
                  onClick={() => { setConfirming('shutdown') }}
                ><PowerIcon size={18} /><span>{t('shutdown')}</span></button>
              </div>
              {notice !== '' && <p className={css.notice}>{notice}</p>}
              {latest === undefined && overview !== undefined && <p className={css.hint}>{t('quickNoCheckpoint')}</p>}
              {error !== '' && <p className={css.error}>{error}</p>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
