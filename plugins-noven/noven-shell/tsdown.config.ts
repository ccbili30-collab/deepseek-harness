/**
 * Client bundle for noven-shell.
 *
 * Mirrors the DSH clientBundle recipe (packages/client/tsdown.client.ts):
 * a self-registering `window.__ModuleLoader__.load({ id, factory })` chunk
 * whose require() externals are exactly the browser platform modules.
 */
import { defineConfig } from 'tsdown'

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
