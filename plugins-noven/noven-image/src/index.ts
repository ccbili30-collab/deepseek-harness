/**
 * noven-image — synchronous image generation and editing tools against an
 * OpenAI-compatible images API. Ported in spirit from the legacy CreatX
 * image-runtime, minus its hardcoded model enum: the model, endpoint, and key
 * all come from plugin config (key may live in an environment variable).
 *
 * The queue (submit/manage_image_generation) deliberately did not come over:
 * its only consumer was the cut Growth family.
 * @module noven-image
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
// Type-only: pulls the ctx.connection merge for the fetch-route registry.
import type {} from '@deepseek-ai/dsh-client-connection'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

export const name = 'noven-image'
export const inject = ['tools', 'connection', 'credentials']

/** Resolved plugin config: every field is a volatile reference read through `.get()`. */
export interface Config {
  baseURL: Volatile<string>
  model: Volatile<string>
  apiKey: Volatile<string>
  apiKeyEnv: Volatile<string>
  outputDir: Volatile<string>
  /** Maximum duration of a provider model-list request in milliseconds. */
  modelRequestTimeoutMs: Volatile<number>
}

export const Config = z.object({
  baseURL: z.string().default('').description('OpenAI 兼容图像 API 的基础 URL，如 https://api.openai.com/v1').volatile(),
  model: z.string().default('gpt-image-1').description('图像模型名，不内置枚举，随服务商填写').volatile(),
  apiKey: z.string().role('secret').default('').description('API 密钥；留空则读 apiKeyEnv 指定的环境变量').volatile(),
  apiKeyEnv: z.string().role('credential-ref').default('NOVEN_IMAGE_API_KEY').description('存放密钥的环境变量名').volatile(),
  outputDir: z.string().default('视觉').description('生成图片在项目内的落盘目录').volatile(),
  modelRequestTimeoutMs: z.number().min(1).default(15_000).description('模型列表请求超时（毫秒）').volatile(),
})

/** Direct configuration takes precedence over per-operation credential resolution. */
async function resolveKey(ctx: Context, config: Config, reference = config.apiKeyEnv.get()): Promise<string> {
  const staged = config.apiKey.get().trim()
  if (staged.length > 0) return staged
  return (await ctx.credentials.resolve(credentialRef(reference)))?.value.trim() ?? ''
}

/** Prompt → short filesystem slug. */
function slugify(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_\-]/gu, '')
  return compact.slice(0, 24).length > 0 ? compact.slice(0, 24) : 'image'
}

interface ImagesResponse {
  data?: readonly { b64_json?: string, url?: string }[]
  error?: { message?: string }
}

/** Decode one API response payload into PNG bytes. */
async function decodeImagePayload(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const body = await response.json() as ImagesResponse
  if (!response.ok) {
    throw new Error(`image API ${String(response.status)}: ${body.error?.message ?? response.statusText}`)
  }
  const item = body.data?.[0]
  if (item === undefined) throw new Error('image API returned no data')
  if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
    return new Uint8Array(Buffer.from(item.b64_json, 'base64'))
  }
  if (typeof item.url === 'string' && item.url.length > 0) {
    const binary = await fetch(item.url, { signal })
    if (!binary.ok) throw new Error(`image download ${String(binary.status)}`)
    return new Uint8Array(await binary.arrayBuffer())
  }
  throw new Error('image API returned neither b64_json nor url')
}

/** Session cwd for one tool execution. */
function sessionCwd(exec: { agent?: { session: { header: { cwd?: string } } } }): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

/** Substrings that mark a model id as likely image-serving; they sort first in the returned list. */
const IMAGE_HINT = /image|img|dall|flux|kolors|hunyuan|seedream|dreamina|banana|imagen|sd\d|stable|draw|paint|vision/i

/**
 * Serve the provider's model list to the settings page: `POST
 * /api/noven-image-models` with `{ base?, apiKey?, apiKeyEnv? }`, where each staged value
 * overrides the stored one so the page can probe before saving. The key stays
 * host-side: an empty staged key falls back to the configured credential, and
 * the response carries ids only.
 */
