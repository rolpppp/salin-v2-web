import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  globalIgnores([".claude/**", "tests/mobile-compat/dart/**", ".next/**", "out/**", "node_modules/**", "next-env.d.ts", "supabase/**", "playwright-report/**", "test-results/**", "coverage/**"]),
]);
