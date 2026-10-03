import { config } from "dotenv";
import { seedInitialSource, getPool } from "../src/index";
config({ path: "../../.env", quiet: true });
try {
  await seedInitialSource();
  console.log(
    "Selected source registered; no applicant text or claims seeded.",
  );
} finally {
  await getPool().end();
}
