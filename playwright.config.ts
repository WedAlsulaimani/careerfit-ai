import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a production build (`npm run build` first).
 * Browser: set PW_CHANNEL (e.g. "msedge" or "chrome") to use an installed
 * browser, or run `npx playwright install chromium` to use Playwright's own.
 */
const channel = process.env.PW_CHANNEL || undefined;
const port = Number(process.env.E2E_PORT || 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
