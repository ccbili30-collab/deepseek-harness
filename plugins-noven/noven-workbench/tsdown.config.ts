/**
 * Client bundle for noven-workbench.
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
  name: 'noven-workbench/client',
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
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
    banner: (chunk) =>
      `window.__ModuleLoader__.load({ id: "noven-workbench", ${chunk.isEntry ? '' : `chunk: ${JSON.stringify(chunk.fileName)}, `}factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
