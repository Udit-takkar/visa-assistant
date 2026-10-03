import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDatabase, getPool, seedInitialSource } from "../src/index";
config({ path: "../../.env", quiet: true });
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Refusing to reset a database not ending in _test.");
try {
  await migrate(getDatabase(), { migrationsFolder: "./migrations" });
  await getPool().query("TRUNCATE passages, source_snapshots, observations, comments, sources, source_revisions");
  await seedInitialSource();
  console.log("Isolated browser-test database reset and seeded.");
} finally {
  await getPool().end();
}
