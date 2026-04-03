# Proposal Follow-Up Enforcer Runtime

Deterministic enforcement engine that receives proposal events, evaluates them against policy, and queues follow-up actions (emails, escalations). Integrates with n8n for orchestration and optionally with Claude/OpenAI for AI-drafted messages.

---

## Local Development

Always use SQLite locally:

```env
DB_CLIENT=sqlite
SQLITE_DB_PATH=./data/proposal-follow-up-enforcer.db
```

```bash
cp .env.example .env      # configure credentials
npm run migrate           # initialize database
npm run dev               # start with hot reload on port 8080
```

Verify:
```bash
curl http://localhost:8080/health
curl http://localhost:8080/ready
```

---

## Database

| Context | Adapter | Config |
|---------|---------|--------|
| Local dev | SQLite | `DB_CLIENT=sqlite` |
| Production | PostgreSQL | `DB_CLIENT=postgres` + `POSTGRES_URL` |

Production rejects `DB_CLIENT=sqlite` at startup. Always run `npm run migrate` after switching DB_CLIENT or pulling new migrations.

---

## Auth

Every inbound request requires:
- `Authorization: Bearer <RUNTIME_BEARER_TOKEN>`
- `X-Signature-HMAC-SHA256` header (HMAC of request body using `RUNTIME_HMAC_SECRET`)
- `X-Request-Timestamp` within 300s of server time

Test scripts handle auth automatically. For manual `curl` tests, see `src/scripts/`.

---

## Testing

No Jest/Vitest — uses custom TypeScript scripts:

```bash
npm run test:v1           # run full suite
npm run test:contracts    # Zod contract validation
npm run test:scenarios    # decision engine scenarios
npm run test:state        # state machine transitions
npm run test:failures     # failure modes and edge cases
npm run test:events       # event schema validation
```

Run `test:v1` before committing logic changes to the decision engine or state machine.

---

## AI Drafting (Optional)

Disabled by default. Enable in `.env`:

```env
AI_DRAFTING_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...    # preferred
# OPENAI_API_KEY=sk-...         # fallback alternative
```

The `/ready` endpoint returns `503` if `AI_DRAFTING_ENABLED=true` and no provider key is present.

---

## Key Thresholds (all configurable in `.env`)

| Variable | Default | Effect |
|----------|---------|--------|
| `FOLLOW_UP_1_DELAY_HOURS` | 24 | Hours of silence before Follow-Up 1 |
| `FOLLOW_UP_2_DELAY_HOURS` | 72 | Hours of silence before Follow-Up 2 |
| `CALL_TASK_DELAY_DAYS` | 7 | Days before call task queued |
| `ESCALATION_VALUE_THRESHOLD` | $5,000 | Auto-escalate if silent 72h+ |
| `HIGH_VALUE_APPROVAL_THRESHOLD` | $15,000 | Route to human review at any stage |
| `RECENT_REPLY_SUPPRESSION_HOURS` | 72 | Suppress follow-up after reply |

---

## Production Build

```bash
npm run build    # compiles TypeScript to dist/
npm start        # runs dist/server.js
```

PM2 config: `ecosystem.config.cjs`. Deploy path: `/var/www/proposal-follow-up-enforcer-runtime`. Nginx proxies to `127.0.0.1:8080`.

Production startup will hard-fail on:
- Placeholder secrets (`replace-with-strong-*`)
- `DB_CLIENT=sqlite`
- `LOG_LEVEL=trace`

---

## Architecture Quick Reference

```
src/
  config.ts              — Zod-validated env config (all thresholds here)
  decision-engine/       — Core evaluate.ts: deterministic policy logic
  state/transition.ts    — Proposal lifecycle state machine
  routes/decide.ts       — POST /api/v1/decide (main enforcement endpoint)
  persistence/           — sqlite.ts and postgres.ts adapters
  middleware/            — HMAC auth, request context
  contracts/             — Zod schemas for inbound payloads
  scripts/               — Test and migration utilities
```

---

## Known Issues

- README.md has unresolved git merge conflicts (<<<<<<< HEAD markers) from the PostgreSQL adapter branch — needs cleanup.
