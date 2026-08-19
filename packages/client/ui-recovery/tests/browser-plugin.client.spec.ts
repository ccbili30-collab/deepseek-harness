// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { apply as browserApply, inject } from '../src/client/index.ts'
import { RecoveryCenter } from '../src/client/RecoveryCenter.tsx'
import { RecoverySettingsSection } from '../src/client/RecoverySettingsSection.tsx'
import type { RecoveryCenterFace } from '../src/client/types.ts'
import { apply as hostApply } from '../src/index.ts'

afterEach(cleanup)

const overview = {
  available: true,
  sourceRoot: '/source',
  storeRoot: '/store',
  checkpoints: [],
  unavailableReason: '',
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
  }
  new RemoteService(ctx)
  const list = vi.fn(async () => ({ ok: true as const, value: overview }))
  const create = vi.fn(async () => ({ ok: true as const, value: { id: 'id', files: 1, bytes: 1 } }))
  const verify = vi.fn(async (snapshot: string) => ({
    ok: true as const, value: { id: snapshot, valid: true, files: 1, bytes: 1 },
  }))
  const scheduleRestore = vi.fn(async (snapshot: string) => ({
    ok: true as const, value: { accepted: true, snapshot, logPath: '/log' },
  }))
  const shutdown = vi.fn(async () => ({ ok: true as const, value: { accepted: true } }))
  ctx.provide('remote.recovery', { list, create, verify, scheduleRestore, shutdown })
  return {
    ctx,
    slots: ctx.get('slots') as SlotRegistry,
    list,
    create,
    verify,
    scheduleRestore,
    shutdown,
  }
}

describe('ui-recovery browser composition', () => {
  it('registers the real sidebar component lazily and disposes it with the plugin', async () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.recovery'])
    const b = await bench()
    const stopDeclaration = b.slots.register({
      name: 'root', children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'settings.section': { kind: 'list', scope: 'root' },
      },
    } as never, () => null)
    hostApply()
    const fiber = b.ctx.plugin({ inject: [...inject], apply: browserApply })
    await fiber.await()
    const entry = b.slots.entries('sidebar.footer.action')[0]!
    const settings = b.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(RecoveryCenter)
    expect(settings.component).toBe(RecoverySettingsSection)
    expect(resolveSlotLabel(settings.options.label)).toBe('Recovery')
    expect(b.list).not.toHaveBeenCalled()
    const face = (entry.inject as unknown as () => RecoveryCenterFace)()
    await expect(face.list()).resolves.toEqual(overview)
    await expect(face.create()).resolves.toEqual({ id: 'id', files: 1, bytes: 1 })
    await expect(face.verify('id')).resolves.toMatchObject({ id: 'id', valid: true })
    await expect(face.restore('id')).resolves.toMatchObject({ snapshot: 'id', accepted: true })
    await expect(face.shutdown()).resolves.toEqual({ accepted: true })
    expect(b.list).toHaveBeenCalledOnce()
    expect(b.create).toHaveBeenCalledWith('Manual checkpoint')
    expect(b.verify).toHaveBeenCalledWith('id')
    expect(b.scheduleRestore).toHaveBeenCalledWith('id')
    expect(b.shutdown).toHaveBeenCalledOnce()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'FAILED', message: 'broken' } } as never)
    await expect(face.list()).rejects.toThrow('FAILED: broken')
    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    stopDeclaration()
    await b.ctx.fiber.dispose()
  })
})
