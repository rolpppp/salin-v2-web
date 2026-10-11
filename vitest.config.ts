import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/unit/setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "components/**/*.test.tsx"],
  },
});
