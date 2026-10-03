import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
const environment = path.resolve(process.cwd(), "../../.env");
if (existsSync(environment)) process.loadEnvFile(environment);
const testDatabase = process.env.TEST_DATABASE_URL;
if (!testDatabase || !new URL(testDatabase).pathname.endsWith("_test"))
  throw new Error("Browser tests require TEST_DATABASE_URL ending in _test.");
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3127", browserName: "chromium" },
  webServer: {
    command:
      "pnpm --filter @schengen/db test:reset && pnpm dev --port 3127",
    url: "http://127.0.0.1:3127",
    reuseExistingServer: false,
    env: { OLLAMA_EMBED_MODEL: "", OLLAMA_MODEL: "", DATABASE_URL: testDatabase, SCHENGEN_BUILD_DIR: ".next-e2e" },
    timeout: 120_000,
  },
});
