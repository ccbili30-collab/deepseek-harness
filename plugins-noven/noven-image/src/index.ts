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
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'noven-image'
export const inject = ['tools']

export interface Config {
  baseURL: string
  model: string
  apiKey: string
  apiKeyEnv: string
  outputDir: string
}

export const Config = z.object({
  baseURL: z.string().description('OpenAI 兼容图像 API 的基础 URL，如 https://api.openai.com/v1').volatile(),
  model: z.string().default('gpt-image-1').description('图像模型名，不内置枚举，随服务商填写').volatile(),
  apiKey: z.string().role('secret').description('API 密钥；留空则读 apiKeyEnv 指定的环境变量').volatile(),
  apiKeyEnv: z.string().role('credential-ref').default('NOVEN_IMAGE_API_KEY').description('存放密钥的环境变量名').volatile(),
  outputDir: z.string().default('视觉').description('生成图片在项目内的落盘目录').volatile(),
})

/** Effective key: config value first, then the named environment variable. */
function resolveKey(config: { apiKey: string, apiKeyEnv: string }): string {
  if (config.apiKey.trim().length > 0) return config.apiKey.trim()
  return (process.env[config.apiKeyEnv] ?? '').trim()
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

/** Register generate_image and edit_image. */
export function apply(ctx: Context, config: Config): void {
  const base = (): { endpoint: string, key: string, model: string } => {
    const key = resolveKey(config)
    return { endpoint: config.baseURL.replace(/\/+$/u, ''), key, model: config.model }
  }

  ctx.tools.register(defineTool({
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
      const { endpoint, key, model } = base()
      const response = await fetch(`${endpoint}/images/generations`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: args.prompt, size: args.size ?? '1024x1024', n: 1 }),
        signal: exec.signal,
      })
      const bytes = await decodeImagePayload(response, exec.signal)
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { join, resolve } = await import('node:path')
      const dir = resolve(sessionCwd(exec), config.outputDir)
      await mkdir(dir, { recursive: true })
      const customName = (args.filename ?? '').trim()
      const stem = customName.length > 0 ? customName : `${slugify(args.prompt)}-${Date.now().toString(36)}`
      const path = join(dir, `${stem}.png`)
      await writeFile(path, bytes)
      return { path, bytes: bytes.byteLength, model }
    },
  }))

  ctx.tools.register(defineTool({
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
      const { endpoint, key, model } = base()
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
      const dir = resolve(cwd, config.outputDir)
      await mkdir(dir, { recursive: true })
      const original = basename(args.image_path, extname(args.image_path))
      const customName = (args.filename ?? '').trim()
      const stem = customName.length > 0
        ? customName
        : `${original}-edit-${Date.now().toString(36)}`
      const path = join(dir, `${stem}.png`)
      await writeFile(path, bytes)
      return { path, bytes: bytes.byteLength, model }
    },
  }))
}
