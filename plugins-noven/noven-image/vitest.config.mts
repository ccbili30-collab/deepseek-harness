/** Source tests use the repository's declared paths, independently of installed plugin dependencies. */
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

export default {
  // The source workspace and the installed plugin workspace share one React instance in this test program.
  resolve: {
    alias: {
      'react-dom': fileURLToPath(new URL('../../packages/client/ui-renderer/node_modules/react-dom', import.meta.url)),
      react: fileURLToPath(new URL('../../packages/client/ui-primitives/node_modules/react', import.meta.url)),
    },
  },
  plugins: [
    standardDecoratorPlugin(),
    tsconfigPaths({ projects: [fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))] }),
  ],
  test: {
    include: ['tests/*.spec.ts'],
    environment: 'node',
    execArgv: vitestExecArgv,
  },
}
