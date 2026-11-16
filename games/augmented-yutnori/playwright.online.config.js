import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-online",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-multi-context", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node server/test-server.js", url: "http://127.0.0.1:3001/health", reuseExistingServer: true, timeout: 30_000 },
    { command: "pnpm dev --host 127.0.0.1 --port 4173", url: "http://127.0.0.1:4173", reuseExistingServer: true, timeout: 30_000 },
  ],
});
