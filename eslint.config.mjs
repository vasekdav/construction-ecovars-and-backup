import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "db/migrations/**"],
  },
];

export default config;
