// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecoveryCenter } from '../src/client/RecoveryCenter.tsx'
import type { RecoveryCenterProps } from '../src/client/RecoveryCenter.tsx'
import { RecoverySettingsSection } from '../src/client/RecoverySettingsSection.tsx'
import { en, type RecoveryKey } from '../src/client/locales.ts'

afterEach(cleanup)

const checkpoint = {
  id: '20260819T010203.004Z-abcdef12',
  createdAt: '2026-08-19T01:02:03.004Z',
  reason: 'manual' as const,
  label: 'Known good',
  sourceFiles: 20,
  dshFiles: 2,
  status: 'published' as const,
  error: '',
}

const t = ((key: RecoveryKey, params?: Record<string, string | number>) => {
  let value: string = en[key]
  for (const [name, replacement] of Object.entries(params ?? {})) value = value.replace(`{${name}}`, String(replacement))
  return value
}) as RecoveryCenterProps['t']

function props(overrides: Partial<RecoveryCenterProps> = {}): RecoveryCenterProps {
  return {
    wide: true,
    t,
    list: vi.fn(async () => ({
      available: true,
      sourceRoot: '/source',
      storeRoot: '/recovery',
      checkpoints: [checkpoint],
      unavailableReason: '',
    })),
    create: vi.fn(async () => ({ id: checkpoint.id, files: 22, bytes: 100 })),
    verify: vi.fn(async (snapshot: string) => ({ id: snapshot, valid: true, files: 22, bytes: 100 })),
    restore: vi.fn(async (snapshot: string) => ({ accepted: true, snapshot, logPath: '/recovery/log' })),
    shutdown: vi.fn(async () => ({ accepted: true })),
    ...overrides,
  } as RecoveryCenterProps
}

