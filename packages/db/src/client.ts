import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const cache = globalThis as typeof globalThis & { schengenPool?: Pool };
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  cache.schengenPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
  });
  return cache.schengenPool;
}
export function getDatabase() {
  return drizzle(getPool(), { schema });
}
