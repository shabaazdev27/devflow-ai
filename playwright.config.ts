import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,          // run sequentially so first load warms Turbopack
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,                    // single worker avoids parallel cold-start race
  reporter: "list",
  timeout: 90_000,               // 90 s per test (Turbopack cold-start can be slow)
  expect: {
    timeout: 15_000,             // 15 s for each assertion auto-wait
  },
  use: {
    baseURL: "http://localhost:3000",
    navigationTimeout: 45_000,   // 45 s for page.goto — handles cold Turbopack
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
