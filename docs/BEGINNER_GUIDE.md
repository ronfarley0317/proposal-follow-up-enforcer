# Proposal Follow-Up Enforcer Beginner Guide

This guide explains, in plain English:

- what this system does
- how it works
- how to run it locally
- how to deploy it for a client
- what to check if something breaks

Use this document if you are not a developer or if you want a simple operating guide instead of the technical runbook.

## 1. What This System Does

The `Proposal Follow-Up Enforcer` is a backend service that makes sure a sent proposal does not get forgotten.

Its job is to answer one question over and over:

`What should happen next for this proposal?`

Examples:

- do nothing because the customer already replied
- send follow-up 1
- send follow-up 2
- create a call task
- escalate to the owner
- require human review

It does **not** send emails by itself in this repo.

Instead:

- `n8n` sends proposal data into this runtime
- this runtime makes the decision
- `n8n` uses that decision to do the real work
- the runtime also returns dashboard-ready events for observability

## 2. How The Pieces Fit Together

There are four main parts:

1. `CRM / proposal tool`
   - stores proposals, contacts, owners, and status

2. `n8n`
   - watches for proposal events or time-based follow-up checks
   - sends normalized data to this runtime
   - uses the runtime response to send emails, create tasks, or escalate

3. `Proposal Follow-Up Enforcer runtime`
   - the service in this repo
   - validates input
   - applies deterministic rules
   - returns a structured decision

4. `Dashboard`
   - receives canonical events
   - shows proof of what the runtime decided and why

## 3. What Happens In A Normal Flow

Example:

1. A proposal is sent.
2. `n8n` waits until the follow-up window is reached.
3. `n8n` calls `POST /api/v1/decide`.
4. The runtime checks:
   - proposal status
   - silence duration
   - last outreach
   - recent reply
   - value thresholds
   - stored proposal state
5. The runtime returns one of five response types:
   - `success`
   - `suppressed`
   - `escalated`
   - `pending_human`
   - `failed`
6. `n8n` uses that response to decide the next action.

## 4. What The Five Response Types Mean

`success`
- A normal next action is ready.
- Example: send follow-up 1.

`suppressed`
- No action should happen right now.
- Example: the prospect already replied.

`escalated`
- The proposal needs owner attention.
- Example: high-value silent proposal.

`pending_human`
- A human must approve or review before continuing.
- Example: proposal value exceeds approval threshold.

`failed`
- The runtime could not safely make a decision.
- Example: invalid timeline or missing critical data.

## 5. What You Need Before Running It

Minimum requirements:

- Node.js `20+`
- npm
- a `.env` file
- local SQLite for development, or PostgreSQL for production

Recommended production stack for client work:

- `Hostinger VPS`
- `Node.js 20`
- `PostgreSQL`
- `PM2` or `systemd`
- `Nginx`

## 6. Local Development Setup

From the project folder:

```bash
cd "/Users/physis/Documents/New project/proposal-follow-up-enforcer-runtime"
cp .env.example .env
npm install
```

For local development, keep SQLite:

```env
DB_CLIENT=sqlite
SQLITE_DB_PATH=./data/proposal-follow-up-enforcer.db
```

Then initialize the database:

```bash
npm run migrate
```

Start the runtime:

```bash
npm run dev
```

## 7. Basic Local Checks

Check that the service is alive:

```bash
curl http://localhost:8080/health
```

Check that the service is actually ready:

```bash
curl http://localhost:8080/ready
```

What they mean:

- `/health`
  - the process is running

- `/ready`
  - the process is running
  - config is valid
  - persistence is working
  - required dependencies are available

If `/health` works but `/ready` fails, the service is up but not safe to use yet.

## 8. Important Environment Variables

These are the most important ones.

Security:

- `RUNTIME_BEARER_TOKEN`
- `RUNTIME_HMAC_SECRET`

Persistence:

- `DB_CLIENT`
- `SQLITE_DB_PATH`
- `POSTGRES_URL`

Timing rules:

- `FOLLOW_UP_1_DELAY_HOURS`
- `FOLLOW_UP_2_DELAY_HOURS`
- `CALL_TASK_DELAY_DAYS`
- `ESCALATION_VALUE_THRESHOLD`
- `HIGH_VALUE_APPROVAL_THRESHOLD`

Operational:

- `PORT`
- `REQUEST_TIMEOUT_MS`
- `READINESS_TIMEOUT_MS`
- `LOG_LEVEL`

## 9. Local vs Production Database

Use `SQLite` for local work:

- simple
- no extra database server needed
- good for development and tests

Use `PostgreSQL` for production:

- better durability
- better concurrency
- more appropriate for client deployments

Production should use:

```env
DB_CLIENT=postgres
POSTGRES_URL=postgres://user:password@db-host:5432/proposal_follow_up_enforcer
POSTGRES_SSL_MODE=require
POSTGRES_MAX_CONNECTIONS=10
```

## 10. How To Deploy For A Client

Recommended deployment target:

- one `Hostinger VPS`
- one PostgreSQL database
- one `n8n` instance

### Step 1: Prepare the VPS

Install:

- Node.js 20
- npm
- Nginx
- PM2 or systemd

