import { migration001InitialPostgresSchema } from "./001_initial_schema.postgres.js";
import type { PostgresMigration } from "./postgres-types.js";

export const postgresMigrations: PostgresMigration[] = [migration001InitialPostgresSchema];
