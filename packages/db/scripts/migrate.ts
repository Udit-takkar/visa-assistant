import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDatabase, getPool } from "../src/client";
config({ path: "../../.env", quiet: true });
try {
  await migrate(getDatabase(), { migrationsFolder: "./migrations" });
  console.log("Database migrations applied.");
} finally {
  await getPool().end();
}
