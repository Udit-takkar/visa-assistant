import { config } from "dotenv";
import { indexCapturedPassages, getPool } from "../src/index";
config({ path: "../../.env", quiet: true });
try {
  console.log(await indexCapturedPassages());
} finally { await getPool().end(); }
