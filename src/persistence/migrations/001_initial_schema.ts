import { SQLITE_INITIAL_SCHEMA_SQL } from "../sql-schema.js";
import type { SqliteMigration } from "./types.js";

export const migration001InitialSchema: SqliteMigration = {
  version: 1,
  name: "001_initial_schema",
  up(database) {
    database.exec(SQLITE_INITIAL_SCHEMA_SQL);
  }
};
