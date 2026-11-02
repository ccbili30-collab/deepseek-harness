import { defineConfig } from 'vitest/config'
import webConfig from './vitest.web.config.ts'

// Long-lived acceptance instances stay outside the automatic Web and CI lanes.
export default defineConfig({
  ...webConfig,
  test: {
    ...webConfig.test,
    include: ['apps/web/tests/**/*.manual.ts'],
    disableConsoleIntercept: true,
    hookTimeout: 300_000,
    testTimeout: 86_400_000,
  },
})
