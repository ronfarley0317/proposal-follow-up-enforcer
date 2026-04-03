import { Pool } from "pg";

import type { AppConfig } from "../config.js";
import { postgresMigrations } from "./migrations/postgres-index.js";
import { getCurrentPostgresSchemaVersion, runPostgresMigrations } from "./migrations/runner.js";
import type {
  IdempotencyLookupResult,
  PersistExecutionInput,
  PersistenceAdapter,
  StoredExecutionRecord,
  StoredIdempotencyRecord,
  StoredProposalState
} from "./types.js";

type ExecutionRow = {
  execution_id: string;
  request_id: string;
  idempotency_key: string;
  request_hash: string;
  response_type: string;
  serialized_response: string;
  http_status_code: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type IdempotencyRow = {
  idempotency_key: string;
  request_hash: string;
  execution_id: string;
  response_type: string;
  serialized_response: string;
  http_status_code: number;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
};

type ProposalStateRow = {
  proposal_id: string;
  account_id: string;
  contact_id: string;
  owner_id: string;
  current_follow_up_stage: string;
  touch_counter: number;
  last_outreach_at: Date | string;
  last_decision_code: string | null;
  last_action_status: string;
  last_suppression_reason: string | null;
  last_escalation_status: string | null;
  latest_known_proposal_status: string;
  terminal_state: boolean;
  last_request_hash: string;
  last_execution_id: string;
  last_response_type: string;
  last_evaluated_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function asIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapExecutionRow(row: ExecutionRow): StoredExecutionRecord {
  return {
    executionId: row.execution_id,
    requestId: row.request_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    responseType: row.response_type as StoredExecutionRecord["responseType"],
    serializedResponse: row.serialized_response,
    httpStatusCode: row.http_status_code,
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at)
  };
}

function mapIdempotencyRow(row: IdempotencyRow): StoredIdempotencyRecord {
  return {
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    executionId: row.execution_id,
    responseType: row.response_type as StoredIdempotencyRecord["responseType"],
    serializedResponse: row.serialized_response,
    httpStatusCode: row.http_status_code,
    firstSeenAt: asIsoString(row.first_seen_at),
    lastSeenAt: asIsoString(row.last_seen_at)
  };
}

function mapProposalStateRow(row: ProposalStateRow): StoredProposalState {
  return {
    proposalId: row.proposal_id,
    accountId: row.account_id,
    contactId: row.contact_id,
    ownerId: row.owner_id,
    currentFollowUpStage: row.current_follow_up_stage,
    touchCounter: row.touch_counter,
    lastOutreachAt: asIsoString(row.last_outreach_at),
    lastDecisionCode: row.last_decision_code,
    lastActionStatus: row.last_action_status as StoredProposalState["lastActionStatus"],
    lastSuppressionReason: row.last_suppression_reason,
    lastEscalationStatus: row.last_escalation_status,
    latestKnownProposalStatus: row.latest_known_proposal_status,
    terminalState: row.terminal_state,
    lastRequestHash: row.last_request_hash,
    lastExecutionId: row.last_execution_id,
    lastResponseType: row.last_response_type as StoredProposalState["lastResponseType"],
    lastEvaluatedAt: asIsoString(row.last_evaluated_at),
    createdAt: asIsoString(row.created_at),
    updatedAt: asIsoString(row.updated_at)
  };
}

export class PostgresPersistenceAdapter implements PersistenceAdapter {
  private readonly pool: Pool;

  constructor(private readonly config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.POSTGRES_URL,
      ssl: config.POSTGRES_SSL_MODE === "require" ? { rejectUnauthorized: false } : false,
      max: config.POSTGRES_MAX_CONNECTIONS
    });
  }

  async init() {
    await runPostgresMigrations(this.pool, postgresMigrations);
  }

  async healthCheck() {
    const result = await this.pool.query<{ ok: number }>("SELECT 1 AS ok");
    return result.rows[0]?.ok === 1;
  }

  async getSchemaVersion() {
    return getCurrentPostgresSchemaVersion(this.pool);
  }

  async getIdempotencyResult(idempotencyKey: string, requestHash: string): Promise<IdempotencyLookupResult> {
    const result = await this.pool.query<IdempotencyRow>(
      `
        SELECT
          idempotency_key,
          request_hash,
          execution_id,
          response_type,
          serialized_response,
          http_status_code,
          first_seen_at,
          last_seen_at
        FROM idempotency_records
        WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    const row = result.rows[0];

    if (!row) {
      return { status: "miss" };
    }

    const record = mapIdempotencyRow(row);

    if (record.requestHash === requestHash) {
      await this.pool.query(
        `
          UPDATE idempotency_records
          SET last_seen_at = $1
          WHERE idempotency_key = $2
        `,
        [new Date().toISOString(), idempotencyKey]
      );

      return { status: "replay", record };
    }

    return { status: "conflict", record };
  }

  async findExecutionById(executionId: string) {
    const result = await this.pool.query<ExecutionRow>(
      `
        SELECT
          execution_id,
          request_id,
          idempotency_key,
          request_hash,
          response_type,
          serialized_response,
          http_status_code,
          created_at,
          updated_at
        FROM executions
        WHERE execution_id = $1
      `,
      [executionId]
    );

    return result.rows[0] ? mapExecutionRow(result.rows[0]) : null;
  }

  async findIdempotencyRecord(idempotencyKey: string) {
    const result = await this.pool.query<IdempotencyRow>(
      `
        SELECT
          idempotency_key,
          request_hash,
          execution_id,
          response_type,
          serialized_response,
          http_status_code,
          first_seen_at,
          last_seen_at
        FROM idempotency_records
        WHERE idempotency_key = $1
      `,
      [idempotencyKey]
    );

    return result.rows[0] ? mapIdempotencyRow(result.rows[0]) : null;
  }

  async getProposalState(proposalId: string) {
    const result = await this.pool.query<ProposalStateRow>(
      `
        SELECT
          proposal_id,
          account_id,
          contact_id,
          owner_id,
          current_follow_up_stage,
          touch_counter,
          last_outreach_at,
          last_decision_code,
          last_action_status,
          last_suppression_reason,
          last_escalation_status,
          latest_known_proposal_status,
          terminal_state,
          last_request_hash,
          last_execution_id,
          last_response_type,
          last_evaluated_at,
          created_at,
          updated_at
        FROM proposal_enforcement_states
        WHERE proposal_id = $1
      `,
      [proposalId]
    );

    return result.rows[0] ? mapProposalStateRow(result.rows[0]) : null;
  }

  async persistExecution(input: PersistExecutionInput) {
    const payload = input.request.inputs.normalized_payload;
    const nextState = input.nextState;
    const serializedResponse = JSON.stringify(input.response);
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          INSERT INTO executions (
            execution_id,
            request_id,
            idempotency_key,
            request_hash,
            response_type,
            serialized_response,
            http_status_code,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          input.executionId,
          input.request.request_id,
          input.request.idempotency_key,
          input.requestHash,
          input.response.response_type,
          serializedResponse,
          input.httpStatusCode,
          input.now,
          input.now
        ]
      );

      await client.query(
        `
          INSERT INTO proposal_enforcement_states (
            proposal_id,
            account_id,
            contact_id,
            owner_id,
            current_follow_up_stage,
            touch_counter,
            last_outreach_at,
            last_decision_code,
            last_action_status,
            last_suppression_reason,
            last_escalation_status,
            latest_known_proposal_status,
            terminal_state,
            last_request_hash,
            last_execution_id,
            last_response_type,
            last_evaluated_at,
            created_at,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (proposal_id) DO UPDATE SET
            account_id = EXCLUDED.account_id,
            contact_id = EXCLUDED.contact_id,
            owner_id = EXCLUDED.owner_id,
            current_follow_up_stage = EXCLUDED.current_follow_up_stage,
            touch_counter = EXCLUDED.touch_counter,
            last_outreach_at = EXCLUDED.last_outreach_at,
            last_decision_code = EXCLUDED.last_decision_code,
            last_action_status = EXCLUDED.last_action_status,
            last_suppression_reason = EXCLUDED.last_suppression_reason,
            last_escalation_status = EXCLUDED.last_escalation_status,
            latest_known_proposal_status = EXCLUDED.latest_known_proposal_status,
            terminal_state = EXCLUDED.terminal_state,
            last_request_hash = EXCLUDED.last_request_hash,
            last_execution_id = EXCLUDED.last_execution_id,
            last_response_type = EXCLUDED.last_response_type,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          payload.proposal_id,
          payload.account_id,
          payload.contact_id,
          payload.owner_id,
          nextState.currentFollowUpStage,
          nextState.touchCounter,
          payload.last_outreach_at,
          nextState.lastDecisionCode,
          nextState.lastActionStatus,
          nextState.lastSuppressionReason,
          nextState.lastEscalationStatus,
          nextState.latestKnownProposalStatus,
          nextState.terminalState,
          input.requestHash,
          input.executionId,
          input.response.response_type,
          nextState.lastEvaluatedAt,
          input.now,
          input.now
        ]
      );

      await client.query(
        `
          INSERT INTO idempotency_records (
            idempotency_key,
            request_hash,
            execution_id,
            response_type,
            serialized_response,
            http_status_code,
            first_seen_at,
            last_seen_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          input.request.idempotency_key,
          input.requestHash,
          input.executionId,
          input.response.response_type,
          serializedResponse,
          input.httpStatusCode,
          input.now,
          input.now
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
