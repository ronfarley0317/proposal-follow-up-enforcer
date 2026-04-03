import { POSTGRES_INITIAL_SCHEMA_SQL } from "../sql-schema.js";
import type { PostgresMigration } from "./postgres-types.js";

export const migration001InitialPostgresSchema: PostgresMigration = {
  version: 1,
  name: "001_initial_schema",
  up: POSTGRES_INITIAL_SCHEMA_SQL
};
