# Client Deployment Standard

This document standardizes how to stand up the runtime for a new SMB client.

Use it when you need one repeatable sequence for:

- environment setup
- PostgreSQL setup
- Hostinger VPS setup
- n8n workflow mapping
- deployment smoke tests

## 1. Deployment Shape

Recommended client deployment:

- one Hostinger VPS
- one PostgreSQL database
- one runtime deployment from this repo
- one n8n workflow set that calls the runtime

Production requirements:

- `DB_CLIENT=postgres`
- strong `RUNTIME_BEARER_TOKEN`
- strong `RUNTIME_HMAC_SECRET`
- `NODE_ENV=production`

## 2. Environment Standard

Minimum production `.env` values:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=8080

RUNTIME_BEARER_TOKEN=<strong-random-token>
RUNTIME_HMAC_SECRET=<strong-random-secret>

DB_CLIENT=postgres
POSTGRES_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
POSTGRES_SSL_MODE=require
POSTGRES_MAX_CONNECTIONS=10

FOLLOW_UP_1_DELAY_HOURS=24
FOLLOW_UP_2_DELAY_HOURS=72
CALL_TASK_DELAY_DAYS=7
ESCALATION_VALUE_THRESHOLD=5000
HIGH_VALUE_APPROVAL_THRESHOLD=15000
RECENT_REPLY_SUPPRESSION_HOURS=72
RECENT_OUTREACH_SUPPRESSION_HOURS=24
```

Client-specific values to decide before launch:

- follow-up timing thresholds
- escalation threshold
- approval threshold
- sensitive segments
- high-risk service categories

## 3. PostgreSQL Setup Standard

For each new client:

1. Create a dedicated database and user.
2. Confirm TLS requirements with the provider.
3. Put the final URL into `POSTGRES_URL`.
4. Run:

```bash
npm ci
npm run build
npm run migrate
```

5. Confirm `/ready` returns `200`.

## 4. Hostinger VPS Standard

Base setup:

1. Install Node.js 20.
2. Install Nginx.
3. Install PM2 or systemd.
4. Put the repo at:

```bash
/var/www/proposal-follow-up-enforcer-runtime
```

5. Copy the production `.env`.
6. Run build and migrations.
7. Start the service.
8. Put Nginx in front of `127.0.0.1:8080`.

## 5. n8n Mapping Standard

Every client workflow should map CRM fields into one of two patterns:

1. Preferred: send canonical `inputs.normalized_payload`.
2. Allowed fallback: send `inputs.raw_payload` plus `inputs.normalization_hints.field_aliases`.

Minimum runtime handoff fields:

- proposal identifier
- account identifier
- contact identifier
- contact name
- contact email
- proposal value
- currency
- sent timestamp
- proposal status
- owner id
- owner name
- owner email
- last outreach timestamp
- follow-up stage
- proposal URL
- pipeline source
- service category

Required request protections:

- `Authorization: Bearer <RUNTIME_BEARER_TOKEN>`
- `X-Signature-HMAC-SHA256`
- timestamp header inside tolerance

## 6. Standard Smoke Test

After deploy, run:

```bash
npm run test:client-smoke
```

This verifies:

- `/health`
- `/ready`
- a signed `/api/v1/decide` request
- idempotent replay behavior
- execution lookup
- proposal state lookup
- proposal diagnostics lookup
- idempotency lookup

## 7. Launch Gate

A client deployment is not ready until all of these are true:

- `npm run build` passes
- `npm run migrate` passes
- `npm run test:v1` passes
- `npm run test:client-smoke` passes
- `/health` is `200`
- `/ready` is `200`
- one signed end-to-end n8n request succeeds
- one replay request returns the stored response
- one diagnostics lookup explains the latest outcome clearly
