/** Credential refusal, staged references and cancelled probes through the page's injected actions. */
import { afterEach, expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { NovenImageCardController, type NovenImageSettings } from '../src/client/noven-image-card-controller.ts'

const controllers = new Set<NovenImageCardController>()

function setup() {
  const host = stubConfigForm<NovenImageSettings>()
  host.publish({ status: 'ready', writable: true, revision: 1, user: {}, value: { apiKeyEnv: 'OLD_KEY', baseURL: 'https://images.test/v1' } })
  const describe = vi.fn(async (refs: readonly string[]) => ({
    ok: true as const,
    value: Object.fromEntries(refs.map(ref => [ref, { configured: true, writable: true }])),
  }))
  const set = vi.fn(async () => ({ ok: true }))
  const controller = new NovenImageCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
  controllers.add(controller)
  const face = controller.inject()
  return { host, describe, set, controller, face, state: () => face.hooks.novenImageCard.getSnapshot() }
}

afterEach(() => {
  for (const controller of controllers) controller.dispose()
  controllers.clear()
  vi.unstubAllGlobals()
})

it('retains a rejected key even when a previous key remains configured', async () => {
  const { face, state, set } = setup()
  set.mockResolvedValue({ ok: false })
  face.edit('apiKey', 'rejected-key')
  face.save()
  await vi.waitFor(() => { expect(state().saving).toBe(false); expect(state().failed).toBe(true) })
  expect(state().apiKey.text).toBe('rejected-key')
  expect(state().dirty).toBe(true)
})

it('writes the submitted reference after settings save while preserving a newer staged key', async () => {
  const { host, face, set, state } = setup()
  const mutation = Promise.withResolvers<boolean>()
  host.mutate.mockImplementation(() => mutation.promise)
  face.edit('apiKeyEnv', 'SUBMITTED_KEY')
  face.edit('apiKey', 'submitted')
  face.save()
  face.edit('apiKeyEnv', 'LATER_KEY')
  face.edit('apiKey', 'later')
  mutation.resolve(true)
  await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('SUBMITTED_KEY', 'submitted') })
  await vi.waitFor(() => { expect(state().saving).toBe(false) })
  expect(state().apiKey.text).toBe('later')
  expect(state().apiKeyEnv.text).toBe('LATER_KEY')
})

it('drops stale credential answers for the same reference and after disposal', async () => {
  const { controller, describe, state } = setup()
  await vi.waitFor(() => { expect(state().apiKeyConfigured).toBe(true) })
  const slow = Promise.withResolvers<Awaited<ReturnType<typeof describe>>>()
  describe.mockImplementationOnce(() => slow.promise)
  controller.refreshCredential('OLD_KEY')
  describe.mockResolvedValue({ ok: true, value: { OLD_KEY: { configured: false, writable: false } } })
  controller.refreshCredential('OLD_KEY')
  await vi.waitFor(() => { expect(state().apiKeyWritable).toBe(false) })
  slow.resolve({ ok: true, value: { OLD_KEY: { configured: true, writable: true } } })
  await Promise.resolve()
  expect(state().apiKeyWritable).toBe(false)
  const late = Promise.withResolvers<Awaited<ReturnType<typeof describe>>>()
  describe.mockImplementationOnce(() => late.promise)
  controller.refreshCredential('OLD_KEY')
  controller.dispose()
  const closed = state()
  late.resolve({ ok: true, value: { OLD_KEY: { configured: true, writable: true } } })
  await Promise.resolve()
  expect(state()).toBe(closed)
})

it('aborts superseded connections and accepts only the latest model response', async () => {
  const { face, state } = setup()
  const old = Promise.withResolvers<Response>()
  const fetcher = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(new Response('{"models":["new"]}'))
  vi.stubGlobal('fetch', fetcher)
  const pending = face.fetchModels()
  face.edit('apiKeyEnv', 'NEW_KEY')
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  await face.fetchModels()
  expect(JSON.parse(fetcher.mock.calls[1][1].body).apiKeyEnv).toBe('NEW_KEY')
  old.resolve(new Response('{"models":["old"]}'))
  await pending
  expect(state().models).toEqual(['new'])
})

it('cancels without saving and ignores a pending probe after the page closes', async () => {
  const { face, state, host, controller } = setup()
  const response = Promise.withResolvers<Response>()
  const fetcher = vi.fn(() => response.promise)
  vi.stubGlobal('fetch', fetcher)
  face.edit('baseURL', 'https://draft.test/v1')
  const pending = face.fetchModels()
  face.discard()
  controller.dispose()
  const closed = state()
  response.resolve(new Response('{"models":["late"]}'))
  await pending
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  expect(state()).toBe(closed)
  expect(host.mutate).not.toHaveBeenCalled()
})

it('reports malformed and provider failures and preserves an empty model result', async () => {
  const { face, state } = setup()
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('{"models":[1]}'))
    .mockResolvedValueOnce(new Response('{"error":"provider denied"}', { status: 401 }))
    .mockResolvedValueOnce(new Response('{"models":[]}')))
  await face.fetchModels()
  expect(state().fetchError).toMatch(/Invalid/)
  await face.fetchModels()
  expect(state().fetchError).toBe('provider denied')
  await face.fetchModels()
  expect(state().models).toEqual([])
  expect(state().fetchError).toBeUndefined()
})
