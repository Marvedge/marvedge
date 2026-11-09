import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["cloudrun-worker/**/*.test.js"],
    exclude: ["**/node_modules/**", "**/.git/**", "e2e/**"],
  },
});
