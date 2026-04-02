import type { AppConfig } from "../config.js";
import { SqlitePersistenceAdapter } from "./sqlite.js";
import type { PersistenceAdapter } from "./types.js";

export async function createPersistenceAdapter(config: AppConfig): Promise<PersistenceAdapter> {
  const adapter = new SqlitePersistenceAdapter(config);
  await adapter.init();
  return adapter;
}
