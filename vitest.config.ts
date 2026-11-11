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
        // SPEC §11.8: rule engine >= 90 %.
        "lib/rules/**/*.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // Autonomy calculation and its configuration (SPEC §6).
        "lib/calc/{autonomy,config}.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // SPEC §11.8: unit conversions >= 90 %.
        "lib/units/**/*.ts": { lines: 90, branches: 90, functions: 90, statements: 90 },
        // Pure questionnaire logic (template, answers, completeness, design basis).
        "lib/questionnaire/{template,answers,completeness,design-basis}.ts": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        // Pure workflow logic (state machine, gate, dependencies, permissions, template).
        "lib/workflow/{template,gate,state-machine,dependencies,permissions}.ts": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
