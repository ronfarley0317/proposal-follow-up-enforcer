import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { AppConfig } from "../config.js";
import { ExecutionRepository } from "./repositories/execution-repository.js";
import { IdempotencyRepository } from "./repositories/idempotency-repository.js";
import { ProposalStateRepository } from "./repositories/proposal-state-repository.js";
import type { IdempotencyLookupResult, PersistExecutionInput, PersistenceAdapter } from "./types.js";

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS executions (
    execution_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_type TEXT NOT NULL,
    serialized_response TEXT NOT NULL,
    http_status_code INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_execution_id
  ON executions(execution_id);

  CREATE INDEX IF NOT EXISTS idx_executions_idempotency_key
  ON executions(idempotency_key);

  CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    execution_id TEXT NOT NULL UNIQUE,
    response_type TEXT NOT NULL,
    serialized_response TEXT NOT NULL,
    http_status_code INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(execution_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_records_idempotency_key
  ON idempotency_records(idempotency_key);

  CREATE TABLE IF NOT EXISTS proposal_enforcement_states (
    proposal_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    current_follow_up_stage TEXT NOT NULL,
    touch_counter INTEGER NOT NULL DEFAULT 0,
    last_outreach_at TEXT NOT NULL,
    last_decision_code TEXT,
    last_action_status TEXT NOT NULL,
    last_suppression_reason TEXT,
    last_escalation_status TEXT,
    latest_known_proposal_status TEXT NOT NULL,
    terminal_state INTEGER NOT NULL DEFAULT 0,
    last_request_hash TEXT NOT NULL,
    last_execution_id TEXT NOT NULL,
    last_response_type TEXT NOT NULL,
    last_evaluated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (last_execution_id) REFERENCES executions(execution_id)
  );

  CREATE INDEX IF NOT EXISTS idx_proposal_states_owner_id
  ON proposal_enforcement_states(owner_id);
`;

export class SqlitePersistenceAdapter implements PersistenceAdapter {
  private readonly database: Database.Database;
  private readonly executionRepository: ExecutionRepository;
  private readonly idempotencyRepository: IdempotencyRepository;
  private readonly proposalStateRepository: ProposalStateRepository;

  constructor(private readonly config: AppConfig) {
    const databasePath = path.resolve(process.cwd(), config.SQLITE_DB_PATH);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    this.database = new Database(databasePath);
    this.executionRepository = new ExecutionRepository(this.database);
    this.idempotencyRepository = new IdempotencyRepository(this.database);
    this.proposalStateRepository = new ProposalStateRepository(this.database);
  }

  async init() {
    this.database.exec(SCHEMA_SQL);
  }

  async healthCheck() {
    const row = this.database.prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
    return row?.ok === 1;
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
