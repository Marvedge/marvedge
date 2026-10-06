import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["cloudrun-worker/avs_dub.test.js"],
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});