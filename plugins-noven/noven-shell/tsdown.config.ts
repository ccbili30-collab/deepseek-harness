/**
 * Client bundle for noven-shell.
 *
 * Mirrors the DSH clientBundle recipe (packages/client/tsdown.client.ts):
 * a self-registering `window.__ModuleLoader__.load({ id, factory })` chunk
 * whose require() externals are exactly the browser platform modules.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const rootVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string

/** One build identity for the About page and release titles: date + short commit. */
function resolveBuildId(): string {
  const configured = process.env.NOVEN_BUILD_ID?.trim()
  if (configured !== undefined && configured !== '') return configured
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    return `${date}-${commit}`
  } catch {
    return 'dev'
  }
}

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const isPlatform = (specifier: string): boolean =>
  PLATFORM_MODULES.some(m => specifier === m || specifier.startsWith(`${m}/`))

export default defineConfig({
  name: 'noven-shell/client',
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  deps: {
    neverBundle: isPlatform,
    alwaysBundle: (specifier: string) => !isPlatform(specifier),
  },
  define: {
    // 浏览器包：第三方依赖（mantine/BlockNote 生态）会读 NODE_ENV。
    'process.env.NODE_ENV': '"production"',
    // Product identity is baked at bundle time; the About page reads these.
    'process.env.NOVEN_BUILD_ID': JSON.stringify(resolveBuildId()),
    'process.env.NOVEN_VERSION': JSON.stringify('0.1.0'),
    'process.env.NOVEN_KERNEL_VERSION': JSON.stringify(process.env.DSH_CLIENT_VERSION ?? rootVersion),
  },
  alias: {
    // node:crypto 只被品牌库的 webcrypto 用到——浏览器原生提供，按垫片内联。
    'node:crypto': new URL('./src/client/shim-crypto.ts', import.meta.url).pathname,
  },
  outputOptions: {
    // BlockNote/mantine 触发代码分割；模块加载器只认单个 factory 包，强制内联。
    inlineDynamicImports: true,
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
    banner: (chunk) =>
      `window.__ModuleLoader__.load({ id: "noven-shell", ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
