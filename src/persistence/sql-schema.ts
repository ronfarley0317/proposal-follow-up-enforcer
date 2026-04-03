export const SQLITE_INITIAL_SCHEMA_SQL = `

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

export const POSTGRES_INITIAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS executions (
    execution_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_type TEXT NOT NULL,
    serialized_response TEXT NOT NULL,
    http_status_code INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_executions_execution_id
  ON executions(execution_id);

  CREATE INDEX IF NOT EXISTS idx_executions_idempotency_key
  ON executions(idempotency_key);

  CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    execution_id TEXT NOT NULL UNIQUE REFERENCES executions(execution_id),
    response_type TEXT NOT NULL,
    serialized_response TEXT NOT NULL,
    http_status_code INTEGER NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL
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
    last_outreach_at TIMESTAMPTZ NOT NULL,
    last_decision_code TEXT,
    last_action_status TEXT NOT NULL,
    last_suppression_reason TEXT,
    last_escalation_status TEXT,
    latest_known_proposal_status TEXT NOT NULL,
    terminal_state BOOLEAN NOT NULL DEFAULT FALSE,
    last_request_hash TEXT NOT NULL,
    last_execution_id TEXT NOT NULL REFERENCES executions(execution_id),
    last_response_type TEXT NOT NULL,
    last_evaluated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_proposal_states_owner_id
  ON proposal_enforcement_states(owner_id);
`;
