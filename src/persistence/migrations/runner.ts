import type Database from "better-sqlite3";
import type { Pool, PoolClient } from "pg";

import type { PostgresMigration } from "./postgres-types.js";
import type { SqliteMigration } from "./types.js";

type AppliedMigrationRow = {
  version: number;
};

export function ensureMigrationTables(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

export function getCurrentSchemaVersion(database: Database.Database) {
  const row = database
    .prepare(
      `
        SELECT MAX(version) AS version
        FROM schema_migrations
      `
    )
    .get() as AppliedMigrationRow | undefined;

  return row?.version ?? 0;
}

export function runSqliteMigrations(database: Database.Database, migrations: SqliteMigration[]) {
  ensureMigrationTables(database);

  const appliedVersions = new Set(
    (
      database
        .prepare(
          `
            SELECT version
            FROM schema_migrations
            ORDER BY version ASC
          `
        )
        .all() as AppliedMigrationRow[]
    ).map((row) => row.version)
  );

  const orderedMigrations = [...migrations].sort((left, right) => left.version - right.version);

  for (const migration of orderedMigrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    const transaction = database.transaction(() => {
      migration.up(database);
      database
        .prepare(
          `
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES (?, ?, ?)
          `
        )
        .run(migration.version, migration.name, new Date().toISOString());
    });

    transaction();
  }
}

async function ensurePostgresMigrationTables(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);
}

export async function getCurrentPostgresSchemaVersion(pool: Pool) {
  const result = await pool.query<{ version: number | null }>(
    `
      SELECT MAX(version) AS version
      FROM schema_migrations
    `
  );

  return result.rows[0]?.version ?? 0;
}

export async function runPostgresMigrations(pool: Pool, migrations: PostgresMigration[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensurePostgresMigrationTables(client);

    const appliedResult = await client.query<AppliedMigrationRow>(
      `
        SELECT version
        FROM schema_migrations
        ORDER BY version ASC
      `
    );

    const appliedVersions = new Set(appliedResult.rows.map((row) => row.version));
    const orderedMigrations = [...migrations].sort((left, right) => left.version - right.version);

    for (const migration of orderedMigrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await client.query(migration.up);
      await client.query(
        `
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES ($1, $2, $3)
        `,
        [migration.version, migration.name, new Date().toISOString()]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
