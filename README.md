# Proposal Follow-Up Enforcer Runtime

Milestone 1 service skeleton for the Proposal Follow-Up Enforcer.

This service currently provides:

- `POST /api/v1/decide` with request validation and auth scaffolding
- `GET /health`
- `GET /ready`
- structured JSON logging
- environment-based config loading
- bearer token authentication
- HMAC signature verification

This milestone does not yet provide:

- decision logic
- persistence
- dashboard event generation

Milestones implemented now include:

- validated handoff contract
- persistence and idempotency
- deterministic decision engine
- canonical event generation
- proposal state transitions
- production hardening

## Requirements

- Node.js `20.11+`
- npm `10+`

## Setup

```bash
cd "/Users/physis/Documents/New project/proposal-follow-up-enforcer-runtime"
cp .env.example .env
npm install
```

## Run locally

Development:

```bash
npm run dev
```

Initialize the local database:

```bash
npm run migrate
```

Production build:

```bash
npm run build
npm start
```

## Production run on Hostinger VPS

1. Install Node.js 20+ and build tools.
2. Copy the project to `/var/www/proposal-follow-up-enforcer-runtime`.
3. Create `.env` with production secrets and non-placeholder values.
4. Install dependencies and build:

```bash
cd /var/www/proposal-follow-up-enforcer-runtime
npm ci
npm run build
npm run migrate
```

5. Run with `pm2`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Or run with `systemd`:

```bash
sudo cp deploy/systemd/proposal-follow-up-enforcer-runtime.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable proposal-follow-up-enforcer-runtime
sudo systemctl start proposal-follow-up-enforcer-runtime
sudo systemctl status proposal-follow-up-enforcer-runtime
```

6. Put Nginx in front of the app and proxy to `127.0.0.1:8080`.

## Production safety notes

- `/ready` returns `503` if persistence is unavailable or AI drafting is enabled without a provider key.
- production startup rejects placeholder secrets by default
- request logging masks email addresses and redacts auth/signature headers
- persistence calls are timeout-guarded
- duplicate requests remain idempotent through stored response replay
- process restarts are safe because execution/idempotency/state are persisted

## Endpoints

- `POST /api/v1/decide`
- `GET /health`
- `GET /ready`

## Example local request

Generate a signature over:

```text
${X-Timestamp}.${rawRequestBody}
```

Then call:

```bash
curl -X POST http://localhost:8080/api/v1/decide \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer replace-with-strong-shared-token" \
  -H "X-Request-Id: req_local_001" \
  -H "X-Idempotency-Key: proposal_123:proposal_silence_72h:2026-04-02T10" \
  -H "X-Orchestrator: n8n" \
  -H "X-Orchestrator-Workflow-Id: wf_local_001" \
  -H "X-Timestamp: 2026-04-02T14:00:00Z" \
  -H "X-Signature: sha256=<computed_hmac>" \
  -d '{
    "api_version": "1.0",
    "request_id": "req_local_001",
    "idempotency_key": "proposal_123:proposal_silence_72h:2026-04-02T10",
    "sent_at": "2026-04-02T14:00:00Z",
    "orchestrator": {
      "name": "n8n",
      "workflow_id": "wf_local_001",
      "workflow_execution_id": "wfe_local_001",
      "node_id": "http_request_1",
      "environment": "development"
    },
    "agent": {
      "agent_id": "proposal-follow-up-enforcer",
      "agent_version": "v1.0.0",
      "policy_version": "2026-04"
    },
    "trigger": {
      "trigger_type": "proposal_silence_72h",
      "trigger_id": "trg_local_001",
      "trigger_time": "2026-04-02T13:59:00Z",
      "source_systems": ["crm", "proposal_platform", "email_log", "n8n"]
    },
    "entity": {
      "entity_type": "proposal",
      "entity_id": "proposal_123",
      "customer_id": "cust_456",
      "account_id": "acct_789"
    },
    "inputs": {
      "normalized_payload": {
        "proposal_id": "proposal_123",
        "contact_email": "buyer@example.com",
        "proposal_value": 4200,
        "currency": "USD",
        "sent_at": "2026-03-30T14:00:00Z",
        "proposal_status": "sent",
        "owner_id": "owner_001",
        "owner_name": "Jane Owner",
        "owner_email": "owner@example.com",
        "follow_up_stage": "stage_1",
        "proposal_url": "https://example.com/proposals/123",
        "pipeline_source": "web_form",
        "service_category": "roofing"
      }
    },
    "options": {
      "dry_run": false,
      "require_dashboard_events": true,
      "response_detail": "full"
    }
  }'
```

At this milestone, the endpoint returns `501 Not Implemented` after successful auth and validation.
