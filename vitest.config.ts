import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Configure Vitest to resolve the same @/* alias used by the application.
 *
 * Playwright owns the browser tests under e2e/**, so Vitest must exclude
 * that directory from its test discovery.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**", "cloudrun-worker/**"],
  },
});
