import { migration001InitialSchema } from "./001_initial_schema.js";
import type { SqliteMigration } from "./types.js";

export const sqliteMigrations: SqliteMigration[] = [migration001InitialSchema];
