import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*": ["./*"] — Vite doesn't read tsconfig
    // path mappings on its own, so lib/prose.js's `@/lib/proseSchema` import
    // needs this to resolve under Vitest.
    alias: { '@': here },
  },
  test: {
    setupFiles: ['./vitest.setup.mjs'],
    // The cost/programme calculator tests fetch the real remote workbooks —
    // there is no offline fixture (see vitest.setup.mjs for why) — so they
    // need real network round-trip time, not the 5s default.
    testTimeout: 20_000,
  },
})
