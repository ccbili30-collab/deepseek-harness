import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', async () => ({
  ...await vi.importActual<typeof import('node:child_process')>('node:child_process'),
  spawn: spawnMock,
}))

import RecoveryGateway from '../src/index.ts'

const contexts: Context[] = []
let fixtureRoot = ''
let previousArgv1: string | undefined
let previousExecArgv: string[] = []
let previousSource: string | undefined
let previousHome: string | undefined
let previousStore: string | undefined
let providedExit: ReturnType<typeof vi.fn> | undefined

interface ChildResult {
  stdout?: string | Buffer
  stderr?: string | Buffer
  code?: number | null
  error?: Error
  guardian?: boolean
}

function restoreEnv(name: 'DSH_SOURCE_HOME' | 'DSH_HOME' | 'DSH_RECOVERY_HOME', value: string | undefined): void {
  if (value !== undefined) {
    process.env[name] = value
    return
  }
  if (name === 'DSH_SOURCE_HOME') delete process.env.DSH_SOURCE_HOME
  else if (name === 'DSH_HOME') delete process.env.DSH_HOME
  else delete process.env.DSH_RECOVERY_HOME
}

function fakeChild(result: ChildResult = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
    unref: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  child.unref = vi.fn()
  queueMicrotask(() => {
    if (result.error !== undefined) {
      child.emit('error', result.error)
      return
    }
    if (result.guardian === true) {
      child.emit('spawn')
      return
    }
    if (result.stdout !== undefined) child.stdout.emit('data', Buffer.from(result.stdout))
    if (result.stderr !== undefined) child.stderr.emit('data', Buffer.from(result.stderr))
    child.emit('close', Object.hasOwn(result, 'code') ? result.code : 0)
  })
  return child
}

function queueChildren(...results: ChildResult[]): void {
  for (const result of results) spawnMock.mockImplementationOnce(() => fakeChild(result))
}

async function gateway(provideExit = false): Promise<RecoveryGateway> {
  const ctx = new Context()
  contexts.push(ctx)
  if (provideExit) {
    providedExit = vi.fn()
    ctx.provide('appExit', providedExit)
  }
  await ctx.plugin(RecoveryGateway)
  return ctx.get('recovery') as RecoveryGateway
}

beforeEach(() => {
  spawnMock.mockReset()
  providedExit = undefined
  fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-recovery-gateway-'))
  previousArgv1 = process.argv[1]
  previousExecArgv = [...process.execArgv]
  previousSource = process.env.DSH_SOURCE_HOME
  previousHome = process.env.DSH_HOME
  previousStore = process.env.DSH_RECOVERY_HOME
  process.argv[1] = '/repo/apps/cli/src/bin.ts'
  process.execArgv = ['--inspect=0', '--import', 'tsx/esm']
  process.env.DSH_SOURCE_HOME = join(fixtureRoot, 'source')
  process.env.DSH_HOME = join(fixtureRoot, 'home')
  process.env.DSH_RECOVERY_HOME = join(fixtureRoot, 'store')
})

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  if (previousArgv1 === undefined) process.argv.splice(1, 1)
  else process.argv[1] = previousArgv1
  process.execArgv = previousExecArgv
  restoreEnv('DSH_SOURCE_HOME', previousSource)
  restoreEnv('DSH_HOME', previousHome)
  restoreEnv('DSH_RECOVERY_HOME', previousStore)
  rmSync(fixtureRoot, { recursive: true, force: true })
})