### Step 2: Put the code on the server

Example path:

```bash
/var/www/proposal-follow-up-enforcer-runtime
```

### Step 3: Create production `.env`

Use:

- strong bearer token
- strong HMAC secret
- PostgreSQL connection string

Do not use the example placeholder secrets in production.

### Step 4: Install and build

```bash
cd /var/www/proposal-follow-up-enforcer-runtime
npm ci
npm run build
npm run migrate
```

### Step 5: Start the service

With PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Or with systemd:

```bash
sudo cp deploy/systemd/proposal-follow-up-enforcer-runtime.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable proposal-follow-up-enforcer-runtime
sudo systemctl start proposal-follow-up-enforcer-runtime
```

### Step 6: Put Nginx in front

Point Nginx to:

```text
127.0.0.1:8080
```

Use HTTPS in front of the service.

### Step 7: Connect `n8n`

Your `n8n` workflow should:

- normalize the proposal data
- call `POST /api/v1/decide`
- authenticate with bearer token + HMAC signature
- act on the returned response

## 11. How To Deploy For Multiple Clients

You have two common models.

### Option A: One runtime per client

Best for:

- separate client infrastructure
- strict isolation
- simpler troubleshooting

Use when:

- each client has its own VPS or database
- each client has different thresholds or secrets

### Option B: One shared runtime with client-specific config upstream

Best for:

- internal platform use
- many small similar clients

Use only if:

- you are confident in tenant isolation
- `n8n` sends properly normalized and separated data
- secrets and routing are handled carefully

For most client services work, `Option A` is safer.

## 12. What This Runtime Stores

It stores three important things:

1. `execution records`
   - each decision call

2. `proposal enforcement state`
   - current follow-up stage
   - touch counters
   - last decision
   - terminal state

3. `idempotency records`
   - prevents duplicate processing of the same request

This matters because the service remembers what already happened.

## 13. What “Idempotency” Means In Plain English

If the same exact request is sent twice:

- the runtime returns the same stored result
- it does not act like it is a new proposal event

If the same `idempotency_key` is reused with different data:

- the runtime rejects it as a conflict

This protects you from:

- duplicate workflow retries
- repeated follow-up actions
- accidental reprocessing

## 14. What Stops Follow-Up

The runtime intentionally stops enforcement when:

- proposal is `won`
- proposal is `lost`
- proposal is `expired`
- proposal is `paused`
- `do_not_contact = true`
- recent reply exists
- manual pause is still active

That prevents bad outreach and duplicate follow-ups.

## 15. What To Check If Something Breaks

If the service seems down:

1. check `/health`
2. check `/ready`
3. check logs
4. confirm DB is reachable
5. confirm `.env` values are correct

If requests are getting `401`:

- bearer token mismatch
- HMAC signature mismatch
- timestamp too old

If requests are getting `422`:

- the payload shape is wrong
- required fields are missing

If requests are getting `409`:

- same `idempotency_key` was reused with different request data

If requests are getting `503`:

- persistence backend is unavailable
- readiness dependency is down

## 16. Useful Debug Endpoints

These are authenticated endpoints for troubleshooting.

Execution lookup:

```text
GET /api/v1/executions/:executionId
```

Proposal state lookup:

```text
GET /api/v1/proposals/:proposalId/state
```

Idempotency lookup:

```text
GET /api/v1/idempotency/:idempotencyKey
```

Use these when you need to answer:

- what did the runtime decide?
- what state is this proposal in?
- was this request replayed or conflicting?

## 17. Recommended Workflow For A New Client

Use this sequence:

1. clone the repo
2. configure `.env`
3. run locally with SQLite
4. verify `/health` and `/ready`
5. send test requests
6. connect `n8n`
7. run full test suite
8. move to Hostinger VPS
9. switch to PostgreSQL
10. run production smoke test

## 18. Useful Commands

Install:

```bash
npm install
```

Migrate:

```bash
npm run migrate
```

Run dev server:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Run the full validation suite:

```bash
npm run test:v1
```

Build for production:

```bash
npm run build
```

Run built server:

```bash
npm start
```

## 19. What This Repo Does Not Do By Itself

This repo does **not** currently:

- send emails directly to customers
- make dashboard ingestion calls directly
- execute downstream CRM actions by itself

Those actions are expected to happen through `n8n` and connected systems.

This runtime is the decision engine and stateful enforcement core.

## 20. The Simple Mental Model

If you are explaining this to a client, use this:

> “Your team sends proposals. `n8n` asks this service what should happen next. This service decides based on timing, status, reply history, and value. Then `n8n` carries out the action. The system keeps state so nothing gets forgotten and nothing gets sent twice.”

## 21. Where To Look Next

If you want more technical detail:

- [`RUNBOOK.md`](/Users/physis/Documents/New%20project/proposal-follow-up-enforcer-runtime/docs/RUNBOOK.md)
- [`MIGRATIONS.md`](/Users/physis/Documents/New%20project/proposal-follow-up-enforcer-runtime/docs/MIGRATIONS.md)
- [`README.md`](/Users/physis/Documents/New%20project/proposal-follow-up-enforcer-runtime/README.md)
