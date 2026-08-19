import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { describe, expect, it } from 'vitest'
import * as RecoveryInvariant from '../src/invariant.ts'

describe('host-recovery invariant companion', () => {
  it('registers and withdraws its package ownership', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(RecoveryInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(RecoveryInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
