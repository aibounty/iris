import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@iris/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
