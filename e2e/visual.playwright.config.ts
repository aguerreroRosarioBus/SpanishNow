import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./visual-tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:4400", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm --prefix ../frontend start -- --host 127.0.0.1 --port 4400",
    url: "http://127.0.0.1:4400",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
