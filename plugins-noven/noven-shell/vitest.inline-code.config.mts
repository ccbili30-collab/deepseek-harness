import { createRequire } from 'node:module'

const rootRequire = createRequire(new URL('../../packages/client/ui-chat/package.json', import.meta.url))

export default {
  resolve: {
    alias: [
      { find: /^react$/, replacement: rootRequire.resolve('react') },
      { find: /^react\/jsx-runtime$/, replacement: rootRequire.resolve('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: rootRequire.resolve('react/jsx-dev-runtime') },
      { find: /^react-dom$/, replacement: rootRequire.resolve('react-dom') },
      { find: /^react-dom\/client$/, replacement: rootRequire.resolve('react-dom/client') },
      { find: /^react-dom\/server$/, replacement: rootRequire.resolve('react-dom/server') },
    ],
  },
  test: {
    include: ['tests/inline-code.spec.ts'],
    environment: 'node',
  },
}
