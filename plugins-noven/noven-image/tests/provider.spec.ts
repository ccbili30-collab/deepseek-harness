/** Exercise the Host's registered route and tool definitions with credential and transport doubles. */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, type Config } from '../src/index.ts'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

const homes = new Set<string>()
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const home of homes) await rm(home, { recursive: true, force: true })
  homes.clear()
})

function setup() {
  let route!: { fetch: (request: Request) => Promise<Response> }
  const tools = new Map<string, ToolDefinition>()
  const disposers: (() => void)[] = []
  const resolve = vi.fn(async () => ({ value: 'stored-key' }))
  const values = { baseURL: 'https://images.test/v1', model: 'custom-image', apiKey: '', apiKeyEnv: 'IMAGE_KEY', outputDir: 'images', modelRequestTimeoutMs: 5000 }
  const config: Config = {
    baseURL: { get: () => values.baseURL },
    model: { get: () => values.model },
    apiKey: { get: () => values.apiKey },
    apiKeyEnv: { get: () => values.apiKeyEnv },
    outputDir: { get: () => values.outputDir },
    modelRequestTimeoutMs: { get: () => values.modelRequestTimeoutMs },
  } as Config
  apply({
    effect: (install: () => () => void) => { disposers.push(install()) },
    connection: { fetch: { register: (definition: typeof route) => { route = definition; return () => {} } } },
    credentials: { resolve },
    tools: { register: (tool: ToolDefinition) => { tools.set(tool.name, tool); return () => { tools.delete(tool.name) } } },
  } as never, config)
  const request = (body: unknown, signal?: AbortSignal) => route.fetch(new Request('http://local/api/noven-image-models', {
    method: 'POST', body: JSON.stringify(body), signal,
  }))
  return { request, resolve, values, tools, dispose: () => { for (const off of disposers) off() } }
}

it('uses the staged reference, direct keys and fresh stored keys on the registered model route', async () => {
  const { request, resolve, values } = setup()
  const fetcher = vi.fn(async () => new Response('{"data":[{"id":"chat"},{"id":"custom-image"}],"models":[{"name":"chat"}]}'))
  vi.stubGlobal('fetch', fetcher)
  expect(await (await request({ apiKeyEnv: 'STAGED_KEY' })).json()).toEqual({ models: ['custom-image', 'chat'] })
  expect(resolve).toHaveBeenCalledWith('STAGED_KEY')
  expect(fetcher.mock.calls[0][1].headers.authorization).toBe('Bearer stored-key')
  values.apiKey = 'direct-key'
  await request({})
  expect(fetcher.mock.calls[1][1].headers.authorization).toBe('Bearer direct-key')
  values.apiKey = ''
  resolve.mockResolvedValue({ value: 'changed-key' })
  await request({})
  expect(fetcher.mock.calls[2][1].headers.authorization).toBe('Bearer changed-key')
})

it('rejects invalid request and provider data without returning secrets', async () => {
  const { request } = setup()
  expect((await request(null)).status).toBe(400)
  expect((await request({ apiKeyEnv: 'bad-ref' })).status).toBe(400)
  expect((await request({ apiKey: 5 })).status).toBe(400)
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('not JSON'))
    .mockResolvedValueOnce(new Response('{"data":{}}'))
    .mockRejectedValueOnce(new Error('stored-key')))
  expect((await request({})).status).toBe(502)
  expect((await request({})).status).toBe(502)
  expect(await (await request({})).text()).not.toContain('stored-key')
})

it('propagates request cancellation to the provider', async () => {
  const { request } = setup()
  const abort = new AbortController()
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    signal = options.signal
    return new Promise((_accept, reject) => { signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true }) })
  }))
  const pending = request({}, abort.signal)
  await vi.waitFor(() => { expect(signal).toBeDefined() })
  abort.abort()
  expect((await pending).status).toBe(502)
  expect(signal.aborted).toBe(true)
})

it('generates and edits through their real definitions and releases both registrations', async () => {
  const { tools, dispose } = setup()
  const home = await mkdtemp(join(tmpdir(), 'noven-image-test-'))
  homes.add(home)
  const fetcher = vi.fn(async () => new Response('{"data":[{"b64_json":"aW1hZ2U="}]}'))
  vi.stubGlobal('fetch', fetcher)
  const exec = { signal: new AbortController().signal, agent: { session: { header: { cwd: home } } } }
  const generated = await tools.get('generate_image')!.execute({ prompt: 'test', filename: 'one' }, exec as never) as { path: string }
  expect(await readFile(generated.path, 'utf8')).toBe('image')
  const edited = await tools.get('edit_image')!.execute({ image_path: 'images/one.png', prompt: 'edit', filename: 'two' }, exec as never) as { path: string }
  expect(await readFile(edited.path, 'utf8')).toBe('image')
  const abort = new AbortController()
  abort.abort()
  await expect(tools.get('generate_image')!.execute({ prompt: 'cancel', filename: 'cancelled' }, { ...exec, signal: abort.signal } as never)).rejects.toThrow()
  await expect(readFile(join(home, 'images/cancelled.png'))).rejects.toThrow()
  dispose()
  expect(tools.size).toBe(0)
})