describe('RecoveryCenter', () => {
  it('keeps the power entry to three compact actions', async () => {
    const value = props()
    render(<RecoveryCenter {...value} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(await screen.findByRole('button', { name: en.create })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.restore })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.shutdown })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en.verify })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.create }))
    await waitFor(() => { expect(value.create).toHaveBeenCalledOnce() })
    expect(await screen.findByText(en.quickCreated.replace('{id}', checkpoint.id))).toBeTruthy()
  })

  it('confirms quick restore of the latest published checkpoint', async () => {
    const value = props()
    render(<RecoveryCenter {...value} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('button', { name: en.restore })
    fireEvent.click(screen.getByRole('button', { name: en.restore }))
    expect(await screen.findByText(checkpoint.id)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.quickRestoreAction }))
    await waitFor(() => { expect(value.restore).toHaveBeenCalledWith(checkpoint.id) })
  })

  it('keeps exact-id restore and verification in the Settings section', async () => {
    const value = props()
    render(<RecoverySettingsSection {...value} close={vi.fn()} />)
    await screen.findByText(checkpoint.id)
    fireEvent.click(screen.getByRole('button', { name: en.verify }))
    expect(await screen.findByRole('button', { name: en.verified })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.restore }))
    const confirm = screen.getByRole('button', { name: en.confirmAction })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText(en.confirmPlaceholder), { target: { value: checkpoint.id } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => { expect(value.restore).toHaveBeenCalledWith(checkpoint.id) })
    expect(await screen.findByText(en.restarting)).toBeTruthy()
  })

  it('requires confirmation before clean shutdown', async () => {
    const value = props()
    render(<RecoveryCenter {...value} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('button', { name: en.shutdown })
    fireEvent.click(screen.getByRole('button', { name: en.shutdown }))
    expect(value.shutdown).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.quickShutdownAction }))
    await waitFor(() => { expect(value.shutdown).toHaveBeenCalledOnce() })
    expect(await screen.findByText(en.stopping)).toBeTruthy()
  })

  it('shows unavailable, empty, narrow-rail, and refresh-error states', async () => {
    const unavailable = props({
      list: vi.fn(async () => ({
        available: false,
        sourceRoot: '',
        storeRoot: '/recovery',
        checkpoints: [],
        unavailableReason: 'source missing',
      })),
    })
    const settings = render(<RecoverySettingsSection {...unavailable} close={vi.fn()} />)
    expect(await screen.findByText(en.unavailable.replace('{reason}', 'source missing'))).toBeTruthy()
    expect(screen.getByText(en.empty)).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    settings.unmount()

    const failed = props({ wide: false, list: vi.fn(async () => { throw 'list failed' }) })
    render(<RecoveryCenter {...failed} />)
    const trigger = screen.getByRole('button', { name: en.trigger })
    fireEvent.click(trigger)
    expect(await screen.findByText('list failed')).toBeTruthy()
    window.dispatchEvent(new Event('resize'))
    fireEvent.click(trigger)
    expect(screen.queryByLabelText(en.quickTitle)).toBeNull()
  })

  it('reports power-action errors and lets both confirmations be cancelled', async () => {
    const value = props({ create: vi.fn(async () => { throw new Error('create failed') }) })
    render(<RecoveryCenter {...value} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('button', { name: en.create })
    fireEvent.click(screen.getByRole('button', { name: en.create }))
    expect(await screen.findByText('create failed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: en.restore }))
    fireEvent.click(await screen.findByRole('button', { name: en.cancel }))
    expect(screen.getByRole('button', { name: en.restore })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.shutdown }))
    fireEvent.click(await screen.findByRole('button', { name: en.cancel }))
    expect(screen.getByRole('button', { name: en.shutdown })).toBeTruthy()
  })

  it('renders corrupt and rescue checkpoints and exposes busy and failure states', async () => {
    let finishCreate!: () => void
    const waiting = new Promise<void>((resolve) => { finishCreate = resolve })
    const corrupt = {
      ...checkpoint,
      id: '20260819T010204.004Z-deadbeef',
      status: 'corrupt' as const,
      label: '',
      error: 'payload hash mismatch',
    }
    const rescue = {
      ...checkpoint,
      id: '20260819T010205.004Z-feedface',
      reason: 'pre-restore' as const,
      label: 'Before rollback',
    }
    const value = props({
      list: vi.fn(async () => ({
        available: true,
        sourceRoot: '/source',
        storeRoot: '/recovery',
        checkpoints: [corrupt, rescue, checkpoint],
        unavailableReason: '',
      })),
      create: vi.fn(async () => {
        await waiting
        return { id: checkpoint.id, files: 22, bytes: 100 }
      }),
      verify: vi.fn(async () => { throw new Error('verification failed') }),
    })
    render(<RecoverySettingsSection {...value} close={vi.fn()} />)
    expect(await screen.findByText('payload hash mismatch')).toBeTruthy()
    expect(screen.getByText(en.corrupt)).toBeTruthy()
    expect(screen.getByText(en.preRestore)).toBeTruthy()
    expect(screen.getByText('Before rollback')).toBeTruthy()
    expect(screen.getAllByText(en.manual)).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: en.create }))
    expect(await screen.findByRole('button', { name: en.creating })).toBeTruthy()
    finishCreate()
    await screen.findByRole('button', { name: en.create })

    fireEvent.click(screen.getAllByRole('button', { name: en.verify })[0]!)
    expect(await screen.findByText('verification failed')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: en.restore })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: en.cancel }))
    expect(screen.queryByPlaceholderText(en.confirmPlaceholder)).toBeNull()
  })

  it('reports Settings list failures from non-Error rejections', async () => {
    const value = props({ list: vi.fn(async () => { throw 'settings list failed' }) })
    render(<RecoverySettingsSection {...value} close={vi.fn()} />)
    expect(await screen.findByText('settings list failed')).toBeTruthy()
  })

  it('keeps the no-checkpoint hint hidden while the power menu is loading', async () => {
    let finish!: (value: Awaited<ReturnType<RecoveryCenterProps['list']>>) => void
    const loading = new Promise<Awaited<ReturnType<RecoveryCenterProps['list']>>>((resolve) => { finish = resolve })
    const value = props({ list: vi.fn(() => loading) })
    render(<RecoveryCenter {...value} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(await screen.findByLabelText(en.quickTitle)).toBeTruthy()
    expect(screen.queryByText(en.quickNoCheckpoint)).toBeNull()
    finish({
      available: true,
      sourceRoot: '/source',
      storeRoot: '/recovery',
      checkpoints: [],
      unavailableReason: '',
    })
    expect(await screen.findByText(en.quickNoCheckpoint)).toBeTruthy()
  })
})
