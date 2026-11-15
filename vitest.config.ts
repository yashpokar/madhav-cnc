import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Agent worktrees under .claude hold copies of the tests; run only this tree's.
  test: { environment: 'node', exclude: ['**/node_modules/**', '.claude/**'] },
})