function serveModels(ctx: Context, config: Config): (request: Request) => Promise<Response> {
  return async (request) => {
    const fail = (status: number, message: string): Response =>
      new Response(JSON.stringify({ error: message }), { status, headers: JSON_HEADERS })
    let body: unknown
    try {
      body = await request.json()
    } catch (_error) {
      return fail(400, 'body is not valid JSON')
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail(400, 'provider fields must be strings')
    const fields = body as Record<string, unknown>
    if (!Object.keys(fields).every(field => ['base', 'apiKey', 'apiKeyEnv'].includes(field))
      || Object.values(fields).some(value => typeof value !== 'string')) return fail(400, 'provider fields must be strings')
    const stagedBase = typeof fields['base'] === 'string' ? fields['base'].trim() : ''
    const endpoint = (stagedBase.length > 0 ? stagedBase : config.baseURL.get()).replace(/\/+$/u, '')
    const stagedKey = typeof fields['apiKey'] === 'string' ? fields['apiKey'].trim() : ''
    const reference = typeof fields['apiKeyEnv'] === 'string' && fields['apiKeyEnv'].trim() !== '' ? fields['apiKeyEnv'].trim() : config.apiKeyEnv.get()
    let key: string
    try {
      credentialRef(reference)
    } catch (_error) {
      return fail(400, 'credential reference is invalid')
    }
    try {
      key = stagedKey.length > 0 ? stagedKey : await resolveKey(ctx, config, reference)
    } catch (_error) {
      return fail(502, 'credential provider is unavailable')
    }
    if (endpoint.length === 0) return fail(400, 'endpoint is not configured')
    if (key.length === 0) return fail(400, 'no API key is configured')
    let response: Response
    try {
      response = await fetch(`${endpoint}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(config.modelRequestTimeoutMs.get())]),
      })
    } catch (_error) {
      return fail(502, request.signal.aborted ? 'request cancelled' : 'provider request failed')
    }
    if (!response.ok) return fail(response.status, `provider answered ${String(response.status)}`)
    let payload: unknown
    try {
      payload = await response.json()
    } catch (_error) {
      return fail(502, 'provider returned invalid model data')
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return fail(502, 'provider returned invalid model data')
    const record = payload as Record<string, unknown>
    const data = record['data'] ?? []
    const listed = record['models'] ?? []
    if (!Array.isArray(data) || !Array.isArray(listed)) return fail(502, 'provider returned invalid model data')
    const ids = new Set<string>()
    for (const item of [...data, ...listed]) {
      if (typeof item !== 'object' || item === null) return fail(502, 'provider returned invalid model data')
      const model = item as Record<string, unknown>
      const id = typeof model['id'] === 'string' && model['id'].length > 0 ? model['id'] : model['name']
      if (typeof id === 'string' && id.length > 0) ids.add(id)
    }
    const models = [...ids].sort((left, right) => Number(IMAGE_HINT.test(right)) - Number(IMAGE_HINT.test(left)) || left.localeCompare(right))
    return new Response(JSON.stringify({ models }), { headers: JSON_HEADERS })
  }
}

/**
 * Register generate_image, edit_image, and the model-list probe route.
 * @param ctx - Host context with tools, connection and credentials providers.
 * @param config - schema-resolved volatile provider configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/noven-image-models',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: serveModels(ctx, config),
  }), 'noven-image: /api/noven-image-models')
  const base = async (): Promise<{ endpoint: string, key: string, model: string }> => {
    const key = await resolveKey(ctx, config)
    if (key === '') throw new Error('no image API key is configured')
    if (config.baseURL.get().trim() === '') throw new Error('image endpoint is not configured')
    return { endpoint: config.baseURL.get().replace(/\/+$/u, ''), key, model: config.model.get() }
  }

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'generate_image',
    description: 'Generate one image from a prompt and save it into the project. Returns the saved path.',
    parameters: {
      prompt: { type: 'string', required: true, description: '完整的生图 Prompt（主体/场景/构图/光线/色彩/媒介/装帧等）。' },
      size: { type: 'string', description: '图像尺寸，如 1024x1024。默认 1024x1024。' },
      filename: { type: 'string', description: '落盘文件名（不含扩展名）。默认由 Prompt 生成。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          model: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `图片已保存：${String((value as { path?: string }).path ?? '')}` }],
    },
    async execute(args, exec) {
      const { endpoint, key, model } = await base()
      const response = await fetch(`${endpoint}/images/generations`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: args.prompt, size: args.size ?? '1024x1024', n: 1 }),
        signal: exec.signal,
      })
      const bytes = await decodeImagePayload(response, exec.signal)
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join, resolve } = await import('node:path')
      const dir = resolve(sessionCwd(exec), config.outputDir.get())
      await mkdir(dir, { recursive: true })
      const customName = (args.filename ?? '').trim()
      const stem = customName.length > 0 ? customName : `${slugify(args.prompt)}-${Date.now().toString(36)}`
      const path = join(dir, `${stem}.png`)
      exec.signal.throwIfAborted()
      await writeFile(path, bytes)
      return { path, bytes: bytes.byteLength, model }
    },
  })), 'noven-image: generate_image')

  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'edit_image',
    description: 'Edit one existing image in the project with a prompt and save the result as a new PNG.',
    parameters: {
      image_path: { type: 'string', required: true, description: '要编辑的图片路径（相对项目根）。' },
      prompt: { type: 'string', required: true, description: '编辑指令：保留什么、改变什么。' },
      size: { type: 'string', description: '输出尺寸，如 1024x1024。默认与输入一致（由服务端决定）。' },
      filename: { type: 'string', description: '落盘文件名（不含扩展名）。默认 <原名>-edit-<序号>。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          model: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `图片已保存：${String((value as { path?: string }).path ?? '')}` }],
    },
    async execute(args, exec) {
      const { endpoint, key, model } = await base()
      const { readFile, mkdir, writeFile } = await import('node:fs/promises')
      const { join, resolve, basename, extname } = await import('node:path')
      const cwd = sessionCwd(exec)
      const sourcePath = resolve(cwd, args.image_path)
      const source = await readFile(sourcePath)
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', args.prompt)
      form.append('image', new Blob([source], { type: 'image/png' }), basename(sourcePath))
      if (args.size !== undefined) form.append('size', args.size)
      const response = await fetch(`${endpoint}/images/edits`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}` },
        body: form,
        signal: exec.signal,
      })
      const bytes = await decodeImagePayload(response, exec.signal)
      const dir = resolve(cwd, config.outputDir.get())
      await mkdir(dir, { recursive: true })
      const original = basename(args.image_path, extname(args.image_path))
      const customName = (args.filename ?? '').trim()
      const stem = customName.length > 0
        ? customName
        : `${original}-edit-${Date.now().toString(36)}`
      const path = join(dir, `${stem}.png`)
      exec.signal.throwIfAborted()
      await writeFile(path, bytes)
      return { path, bytes: bytes.byteLength, model }
    },
  })), 'noven-image: edit_image')
}
