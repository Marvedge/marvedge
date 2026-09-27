import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest previously ran on pure defaults, because every suite lived in
 * app/lib/** and imported its subject relatively. Testing anything outside a
 * leaf library needs the `@/…` alias the app itself is written in: app/store,
 * app/components and the route handlers all use it, and a `import type` from
 * `@/…` only worked by accident (type imports are erased before resolution, so
 * Vite never had to resolve them).
 *
 * This mirrors the single `"@/*": ["./*"]` mapping in tsconfig.json. Everything
 * else — the include globs, the environment — stays on Vitest's defaults, so
 * the existing suites run exactly as they did before.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "cloudrun-worker/**"],
  },
});
