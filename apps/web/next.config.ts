import type { NextConfig } from "next";
import path from "node:path";
import { existsSync } from "node:fs";
const environment = path.resolve(process.cwd(), "../../.env");
if (existsSync(environment)) process.loadEnvFile(environment);

const nextConfig: NextConfig = {
  distDir: process.env.SCHENGEN_BUILD_DIR || ".next",
  transpilePackages: ["@schengen/core", "@schengen/db"],
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};
export default nextConfig;
