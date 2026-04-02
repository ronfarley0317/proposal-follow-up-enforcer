# Scenario Test Matrix

## Contract Tests

- Valid request/response shape
- Invalid auth
- Invalid signature
- Invalid JSON
- Missing required fields
- Unsupported `api_version`
- Invalid `agent.agent_id`

## Scenario Tests

- Won proposal -> suppressed
- Recent reply -> suppressed
- 24h silent proposal -> success
- 72h silent proposal -> success
- High-value silent proposal -> escalated
- Approval-threshold proposal -> pending_human
- Invalid payload timeline -> failed

## Failure Mode Tests

- Idempotent retry
- Conflicting payload with same idempotency key
- Persistence unavailable
- Optional AI drafting enabled/disabled without decision drift
- Readiness failure on dependency outage
