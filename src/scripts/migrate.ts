import "dotenv/config";

import { loadConfig } from "../config.js";
import { createPersistenceAdapter } from "../persistence/index.js";

async function main() {
  const config = loadConfig();
  const persistence = await createPersistenceAdapter(config);
  await persistence.close();
  console.log(`Persistence schema initialized for ${config.DB_CLIENT} at ${config.SQLITE_DB_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
