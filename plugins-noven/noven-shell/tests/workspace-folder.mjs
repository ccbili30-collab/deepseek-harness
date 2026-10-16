/** Run after building noven-shell: node --test tests/workspace-folder.mjs. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openWorkspaceFolder } from '../lib/client/workspace-folder.js'

test('opens exactly the workspace directory with the default Host opener', async () => {
  const requests = []
  let failures = 0
  await openWorkspaceFolder('/projects/我的世界 with spaces', {
    open: async request => { requests.push(request); return { ok: true } },
    failed: () => { failures += 1 },
  })
  assert.deepEqual(requests, [{ path: '/projects/我的世界 with spaces' }])
  assert.equal(failures, 0)
})

test('reports a refused Host request once', async () => {
  let failures = 0
  await openWorkspaceFolder('/missing', {
    open: async () => ({ ok: false }),
    failed: () => { failures += 1 },
  })
  assert.equal(failures, 1)
})

test('reports a rejected request without leaving an unhandled rejection', async t => {
  const error = new Error('Host disconnected')
  const warning = t.mock.method(console, 'warn', () => {})
  let failures = 0
  await openWorkspaceFolder('/projects/world', {
    open: async () => { throw error },
    failed: () => { failures += 1 },
  })
  assert.equal(failures, 1)
  assert.deepEqual(warning.mock.calls[0].arguments, ['noven-shell: workspace folder open failed:', error])
})
