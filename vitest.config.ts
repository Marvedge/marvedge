import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Vitest previously ran on pure defaults, because every suite lived in
 * app/lib/** and imported its subject relatively. Testing anything outside a
 * leaf library needs the `@/…` alias the app itself is written in: app/store,
 * app/components and the route handlers all use it, and an `import type` from
 * `@/…` only worked by accident (type imports are erased before resolution, so
 * Vite never had to resolve them).
 *
 * This mirrors the single `"@/*": ["./*"]` mapping in tsconfig.json.
 *
 * Playwright owns everything under e2e/**. The AVS pacing script is also not a
 * Vitest suite: it maintains its own counters and exits with a process status.
 * Excluding both prevents the wrong runner from executing them while preserving
 * Vitest's normal default exclusions.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "cloudrun-worker/avs_dub.test.js"],
  },
});