describe('RecoveryGateway', () => {
  it('publishes the complete local recovery control plane under one namespace', async () => {
    const recovery = await gateway()
    expect(recovery.typertRemote).toMatchObject({ serviceKey: 'recovery', namespace: 'recovery' })
    expect(remoteMethods(recovery)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'create', invocation: { kind: 'direct' } },
      { method: 'verify', invocation: { kind: 'direct' } },
      { method: 'scheduleRestore', invocation: { kind: 'direct' } },
      { method: 'shutdown', invocation: { kind: 'direct' } },
    ])
  })

  it('acknowledges clean shutdown before requesting app exit', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    contexts.push(ctx)
    const exit = vi.fn()
    ctx.provide('appExit', exit)
    await ctx.plugin(RecoveryGateway)
    const recovery = ctx.get('recovery') as RecoveryGateway
    await expect(recovery.shutdown()).resolves.toEqual({ accepted: true })
    expect(exit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('maps CLI list, create, verify, and guardian restore results', async () => {
    vi.useFakeTimers()
    const recovery = await gateway(true)
    const snapshot = '20260819T010203.004Z-abcdef12'
    queueChildren(
      { stdout: JSON.stringify({ snapshots: [
        {
          id: snapshot,
          status: 'published',
          createdAt: '2026-08-19T01:02:03.004Z',
          reason: 'pre-restore',
          label: 'Rescue',
          sourceFiles: 3,
          dshFiles: 2,
          error: '',
        },
        { id: '20260819T010204.004Z-deadbeef', status: 'corrupt' },
      ] }) },
      { stdout: JSON.stringify({ manifest: { id: snapshot }, files: 5, bytes: 64 }) },
      { stdout: JSON.stringify({ manifest: { id: snapshot }, files: 5, bytes: 64 }) },
      { stdout: JSON.stringify({ id: snapshot, valid: true, files: 5, bytes: 64 }) },
      { stdout: JSON.stringify({ id: snapshot, valid: true, files: 5, bytes: 64 }) },
      { guardian: true },
    )

    await expect(recovery.list()).resolves.toEqual({
      available: true,
      sourceRoot: join(fixtureRoot, 'source'),
      storeRoot: join(fixtureRoot, 'store'),
      checkpoints: [
        {
          id: snapshot,
          status: 'published',
          createdAt: '2026-08-19T01:02:03.004Z',
          reason: 'pre-restore',
          label: 'Rescue',
          sourceFiles: 3,
          dshFiles: 2,
          error: '',
        },
        {
          id: '20260819T010204.004Z-deadbeef',
          status: 'corrupt',
          createdAt: '',
          reason: 'manual',
          label: '',
          sourceFiles: 0,
          dshFiles: 0,
          error: '',
        },
      ],
      unavailableReason: '',
    })
    await expect(recovery.create('  ')).resolves.toEqual({ id: snapshot, files: 5, bytes: 64 })
    delete process.env.DSH_HOME
    await expect(recovery.create(' Before plugin ')).resolves.toEqual({ id: snapshot, files: 5, bytes: 64 })
    await expect(recovery.verify(snapshot)).resolves.toEqual({ id: snapshot, valid: true, files: 5, bytes: 64 })
    await expect(recovery.scheduleRestore(snapshot)).resolves.toEqual({
      accepted: true,
      snapshot,
      logPath: join(fixtureRoot, 'store', 'logs', `restore-${snapshot}.log`),
    })
    const guardianArgs = spawnMock.mock.calls.at(-1)?.[1] as string[]
    expect(guardianArgs).toContain('guardian-restore')
    expect(guardianArgs).not.toContain('--inspect=0')
    const guardian = spawnMock.mock.results.at(-1)?.value as { unref: ReturnType<typeof vi.fn> }
    expect(guardian.unref).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(250)
    expect(providedExit).toHaveBeenCalledWith(0)
  })

  it('reports unavailable roots and rejects invalid lifecycle requests', async () => {
    const recovery = await gateway()
    delete process.env.DSH_SOURCE_HOME
    delete process.env.DSH_RECOVERY_HOME
    queueChildren({ stdout: '{"snapshots":[]}' })
    await expect(recovery.list()).resolves.toMatchObject({
      available: false,
      sourceRoot: '',
      storeRoot: join(homedir(), '.dsh-recovery'),
      unavailableReason: 'Launch DSH from a Git checkout or set DSH_SOURCE_HOME.',
    })
    await expect(recovery.create('x')).rejects.toThrow('Recovery is unavailable')
    await expect(recovery.scheduleRestore('invalid')).rejects.toThrow('invalid checkpoint id')
    await expect(recovery.scheduleRestore('20260819T010203.004Z-abcdef12')).rejects.toThrow('Recovery is unavailable')

    process.env.DSH_SOURCE_HOME = ''
    queueChildren({ stdout: '{"snapshots":[]}' })
    await expect(recovery.list()).resolves.toMatchObject({ available: false })
    process.env.DSH_SOURCE_HOME = join(fixtureRoot, 'source')
    queueChildren({ stdout: '{"id":"20260819T010203.004Z-abcdef12","valid":true,"files":0,"bytes":0}' })
    await expect(recovery.scheduleRestore('20260819T010203.004Z-abcdef12')).rejects.toThrow('did not provide appExit')
    expect(() => recovery.shutdown()).toThrow('did not provide appExit')
  })

  it('contains CLI process and guardian failures', async () => {
    const recovery = await gateway(true)
    const snapshot = '20260819T010203.004Z-abcdef12'
    queueChildren(
      { error: new Error('spawn failed') },
      { stderr: 'explicit failure\n', code: 1 },
      { code: null },
      { stdout: 'not-json' },
      { stdout: Buffer.alloc(8 * 1024 * 1024 + 1) },
    )
    await expect(recovery.verify(snapshot)).rejects.toThrow('spawn failed')
    await expect(recovery.verify(snapshot)).rejects.toThrow('explicit failure')
    await expect(recovery.verify(snapshot)).rejects.toThrow('recovery CLI exited with null')
    await expect(recovery.verify(snapshot)).rejects.toThrow('CLI returned invalid JSON')
    await expect(recovery.verify(snapshot)).rejects.toThrow('CLI output exceeded the safety limit')
    const oversized = spawnMock.mock.results.at(-1)?.value as { kill: ReturnType<typeof vi.fn> }
    expect(oversized.kill).toHaveBeenCalledOnce()

    process.argv[1] = ''
    await expect(recovery.verify(snapshot)).rejects.toThrow('current DSH CLI script is unavailable')
    process.argv[1] = '/repo/apps/cli/src/bin.ts'
    queueChildren(
      { stdout: JSON.stringify({ id: snapshot, valid: true, files: 0, bytes: 0 }) },
      { guardian: true, error: new Error('guardian failed') },
    )
    await expect(recovery.scheduleRestore(snapshot)).rejects.toThrow('guardian failed')
  })
})
