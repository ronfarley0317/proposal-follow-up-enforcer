# Migrations

This runtime now uses versioned migrations for both SQLite and PostgreSQL.

## Rules

- Never modify an existing applied migration.
- Add a new numbered migration file for every schema change.
- Keep migrations append-only.
- The current schema version is stored in `schema_migrations`.
- Keep SQLite and PostgreSQL schema versions aligned by migration number.

## Current Version

- `1` -> `001_initial_schema`

## Local Usage

```bash
npm run migrate
```

This bootstraps the configured database backend and applies any pending migrations.

Backend selection:

- `DB_CLIENT=sqlite` uses `SQLITE_DB_PATH`
- `DB_CLIENT=postgres` uses `POSTGRES_URL`

## Readiness

`GET /ready` now reports the detected schema version in the readiness payload.
