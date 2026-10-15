/** Host-to-browser cache-limit projection for the Session Controller client. */
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { expect, it } from 'vitest'
import { installHistoryCacheConfig, SessionController } from '../src/index.ts'

it('projects configured history-cache limits into the browser bootstrap', async () => {
  const ctx = new Context()
  try {
    const dispose = installHistoryCacheConfig(ctx, SessionController.Config({
      nativeOpen: false,
      historyCacheMaxBytes: 12345,
      historyCacheMaxEntries: 7,
    }))
    const table: IndexInjection[] = []
    await ctx.parallel('webserver/index-inject', table)
    expect(table).toEqual([{
      kind: 'global',
      name: '__DSH_SESSION_HISTORY_CACHE_CONFIG__',
      value: { historyCacheMaxBytes: 12345, historyCacheMaxEntries: 7 },
    }])
    dispose()
  } finally {
    await ctx.fiber.dispose()
  }
})
