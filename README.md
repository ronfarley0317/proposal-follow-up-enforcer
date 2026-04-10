# Proposal Follow-Up Enforcer

**The average service business sends 20 proposals a month and follows up on half of them — that's $750K in pipeline dying in silence every year.**

---

## What This Prevents

A proposal sent is not a proposal enforced. Most service businesses have a closing problem that is actually a follow-up problem. The proposal went out. The prospect went quiet. Someone meant to follow up. They didn't. The deal expired in the CRM with a status that never changed from "sent."

This is not a discipline failure. It is a governance failure. When follow-up depends on a person remembering — across 10, 20, or 30 open proposals — leakage is not a risk. It is a certainty.

The math is not dramatic. It is arithmetic. A business sending 20 proposals per month at $25K average value, with 50% receiving systematic follow-up, loses $750K annually in pipeline that never closed for structural reasons. Not because the prospect said no. Because no one followed up.

**Without this:** Every proposal that doesn't close in 48 hours depends on someone's memory. Memory fails at scale.

**With this:** The moment a proposal is sent, enforcement begins. Follow-ups execute on a clock. Escalations fire with full context. The only time a human touches it is when a judgment call is required.

---

## Architecture

```mermaid
graph LR
    A[Trigger: Proposal Sent] -->|logged| B[Wait: 24 hours]
    B --> C{Reply detected?}
    C -->|YES| D[Suppress — recent reply]
    C -->|NO| E[Send: Follow-Up 1]
    E --> F[Wait: 48 hours]
    F --> G{Reply or won?}
    G -->|YES| D
    G -->|NO| H[Send: Follow-Up 2]
    H --> I[Wait: 72 hours]
    I --> J{Resolved?}
    J -->|YES| D
    J -->|NO| K[Escalate to Owner]
    K --> L[Context: value + open count + draft message]
```

### How it works

**Detection** — Proposal creation event triggers the enforcement clock. The agent reads proposal value, contact, owner, and current follow-up stage. Previous enforcement state is checked so no duplicate actions fire.

**Intervention** — At 24 hours of silence, Follow-Up 1 sends autonomously. At 72 hours, Follow-Up 2 sends with a different angle. View intent is weighted — a proposal opened three times with no reply gets prioritized differently than one never opened. High-value proposals ($5K+) that go silent past 72 hours escalate immediately.

**Escalation** — At day 10, or when proposal value exceeds $15K, the agent packages full context — proposal value, open history, last outreach timestamp, and a pre-drafted message — and routes to the owner for one-click approval. The owner approves or adjusts. The agent sends. Nothing requires writing from scratch.

---

## Setup

### Local development

Clone and install:

```bash
git clone https://github.com/ronfarley0317/proposal-follow-up-enforcer.git
cd proposal-follow-up-enforcer
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Recommended local development settings:

```env
RUNTIME_BEARER_TOKEN=your_strong_token
RUNTIME_HMAC_SECRET=your_strong_secret
DB_CLIENT=sqlite
SQLITE_DB_PATH=./data/proposal-follow-up-enforcer.db
FOLLOW_UP_1_DELAY_HOURS=24
FOLLOW_UP_2_DELAY_HOURS=72
CALL_TASK_DELAY_DAYS=7
ESCALATION_VALUE_THRESHOLD=5000
HIGH_VALUE_APPROVAL_THRESHOLD=15000
```

Initialize the configured database:

```bash
npm run migrate
```

Run locally:

```bash
npm run dev
```

Verify the service is live:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
```

### n8n workflow setup

1. Open your n8n instance
2. Click Import Workflow
3. Select `workflows/proposal-follow-up-enforcer.json`
4. Update credentials in the workflow nodes — CRM webhook, SMTP or email provider, and n8n bearer token
5. Activate the workflow

### Production-like PostgreSQL testing

Use PostgreSQL when you want to test closer to production behavior:

```env
DB_CLIENT=postgres
POSTGRES_URL=postgres://user:password@127.0.0.1:5432/proposal_follow_up_enforcer
POSTGRES_SSL_MODE=disable
POSTGRES_MAX_CONNECTIONS=10
```

### Production deployment

1. Install Node.js 20+ and required build tools
2. Copy the project to `/var/www/proposal-follow-up-enforcer-runtime`
3. Create `.env` with real production secrets
4. Set PostgreSQL as the production backend:

```env
DB_CLIENT=postgres
POSTGRES_URL=postgres://user:password@db-host:5432/proposal_follow_up_enforcer
POSTGRES_SSL_MODE=require
POSTGRES_MAX_CONNECTIONS=10
```

5. Install dependencies and build:

```bash
npm ci
npm run build
npm run migrate
```

6. Start with PM2 or systemd:

```bash
pm2 start ecosystem.config.cjs
# or
sudo systemctl start proposal-follow-up-enforcer-runtime
```

7. Put Nginx in front of the app and proxy to `127.0.0.1:8080`

#### Production rules

- `/ready` returns 503 if persistence is unavailable or AI drafting is enabled without a provider key
- Production startup rejects `DB_CLIENT=sqlite`
- Production startup rejects placeholder secrets by default
- Request logging masks email addresses and redacts auth/signature headers
- Persistence calls are timeout-guarded
- Duplicate requests remain idempotent through stored response replay
- Process restarts are safe because execution, idempotency, and state are persisted

---

## Revenue Impact

- $375K–$750K in annual pipeline recovered, assuming 25–50% of silenced proposals are recovered
- 100% of proposals receive systematic follow-up instead of depending on rep memory
- 10-day maximum silence before human escalation fires with full context
- Typical payback period is 2–6 weeks at normal proposal volumes

