import "dotenv/config";

import { loadConfig } from "../config.js";
import { createPersistenceAdapter } from "../persistence/index.js";

async function main() {
  const config = loadConfig();
  const persistence = await createPersistenceAdapter(config);
  const schemaVersion = await persistence.getSchemaVersion();
  await persistence.close();
  const target = config.DB_CLIENT === "postgres" ? "POSTGRES_URL" : config.SQLITE_DB_PATH;
  console.log(
    `Persistence schema initialized for ${config.DB_CLIENT} at ${target} (schema version ${schemaVersion})`
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
