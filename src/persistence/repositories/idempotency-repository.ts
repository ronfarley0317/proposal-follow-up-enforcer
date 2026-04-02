import type Database from "better-sqlite3";

import type { StoredIdempotencyRecord } from "../types.js";

type IdempotencyRow = {
  idempotency_key: string;
  request_hash: string;
  execution_id: string;
  response_type: string;
  serialized_response: string;
  http_status_code: number;
  first_seen_at: string;
  last_seen_at: string;
};

export class IdempotencyRepository {
  constructor(private readonly database: Database.Database) {}

  findByKey(idempotencyKey: string): StoredIdempotencyRecord | null {
    const row = this.database
      .prepare(
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
          WHERE idempotency_key = ?
        `
      )
      .get(idempotencyKey) as IdempotencyRow | undefined;

    if (!row) {
      return null;
    }

    return {
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      executionId: row.execution_id,
      responseType: row.response_type as StoredIdempotencyRecord["responseType"],
      serializedResponse: row.serialized_response,
      httpStatusCode: row.http_status_code,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at
    };
  }

  insert(params: {
    idempotencyKey: string;
    requestHash: string;
    executionId: string;
    responseType: string;
    serializedResponse: string;
    httpStatusCode: number;
    now: string;
  }) {
    this.database
      .prepare(
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
          ) VALUES (
            @idempotency_key,
            @request_hash,
            @execution_id,
            @response_type,
            @serialized_response,
            @http_status_code,
            @first_seen_at,
            @last_seen_at
          )
        `
      )
      .run({
        idempotency_key: params.idempotencyKey,
        request_hash: params.requestHash,
        execution_id: params.executionId,
        response_type: params.responseType,
        serialized_response: params.serializedResponse,
        http_status_code: params.httpStatusCode,
        first_seen_at: params.now,
        last_seen_at: params.now
      });
  }

  touch(idempotencyKey: string, lastSeenAt: string) {
    this.database
      .prepare(
        `
          UPDATE idempotency_records
          SET last_seen_at = ?
          WHERE idempotency_key = ?
        `
      )
      .run(lastSeenAt, idempotencyKey);
  }
}
