import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/smoke/**/*.smoke.test.ts"],
    setupFiles: ["tests/smoke/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
