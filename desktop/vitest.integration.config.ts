import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Runs against the Firebase emulators started by `npm run test:integration`.
export default defineConfig({
  resolve: { alias: { "@shared": resolve(__dirname, "src/shared") } },
  test: {
    include: ["tests-integration/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
