import type Database from "better-sqlite3";

import type { PersistExecutionInput } from "../types.js";
import type { StoredProposalState } from "../types.js";

type ProposalStateRow = {
  proposal_id: string;
  account_id: string;
  contact_id: string;
  owner_id: string;
  current_follow_up_stage: string;
  touch_counter: number;
  last_outreach_at: string;
  last_decision_code: string | null;
  last_action_status: string;
  last_suppression_reason: string | null;
  last_escalation_status: string | null;
  latest_known_proposal_status: string;
  terminal_state: number;
  last_request_hash: string;
  last_execution_id: string;
  last_response_type: string;
  last_evaluated_at: string;
  created_at: string;
  updated_at: string;
};

export class ProposalStateRepository {
  constructor(private readonly database: Database.Database) {}

  findByProposalId(proposalId: string): StoredProposalState | null {
    const row = this.database
      .prepare(
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
          WHERE proposal_id = ?
        `
      )
      .get(proposalId) as ProposalStateRow | undefined;

    if (!row) {
      return null;
    }

    return {
      proposalId: row.proposal_id,
      accountId: row.account_id,
      contactId: row.contact_id,
      ownerId: row.owner_id,
      currentFollowUpStage: row.current_follow_up_stage,
      touchCounter: row.touch_counter,
      lastOutreachAt: row.last_outreach_at,
      lastDecisionCode: row.last_decision_code,
      lastActionStatus: row.last_action_status as StoredProposalState["lastActionStatus"],
      lastSuppressionReason: row.last_suppression_reason,
      lastEscalationStatus: row.last_escalation_status,
      latestKnownProposalStatus: row.latest_known_proposal_status,
      terminalState: row.terminal_state === 1,
      lastRequestHash: row.last_request_hash,
      lastExecutionId: row.last_execution_id,
      lastResponseType: row.last_response_type as StoredProposalState["lastResponseType"],
      lastEvaluatedAt: row.last_evaluated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertFromExecution(input: PersistExecutionInput) {
    const payload = input.request.inputs.normalized_payload;
    const nextState = input.nextState;

    this.database
      .prepare(
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
            @proposal_id,
            @account_id,
            @contact_id,
            @owner_id,
            @current_follow_up_stage,
            @touch_counter,
            @last_outreach_at,
            @last_decision_code,
            @last_action_status,
            @last_suppression_reason,
            @last_escalation_status,
            @latest_known_proposal_status,
            @terminal_state,
            @last_request_hash,
            @last_execution_id,
            @last_response_type,
            @last_evaluated_at,
            @created_at,
            @updated_at
          )
          ON CONFLICT(proposal_id) DO UPDATE SET
            account_id = excluded.account_id,
            contact_id = excluded.contact_id,
            owner_id = excluded.owner_id,
            current_follow_up_stage = excluded.current_follow_up_stage,
            touch_counter = excluded.touch_counter,
            last_outreach_at = excluded.last_outreach_at,
            last_decision_code = excluded.last_decision_code,
            last_action_status = excluded.last_action_status,
            last_suppression_reason = excluded.last_suppression_reason,
            last_escalation_status = excluded.last_escalation_status,
            latest_known_proposal_status = excluded.latest_known_proposal_status,
            terminal_state = excluded.terminal_state,
            last_request_hash = excluded.last_request_hash,
            last_execution_id = excluded.last_execution_id,
            last_response_type = excluded.last_response_type,
            last_evaluated_at = excluded.last_evaluated_at,
            updated_at = excluded.updated_at
        `
      )
      .run({
        proposal_id: payload.proposal_id,
        account_id: payload.account_id,
        contact_id: payload.contact_id,
        owner_id: payload.owner_id,
        current_follow_up_stage: nextState.currentFollowUpStage,
        touch_counter: nextState.touchCounter,
        last_outreach_at: payload.last_outreach_at,
        last_decision_code: nextState.lastDecisionCode,
        last_action_status: nextState.lastActionStatus,
        last_suppression_reason: nextState.lastSuppressionReason,
        last_escalation_status: nextState.lastEscalationStatus,
        latest_known_proposal_status: nextState.latestKnownProposalStatus,
        terminal_state: nextState.terminalState ? 1 : 0,
        last_request_hash: input.requestHash,
        last_execution_id: input.executionId,
        last_response_type: input.response.response_type,
        last_evaluated_at: nextState.lastEvaluatedAt,
        created_at: input.now,
        updated_at: input.now
      });
  }
}
