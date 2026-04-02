# Proposal Follow-Up Enforcer Runbook

## Local Startup

1. `cp .env.example .env`
2. `npm install`
3. `npm run migrate`
4. `npm run dev`

## Production Startup on Hostinger VPS

1. Copy the project to `/var/www/proposal-follow-up-enforcer-runtime`
2. Create a production `.env` with non-placeholder secrets
3. Run:

```bash
cd /var/www/proposal-follow-up-enforcer-runtime
npm ci
npm run build
npm run migrate
```

4. Start using one of:

```bash
pm2 start ecosystem.config.cjs
```

or

```bash
sudo systemctl start proposal-follow-up-enforcer-runtime
```

## Health / Readiness Checks

- Liveness: `GET /health`
- Readiness: `GET /ready`

Expected:
- `/health` returns `200` if process is alive
- `/ready` returns `200` only if persistence is healthy and required config is valid
- `/ready` returns `503` on DB outage or invalid AI drafting config

## Common Failure Investigation

### `401 AUTH_INVALID`
- verify bearer token in `Authorization`
- confirm `.env` secret matches `n8n`

### `401 SIGNATURE_INVALID`
- confirm HMAC input is exactly `${timestamp}.${rawBody}`
- confirm timestamp and body were not altered between signing and send

### `422 MISSING_REQUIRED_FIELDS`
- inspect `details` array in the response
- fix the normalized payload in `n8n`

### `422 UNSUPPORTED_API_VERSION`
- confirm `api_version` matches runtime config, currently `1.0`

### `409 IDEMPOTENCY_CONFLICT`
- same `idempotency_key` was reused with a different payload
- treat this as a producer bug, not a retry

### `503 PERSISTENCE_UNAVAILABLE`
- inspect SQLite file path or database mount
- inspect file permissions
- inspect `/ready`

## Replay / Retry Handling

- safe retries must reuse the same `idempotency_key`
- identical retries return the stored logical response
- conflicting retries with different payload content will be rejected
- use a new `idempotency_key` only for a genuinely new evaluation window

## Log Review

- application logs are structured JSON
- secrets and sensitive values are redacted or masked
- focus on:
  - `request_id`
  - `idempotency_key`
  - `execution_id`
  - `decision_code`
  - `response_type`
  - `error_code`

## Operational Recovery

1. Check `/ready`
2. Review most recent logs
3. Verify database file exists and is writable
4. Retry with the same request if the failure was transient
5. If retry must not replay, use a new idempotency key only after confirming a new evaluation is intended
