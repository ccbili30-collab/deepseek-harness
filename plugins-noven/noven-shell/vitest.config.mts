/** Shared imports use the declared source program; package installation has a separate smoke. */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

const react = createRequire(new URL('./package.json', import.meta.url))
const renderer = react

export default {
  resolve: {
    alias: [
      { find: /^\.\.\/node_modules\/react\/index\.js$/, replacement: react.resolve('react') },
      { find: /^\.\.\/node_modules\/react-dom\/client\.js$/, replacement: renderer.resolve('react-dom/client') },
      { find: /^\.\.\/node_modules\/react-dom\/server\.js$/, replacement: renderer.resolve('react-dom/server') },
      { find: /^react$/, replacement: react.resolve('react') },
      { find: /^react\/jsx-runtime$/, replacement: react.resolve('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: react.resolve('react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: renderer.resolve('react-dom') },
      { find: /^react-dom\/client$/, replacement: renderer.resolve('react-dom/client') },
      { find: /^react-dom\/server$/, replacement: renderer.resolve('react-dom/server') },
    ],
  },
  plugins: [
    standardDecoratorPlugin(),
    tsconfigPaths({ projects: [fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))], loose: true }),
  ],
  test: {
    include: ['tests/*.spec.ts'],
    exclude: ['tests/inline-code.spec.ts'],
    environment: 'node',
    execArgv: vitestExecArgv,
  },
}
