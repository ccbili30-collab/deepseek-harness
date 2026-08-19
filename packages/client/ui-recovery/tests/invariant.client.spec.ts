import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { describe, expect, it } from 'vitest'
import * as RecoveryUiInvariant from '../src/invariant.ts'

describe('ui-recovery invariant companion', () => {
  it('registers and withdraws its package ownership', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(RecoveryUiInvariant)
    await expect(fiber.await()).resolves.toBeDefined()
    await fiber.dispose()
    await expect(ctx.plugin(RecoveryUiInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
