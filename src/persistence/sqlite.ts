import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { AppConfig } from "../config.js";
import { sqliteMigrations } from "./migrations/index.js";
import { getCurrentSchemaVersion, runSqliteMigrations } from "./migrations/runner.js";
import { ExecutionRepository } from "./repositories/execution-repository.js";
import { IdempotencyRepository } from "./repositories/idempotency-repository.js";
import { ProposalStateRepository } from "./repositories/proposal-state-repository.js";
import type { IdempotencyLookupResult, PersistExecutionInput, PersistenceAdapter } from "./types.js";

export class SqlitePersistenceAdapter implements PersistenceAdapter {
  private readonly database: Database.Database;
  private readonly executionRepository: ExecutionRepository;
  private readonly idempotencyRepository: IdempotencyRepository;
  private readonly proposalStateRepository: ProposalStateRepository;

  constructor(private readonly config: AppConfig) {
    const databasePath = path.resolve(process.cwd(), config.SQLITE_DB_PATH);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    this.database = new Database(databasePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");

    this.executionRepository = new ExecutionRepository(this.database);
    this.idempotencyRepository = new IdempotencyRepository(this.database);
    this.proposalStateRepository = new ProposalStateRepository(this.database);
  }

  async init() {
    runSqliteMigrations(this.database, sqliteMigrations);
  }

  async healthCheck() {
    const row = this.database.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    return row?.ok === 1;
  }

  async getSchemaVersion() {
    return getCurrentSchemaVersion(this.database);
  }

  async getIdempotencyResult(idempotencyKey: string, requestHash: string): Promise<IdempotencyLookupResult> {
    const record = this.idempotencyRepository.findByKey(idempotencyKey);

    if (!record) {
      return { status: "miss" };
    }

    if (record.requestHash === requestHash) {
      this.idempotencyRepository.touch(idempotencyKey, new Date().toISOString());
      return { status: "replay", record };
    }

    return { status: "conflict", record };
  }

  async findExecutionById(executionId: string) {
    return this.executionRepository.findByExecutionId(executionId);
  }

  async findIdempotencyRecord(idempotencyKey: string) {
    return this.idempotencyRepository.findByKey(idempotencyKey);
  }

  async getProposalState(proposalId: string) {
    return this.proposalStateRepository.findByProposalId(proposalId);
  }

  async persistExecution(input: PersistExecutionInput) {
    const serializedResponse = JSON.stringify(input.response);

    const transaction = this.database.transaction(() => {
      this.executionRepository.insert(input);
      this.proposalStateRepository.upsertFromExecution(input);
      this.idempotencyRepository.insert({
        idempotencyKey: input.request.idempotency_key,
        requestHash: input.requestHash,
        executionId: input.executionId,
        responseType: input.response.response_type,
        serializedResponse,
        httpStatusCode: input.httpStatusCode,
        now: input.now
      });
    });

    transaction();
  }

  async close() {
    this.database.close();
  }
}
