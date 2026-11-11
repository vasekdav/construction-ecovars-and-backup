import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.d.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        // SPEC §11.8: lib/rules and lib/units >= 90 %. Applied from the phase that adds them.
        "lib/auth/password.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "lib/auth/rbac.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "lib/rate-limit.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
