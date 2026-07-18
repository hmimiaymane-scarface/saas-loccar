import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Mirrors tsconfig.json's "@/*": ["./*"] — without this, any lib module
// that does a genuine runtime `@/...` import (as opposed to a type-only
// import, which gets erased before it matters) fails to resolve under
// vitest even though `tsc` and Next.js both understand it fine.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
  },
})
