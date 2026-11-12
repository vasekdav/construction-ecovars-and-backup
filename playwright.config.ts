import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Second server for the open mode (ADR-039): no sign-in, everyone is the shared user.
const OPEN_PORT = Number(process.env.E2E_OPEN_PORT ?? PORT + 1);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    locale: "cs-CZ",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /open-mode\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "open-mode",
      testMatch: /open-mode\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${OPEN_PORT}` },
    },
  ],
  // Both require a production build (`npm run build`) beforehand.
  webServer: [
    {
      command: `npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      env: { AUTH_MODE: "password" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run start -- -p ${OPEN_PORT}`,
      url: `http://localhost:${OPEN_PORT}/projects`,
      // No NEXTAUTH_SECRET, as on a Vercel deployment with only DATABASE_URL set.
      env: { AUTH_MODE: "open", NEXTAUTH_SECRET: "" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
