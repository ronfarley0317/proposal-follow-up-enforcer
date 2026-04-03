import type { RuntimeRequest } from "../contracts/runtime-request.js";
import type { RuntimeResponse } from "../contracts/runtime-response.js";
import type { ProposalLifecycleState } from "../state/types.js";

export type IdempotencyLookupResult =
  | {
      status: "miss";
    }
  | {
      status: "replay";
      record: StoredIdempotencyRecord;
    }
  | {
      status: "conflict";
      record: StoredIdempotencyRecord;
    };

export type StoredExecutionRecord = {
  executionId: string;
  requestId: string;
  idempotencyKey: string;
  requestHash: string;
  responseType: RuntimeResponse["response_type"];
  serializedResponse: string;
  httpStatusCode: number;
  createdAt: string;
  updatedAt: string;
};

export type StoredProposalState = {
  proposalId: string;
  accountId: string;
  contactId: string;
  ownerId: string;
  currentFollowUpStage: string;
  touchCounter: number;
  lastOutreachAt: string;
  lastDecisionCode: string | null;
  lastActionStatus: RuntimeResponse["action"]["action_status"];
  lastSuppressionReason: string | null;
  lastEscalationStatus: string | null;
  latestKnownProposalStatus: string;
  terminalState: boolean;
  lastRequestHash: string;
  lastExecutionId: string;
  lastResponseType: RuntimeResponse["response_type"];
  lastEvaluatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredIdempotencyRecord = {
  idempotencyKey: string;
  requestHash: string;
  executionId: string;
  responseType: RuntimeResponse["response_type"];
  serializedResponse: string;
  httpStatusCode: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type PersistExecutionInput = {
  request: RuntimeRequest;
  requestHash: string;
  executionId: string;
  httpStatusCode: number;
  response: RuntimeResponse;
  nextState: ProposalLifecycleState;
  now: string;
};

export interface PersistenceAdapter {
  init(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getSchemaVersion(): Promise<number>;
  getIdempotencyResult(idempotencyKey: string, requestHash: string): Promise<IdempotencyLookupResult>;
  findExecutionById(executionId: string): Promise<StoredExecutionRecord | null>;
  findIdempotencyRecord(idempotencyKey: string): Promise<StoredIdempotencyRecord | null>;
  getProposalState(proposalId: string): Promise<StoredProposalState | null>;
  persistExecution(input: PersistExecutionInput): Promise<void>;
  close(): Promise<void>;
}
