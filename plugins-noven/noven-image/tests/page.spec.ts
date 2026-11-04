// @vitest-environment jsdom
/** Closing the real settings section cancels its request without committing drafts. */
import { act, createElement, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { NovenImageSection } from '../src/client/NovenImageSection.tsx'
import { NovenImageCardController, type NovenImageSettings } from '../src/client/noven-image-card-controller.ts'
import { en } from '../src/client/locales.ts'

it('aborts the model request when the mounted section closes', async () => {
  const host = stubConfigForm<NovenImageSettings>()
  host.publish({ status: 'ready', writable: true, revision: 1, user: {}, value: { baseURL: 'https://images.test/v1' } })
  const controller = new NovenImageCardController(host.scope, {
    remote: { credentials: { describe: async () => ({ ok: true, value: {} }) } },
  } as never)
  const face = controller.inject()
  const store = face.hooks.novenImageCard
  const response = Promise.withResolvers<Response>()
  const fetcher = vi.fn((_url: string, options: RequestInit) => response.promise)
  vi.stubGlobal('fetch', fetcher)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let closed = false
  try {
    await act(async () => {
      root.render(createElement(NovenImageSection, {
        ...face,
        t: (key: keyof typeof en) => en[key],
        useNovenImageCard: () => useSyncExternalStore(store.subscribe, store.getSnapshot),
      } as never))
    })
    expect([...container.querySelectorAll('label')].map(label => label.textContent)).toEqual([
      'API key', 'Endpoint', 'Image model', 'Output folder', 'Key environment variable',
    ])
    const button = [...container.querySelectorAll('button')].find(item => item.textContent === en.fetchModels)!
    await act(async () => { button.click() })
    expect(fetcher).toHaveBeenCalledOnce()
    await act(async () => { root.unmount() })
    closed = true
    expect(fetcher.mock.calls[0]![1].signal?.aborted).toBe(true)
    response.resolve(new Response('{"models":["late"]}'))
    await act(async () => { await response.promise })
    expect(host.mutate).not.toHaveBeenCalled()
    expect(store.getSnapshot().models).toBeUndefined()
  } finally {
    response.resolve(new Response('{"models":[]}'))
    if (!closed) await act(async () => { root.unmount() })
    controller.dispose()
    container.remove()
    vi.unstubAllGlobals()
  }
})
