import { defineConfig } from "vitest/config";

// TS <-> SQL parity. Separate from the default config on purpose: `npm test` must not need a database.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/parity/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
