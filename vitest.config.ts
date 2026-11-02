import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'server/src/**/*.test.ts', 'web/src/**/*.test.ts'],
  },
})
