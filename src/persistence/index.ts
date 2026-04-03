import type { AppConfig } from "../config.js";
import { PostgresPersistenceAdapter } from "./postgres.js";
import { SqlitePersistenceAdapter } from "./sqlite.js";
import type { PersistenceAdapter } from "./types.js";

export async function createPersistenceAdapter(config: AppConfig): Promise<PersistenceAdapter> {
  const adapter =
    config.DB_CLIENT === "postgres"
      ? new PostgresPersistenceAdapter(config)
      : new SqlitePersistenceAdapter(config);
  await adapter.init();
  return adapter;
}
