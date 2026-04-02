import type Database from "better-sqlite3";

import type { PersistExecutionInput, StoredExecutionRecord } from "../types.js";

type ExecutionRow = {
  execution_id: string;
  request_id: string;
  idempotency_key: string;
  request_hash: string;
  response_type: string;
  serialized_response: string;
  http_status_code: number;
  created_at: string;
  updated_at: string;
};

export class ExecutionRepository {
  constructor(private readonly database: Database.Database) {}

  insert(input: PersistExecutionInput) {
    const serializedResponse = JSON.stringify(input.response);
    this.database
      .prepare(
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
          ) VALUES (
            @execution_id,
            @request_id,
            @idempotency_key,
            @request_hash,
            @response_type,
            @serialized_response,
            @http_status_code,
            @created_at,
            @updated_at
          )
        `
      )
      .run({
        execution_id: input.executionId,
        request_id: input.request.request_id,
        idempotency_key: input.request.idempotency_key,
        request_hash: input.requestHash,
        response_type: input.response.response_type,
        serialized_response: serializedResponse,
        http_status_code: input.httpStatusCode,
        created_at: input.now,
        updated_at: input.now
      });
  }

  findByExecutionId(executionId: string): StoredExecutionRecord | null {
    const row = this.database
      .prepare(
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
          WHERE execution_id = ?
        `
      )
      .get(executionId) as ExecutionRow | undefined;

    if (!row) {
      return null;
    }

    return {
      executionId: row.execution_id,
      requestId: row.request_id,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      responseType: row.response_type as StoredExecutionRecord["responseType"],
      serializedResponse: row.serialized_response,
      httpStatusCode: row.http_status_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