### The math

```
20 proposals/month
× 50% not receiving systematic follow-up
× $25,000 average proposal value
× 25% lift from enforcement
× 12 months
= $750,000 annual leakage prevented
```

Adjust the inputs for your business. The formula holds.

---

## Decision Engine

The enforcer does not send indiscriminately. Each evaluation runs a deterministic decision against the current proposal state:

| Condition | Action |
|-----------|--------|
| Proposal won, lost, or expired | Suppress — no action |
| Reply received in last 72 hours | Suppress — recent reply detected |
| Reply classified as "interested" | Route to human review — prospect is engaged |
| Reply classified as "objection" | Route to human review — objection requires judgment |
| Reply classified as "closed" or "lost" | Suppress — no further follow-up needed |
| Manual pause active | Suppress — until pause expires |
| High-value ($15K+) at any stage | Route to human review |
| High-value ($5K+) silent 72h+ | Escalate to owner |
| 24h silence, no prior follow-up | Queue Follow-Up 1 |
| 72h silence, follow-up 1 sent | Queue Follow-Up 2 |
| Proposal viewed, no reply | Prioritize — view intent detected |
| Expiry within 2 days | Queue urgency follow-up |
| 7+ days unresolved | Queue call task to owner |

Every decision is logged with a confidence score, reason codes, risk score, and full enforcement event. Complete audit trail. No black box.

### Reply Classification

The engine classifies inbound reply text deterministically before deciding whether to suppress, escalate, or continue cadence:

- **closed** — prospect confirmed they're moving forward (suppress all follow-up)
- **lost** — prospect chose another vendor or declined (suppress all follow-up)
- **interested** — prospect is engaged and wants to continue (route to human)
- **objection** — prospect raised a concern requiring judgment (route to human)
- **delay** — prospect asked to revisit later (suppress, wait for re-trigger)

Classification can be provided directly in the payload or derived from reply text using deterministic pattern matching.

### Risk Scoring

Every evaluation produces a risk score (0–100) with contributing factors:

- Silence duration relative to escalation thresholds
- Proposal value relative to approval and escalation thresholds
- View intent signals
- Service category risk profile
- Reply classification
- Follow-up stage and touch count

Risk level drives priority routing: `low`, `medium`, or `high`.

---

## API

### POST /api/v1/decide

The main enforcement endpoint. Accepts a normalized proposal payload and returns a structured decision with routing, draft messages, escalation summary, and dashboard events.

Every request requires:
- `Authorization: Bearer <token>`
- `X-Signature-HMAC-SHA256` header (HMAC of request body using shared secret)
- `X-Request-Timestamp` within 300s of server time

Response types:

| Type | Meaning |
|------|---------|
| `success` | Action queued (follow-up, call task, urgency email) |
| `suppressed` | No action — intentional hold |
| `escalated` | Routed to owner with full context |
| `pending_human` | Human approval required before proceeding |
| `failed` | Evaluation could not be completed safely |

Supports `dry_run: true` for testing without persisting state.

### Admin endpoints (authenticated)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/proposals/:id/state` | Current follow-up stage, touch counter, terminal state |
| `GET /api/v1/proposals/:id/diagnostics` | Plain-language explanation of the last decision |
| `GET /api/v1/executions/:id` | Full stored response for any execution |
| `GET /api/v1/idempotency/:key` | Confirm replay or conflict behavior |

---

## Testing

```bash
npm run test:v1           # full validation suite
npm run test:contracts    # Zod contract validation
npm run test:scenarios    # decision engine scenario matrix
npm run test:state        # state machine transitions
npm run test:failures     # failure modes and edge cases
npm run test:events       # enforcement event schema validation
```

Run `test:v1` before any commit that touches the decision engine or state machine.

---

## Enforcement Agents Collection

This is part of the **Revenue Enforcement Framework** — open-source autonomous agents that make revenue leakage structurally impossible.

| Agent | Status | What It Enforces |
|-------|--------|------------------|
| [Enforcement Live Dashboard](https://github.com/ronfarley0317/enforcement-live-dashboard) | ✅ Live | Watch enforcement agents operate in real time |
| [Invoice Payment Enforcer](https://github.com/ronfarley0317/collections-agent) | ✅ Live | No invoice sits unpaid beyond terms |
| [Proposal Follow-Up Enforcer](https://github.com/ronfarley0317/proposal-follow-up-enforcer) | ✅ Live | No proposal dies in silence |
| [Scope Creep Detector](https://github.com/ronfarley0317/scope-creep-detector) | 🔧 In Progress | No work without compensation agreement |
| [Revenue Leakage Counter](https://github.com/ronfarley0317/revenue-leakage-counter) | 🔧 In Progress | See how fast your business leaks revenue |

---

## Tech Stack

- **n8n** — Workflow automation and enforcement orchestration
- **Claude Code** — Follow-up message generation, view intent analysis, reply classification, escalation drafting
- **Fastify + TypeScript** — Decision runtime with HMAC-authenticated API
- **SQLite / PostgreSQL** — Idempotent execution storage and proposal state persistence
- **Zod** — Contract validation on every inbound payload

---

## The Law

> *"Any revenue that depends on human memory, discipline, or follow-up will leak at scale."*

This agent makes forgotten proposal follow-up structurally impossible.

---

## License

MIT

---

**Built by [Physis Advisory](https://www.linkedin.com/in/ronald-farley-jr-882345157?utm_source=share_via&utm_content=profile&utm_medium=member_ios) — Revenue Integrity Engineering**

*We don't help you make more money. We make it impossible to lose money you already earned.*
