/**
 * JSONL-specific permanent-deletion behavior: physical generation removal
 * with the kernel lock inode preserved, write-lease admission across backend
 * instances sharing one root, and refusal while any local handle is open.
 * Provider-equivalent semantics (absence idempotence, visibility, and
 * recreation) are held by the shared persistence contract suites.
 * @module
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { lstat, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import {
  SessionAlreadyOwnedError,
  type SessionPersistence,
} from '@deepseek-ai/dsh-session-persistence'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { eventLines, generationLogFilename, generationLogPath, sessionDir, toHeaderLine } from '../src/format.ts'
import { meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'

const dirs: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function backend(root: string): Promise<SessionPersistence> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
  return ctx.sessionPersistence
}

/** Materialize one closed stored session with a full turn of events. */
async function storeTurn(persistence: SessionPersistence, id: string, cwd: string): Promise<void> {
  const writer = await persistence.create(meta(id, cwd))
  await writer.append(oneTurnLog())
  await writer.close()
}

describe('JSONL permanent session deletion', () => {
  it('removes every generation while preserving the lock file and its inode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-jsonl-delete-'))
    dirs.push(root)
    const persistence = await backend(root)
    const m = meta('generations', '/work')
    await storeTurn(persistence, 'generations', '/work')
    await storeTurn(persistence, 'neighbor', '/work')

    const dir = sessionDir(root, '/work', m.id)
    // A committed historical generation beside the current one, as a published
    // migration chain leaves behind; deletion must remove both generations.
    await writeFile(
      generationLogPath(root, '/work', m.id, SESSION_FORMAT_VERSION - 1, 'none'),
      `${JSON.stringify(toHeaderLine(m))}\n${eventLines(oneTurnLog())}\n`,
    )
    const lockBefore = await lstat(join(dir, 'session.lock'))
    expect(lockBefore.isFile()).toBe(true)

    await persistence.deleteSession(m.id)

    const entries = await readdir(dir)
    expect(entries).toEqual(['session.lock'])
    const lockAfter = await lstat(join(dir, 'session.lock'))
    expect(lockAfter.ino).toBe(lockBefore.ino)
    expect(lockAfter.dev).toBe(lockBefore.dev)
    // The neighboring Session keeps its artifact and its own lock.
    expect(await persistence.stat(SessionId('neighbor'))).toBeDefined()
    const neighborEntries = await readdir(sessionDir(root, '/work', SessionId('neighbor')))
    expect(neighborEntries).toContain(generationLogFilename(SESSION_FORMAT_VERSION, 'none'))
    expect(neighborEntries).toContain('session.lock')
  })

  it('refuses while a local read handle is open and succeeds after close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-jsonl-delete-'))
    dirs.push(root)
    const persistence = await backend(root)
    await storeTurn(persistence, 'read-held', '/work')

    const reader = await persistence.open(SessionId('read-held'), 'read')
    await expect(persistence.deleteSession(SessionId('read-held'))).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    await reader.close()
    await persistence.deleteSession(SessionId('read-held'))
    expect(await persistence.stat(SessionId('read-held'))).toBeUndefined()
  })

  it('refuses while another backend instance on the same root holds the write lease', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-jsonl-delete-'))
    dirs.push(root)
    const holder = await backend(root)
    const sweeper = await backend(root)
    const m = meta('cross-instance', '/work')
    const writer = await holder.create(m)
    await writer.append(oneTurnLog())

    await expect(sweeper.deleteSession(m.id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)
    expect(await sweeper.stat(m.id)).toBeDefined()

    await writer.close()
    await sweeper.deleteSession(m.id)
    expect(await holder.stat(m.id)).toBeUndefined()
  })
})
