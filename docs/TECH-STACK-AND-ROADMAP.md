# Tech Stack & Roadmap

**Status:** proposal. Nothing built.
**Assumption:** one engineer (Unscale) building it, one Ledgerwise stakeholder reviewing, pilot in ~9 weeks, then operate and iterate.
**Design constraints that drive every choice below:** non-technical daily users, provable sourcing, hard guardrails, low ops burden, swappable models, clean handover.

---

## 1. Stack at a glance

| Layer | Choice | Why | Alternative considered |
|---|---|---|---|
| App framework | **Next.js 15 (App Router) + TypeScript** | one codebase for UI + API, server actions, fast iteration | Remix, SvelteKit |
| UI | **Tailwind + shadcn/ui**, TanStack Table, react-hook-form + zod | non-technical UI needs consistency, not bespoke design | MUI, Chakra |
| Database | **Postgres (Neon)** + **Drizzle ORM** | relational fits evidence/claims/threads; branching for previews; cheap | Supabase, plain RDS |
| Auth & roles | **Clerk** (orgs + roles) | RBAC out of the box; saves a week | Auth.js, Better Auth |
| Background jobs | **Trigger.dev** | long research loops, retries, waits-for-human, idempotency, visible runs | Inngest, Temporal (too heavy) |
| LLM access | **Vercel AI SDK** behind a provider gateway (**OpenRouter** or direct) | model-per-agent, structured outputs via zod, easy swap | LangChain (rejected: hidden control flow) |
| Prompt storage | **DB-backed prompt versions** (`prompt_versions`) | admin edits without deploys; version pinning on every draft | prompts in code |
| Tracing / evals | **Langfuse** + custom fixture runner | per-step traces, cost, scores; eval suite in CI | Helicone only, Braintrust |
| Web research | **Brave Search API** + **Firecrawl** (render + snapshot) | search quality + reliable JS page rendering + HTML archive for claim defense | Serper, raw Playwright |
| Storefront detection | Shopify signals (`myshopify` DNS, `/products.json`, headers) + Amazon/own-site checks | cheap, deterministic ICP signal | paid enrichment only |
| Contact data | public web first; **Apollo** as optional enrichment | avoid buying unverifiable lists; email must trace to a real page | Clay, Lusha |
| Sending / inbound | **Instantly or Smartlead** API (dedicated mailboxes, warmup, reply detection) | cold-outbound-safe infrastructure; built-in warmup and per-mailbox caps | Postmark/Resend (transactional-focused), raw SMTP |
| Calendar | **Google Calendar API** (OAuth), abstraction layer for Outlook | client runs Google; free/busy + event insert + holds | Nylas (cost), Cal.com (less control) |
| File storage | **Cloudflare R2** | cheap HTML snapshots, no egress bill | S3 |
| Rate limits / holds | **Upstash Redis** | slot holds with TTL, per-domain caps | Postgres-only (slower, fine at low volume) |
| Infra | **Vercel** (app) + **Trigger.dev Cloud** + **Neon** | near-zero ops for a 1-engineer project | Fly/Railway, AWS |
| Observability | **Sentry** + **Axiom** + **PostHog** | errors, logs, product usage for adoption tracking | Datadog (overkill) |
| Repo | pnpm + **Turborepo** monorepo | agents, guards, tools share types with the app | single package |
| Testing | **Vitest** (unit/guard), **Playwright** (flows), golden eval suite | guardrails must be unit-tested; flows smoke-tested | — |
| CI/CD | GitHub Actions, preview envs, Drizzle migrations | boring and reliable | — |
| Secrets | Doppler or 1Password Environments | client-owned credentials from day one | .env files |

**Deliberately not used:** microservices, a separate Python service, Kubernetes, a vector database at launch (Postgres full-text + `pg_trgm` for dedupe is enough), LangChain/LangGraph, and any framework that hides tool-call order from us. The orchestrator is ~500 lines of explicit code and should stay that way.

**Tenancy:** single-tenant deployment per client, but every table carries `workspace_id`. That makes a future multi-client Unscale platform a config change, not a rewrite.

---

## 2. Repository shape

```
apps/
  web/            Next.js: sales workspace + admin console
  worker/         Trigger.dev tasks: research, qualify, write, reply, book
packages/
  db/             Drizzle schema, migrations, seeds
  agents/         orchestrator + research/qualifier/comms (pure functions)
  tools/          search, fetch, storefront, jobs, news, contacts, email, calendar
  guards/         price scan, claim binding, suppression, disclosure, length
  contracts/      zod schemas shared by agents, worker, web
evals/
  fixtures/       saved companies, replies, objections, opt-outs
  suites/         golden cases + scorecards
```

Rules enforced by structure: `apps/web` may never call an LLM; only `worker` runs agents; `guards` has zero LLM dependency and is importable anywhere.

---

## 3. Runtime picture

```
Browser ──► Next.js (Vercel)
              │  server actions: approve, edit, takeover, pause
              ▼
          Postgres (Neon) ◄── Trigger.dev worker
              ▲                    │
              │                    ├─► LLM gateway ──► models
              │                    ├─► Brave / Firecrawl
              │                    ├─► Instantly/Smartlead (send + inbound webhook)
              │                    └─► Google Calendar
              │
          R2 (page snapshots)   Redis (holds, caps)   Langfuse (traces)
```

Inbound email webhook → worker → classify → guard → gate or reply → thread update → UI event.

---

## 4. Cost model (pilot scale: ~120 companies/month, ~40 sends/day)

| Item | Monthly (USD, verify at signup) |
|---|---|
| Vercel Pro | 20 |
| Neon (Launch) | 19–69 |
| Trigger.dev | 0–50 |
| Clerk | 0–25 |
| Brave Search (5k queries) | ~25–50 |
| Firecrawl | 19–99 |
| Instantly / Smartlead + 3 mailboxes | 40–120 |
| Google Workspace (2–3 seats) | 15–25 |
| Apollo (optional, 1 seat) | 49–99 |
| R2 + Upstash + Sentry + Axiom + Langfuse | 30–80 |
| LLM (see math below) | 60–250 |
| **Total** | **~$280–800 / month** |

LLM math at pilot volume: research ≈ 15 pages/company × ~6k tokens ≈ 90k input tokens; 120 companies/month ≈ 11M input tokens. At small-model rates (~$0.15–0.40/M) that's single-digit dollars. Frontier models used only for qualification and writing (≈2M tokens/month) add roughly $20–60. **Research volume is not the cost driver; retries and long contexts are.** Cap them.

One-time: domain + 3 mailboxes warmup, SSL, ~2 weeks of engineer time on OAuth verification (see risks).

---

## 5. Roadmap

Two engineers would compress phases 1–3; in practice one engineer + a reviewing stakeholder is realistic. Weeks are calendar weeks from kickoff.

### Long-lead items — start in week 0, they are the critical path

| Item | Why it's early | Duration |
|---|---|---|
| Buy domain, create 3 sending mailboxes, start warmup | deliverability can't be rushed; sending before warmup burns the domain | 3–4 weeks |
| Google Cloud project + OAuth **verification** for Calendar scopes | sensitive-scope review can take 2–4 weeks and blocks booking | 2–4 weeks |
| Ledgerwise sales lead available 2×/week for 30 min | they are the eval oracle; without them "good email" is undefined | ongoing |
| Legal/compliance pass on ICP claims + opt-out wording | cheap now, expensive after 500 sends | 1 week |

---

### Phase 0 — Foundations (week 1)

**Build:** monorepo, schema (companies/evidence/contacts/scores/drafts/threads/messages/calls/suppressions/audit), Clerk roles, empty shells for the five sales screens, worker skeleton with one fake task, CI, migrations, seed script.
**Also:** write the guardrail spec as executable tests *before* any prompt exists; save 10 fixture companies and 12 fixture replies.
**Exit criteria:** app deploys to preview, migrations run, roles work, `pnpm test` green, fixtures stored.

### Phase 1 — Research (weeks 2–3)

**Build:** search/fetch/snapshot tools, storefront + jobs + news + registry signals, evidence extraction with zod validation, dedupe, ICP predicate, research loop with budget caps, minimal `Runs` view showing tool calls.
**Exit criteria:** **30 real companies** with a named founder/COO/finance contact, every fact carrying a URL + quote + snapshot; zero unsourced rows; duplicate rate 0; one full batch runs unattended in dry-run mode. Human spot-check of 10 random facts: 10/10 defensible.

### Phase 2 — Qualify + Companies screen (week 4)

**Build:** code-owned rubric, evidence-bound reasons, verdict bands, human-review band, `Companies` list + company card with source popovers, conflict + estimate styling.
**Exit criteria:** Ledgerwise sales lead reviews 15 companies and agrees with ≥12 verdicts; every score reason opens a real source; no score point exists without an evidence id.

### Phase 3 — Write + Review + guarded send (week 5)

**Build:** writer with claim→evidence mapping, guard layer (price scan, claim binding, disclosure, length, signature), `Review` three-column screen with approve/edit/reject, sending integration, suppression check on every send, send windows + caps.
**Exit criteria:** 20 emails approved/sent to the client's own test inboxes with 0 guard bypasses; 5 human edits feed the eval set; price detector catches 100% of a 30-case adversarial set; edit → re-guard → send loop works.

### Phase 4 — Reply + Inbox + takeover (week 6)

**Build:** inbound webhook, classification (interest / question / price / objection / not-now / opt-out / bot / complaint / referral / ambiguous), reply generation under the same guard layer, escalation gates, `Inbox` with takeover + handback, opt-out suppression at the data layer.
**Exit criteria:** all 12 fixture replies routed correctly (12/12); "not interested" produces a suppression row and zero further sends, verified by test; takeover silences the agent within one message; bot question answered honestly with no evasion.

### Phase 5 — Book + Calls (week 7)

**Build:** free/busy, slot offers in prospect TZ, TTL holds in Redis, idempotent booking, confirmation email + invite, race handling, `Calls` screen, reminder + no-show follow-up suggestion.
**Exit criteria:** 10 end-to-end bookings against a test calendar with zero double-bookings; expired hold re-offers correctly; timezone correctness checked across 3 TZs; invite includes thread + company context.

### Phase 6 — Admin console (week 8)

**Build:** prompt studio (blocks, draft/published, diff, test bench, scorecard, publish, canary, rollback), locked rules editor, per-tool toggles, confidence thresholds, suppression manager, readable run traces, role-gated danger zone, full audit log.
**Exit criteria:** a non-engineer changes the email tone, tests it against fixtures, sees the scorecard, publishes to 10% canary, rolls back — without a deploy. Rule blocks cannot be edited by anyone except owner; every change appears in audit with before/after.

### Phase 7 — Harden + hand over (week 9)

**Build:** eval suite in CI, load pass at 3× expected volume, security review (secrets, PII minimization, audit immutability, dependency scan), runbooks (pause, rollback, suppression, provider outage), client training session, Loom walkthroughs, cost dashboard, 30-day support plan.
**Exit criteria:** pilot runs 5 business days without a manual intervention except approvals; bounce <3%, complaint <0.1%; MTTR for "pause everything" under 60 seconds; Ledgerwise staff complete a review/takeover/booking task unaided.

---

## 6. Milestone summary

| Week | Milestone | Demoable |
|---|---|---|
| 0 | Accounts, domain, warmup, OAuth started | — |
| 1 | Foundations | deploy + roles + schema |
| 3 | Research | 30 sourced companies |
| 4 | Qualify | score + source popovers |
| 5 | Write/send | approved email in a real inbox |
| 6 | Reply | agent answers + escalates + suppresses |
| 7 | Book | call on a real calendar |
| 8 | Admin | non-engineer publishes a prompt change |
| 9 | Pilot | 5 clean days, handover |

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Cold-email deliverability** | everything downstream dies | warmup week 0, dedicated subdomain, ≤40/day/mailbox, plain text, bounce/complaint auto-pause, seed-list monitoring |
| **Google OAuth verification delay** | blocks booking | start week 0, use test users + internal app until verified, abstract calendar behind `CalendarProvider` |
| **Data source ToS / robots** | legal + tool breakage | public pages only, respect robots, archive snapshots, no logged-in scraping, provider contracts reviewed |
| **Hallucinated company fact** | client trust + the one rule that matters | evidence table with NOT NULL url+quote, claim binding, guard blocks send, snapshot archive |
| **Opt-out regression via prompt edit** | legal exposure | suppression is deterministic and code-owned; rule blocks locked; regression test in CI |
| **Prompt drift after admin edits** | quality decay | canary + scorecard + auto-rollback + version pinned on every draft |
| **LLM cost creep** | margin | per-run token budget, page-summarize-before-reason, small models for extraction, hard caps in orchestrator |
| **Enrichment data quality** | bad contacts, bounces | Apollo optional and never authoritative; email must trace to a page or stays empty |
| **Client adoption** | shelfware | sales surface is 5 items, phone-reviewable, keyboard shortcuts, SLA badges; weekly 15-min feedback loop |
| **Single engineer bus factor** | delivery risk | runbooks + IaC + docs per phase; no bespoke infra |
| **Scope creep into sequencing/CRM** | delay | v1 caps at 2 touches, one-way call push, no sequence builder |

---

## 8. Team

| Role | Allocation |
|---|---|
| Full-stack AI engineer (Unscale) | 1.0 FTE, weeks 0–9 |
| Designer (Unscale) | 0.2 FTE weeks 1–3 (sales surface only) |
| Ledgerwise sales lead | 2 × 30 min/week (eval oracle, approvals) |
| Ledgerwise ops/finance | 1 × 30 min/week (calendar, mailbox, compliance) |
| Unscale lead | 0.2 FTE (scope, client comms) |

---

## 9. After the pilot

**v1.1 (weeks 10–12):** autopilot for campaigns with a clean 100-approval streak, Outlook support, reply SLA analytics, weekly digest email to the client, exported evidence packs.

**v1.2 (month 4):** CRM sync (HubSpot), simple 3-step sequences with hard caps, A/B prompt experiments in the admin console, per-SDR mailboxes.

**v2 (quarter 2):** package the whole thing as a repeatable Unscale deployment — workspace onboarding, prompt library per vertical, shared eval corpus, usage-based billing. The `workspace_id` schema and the DB-backed prompt versions are what make this cheap later.

---

## 10. Decisions I need from you

1. **Sending provider:** Instantly/Smartlead (fast, cold-safe) vs Google Workspace mailboxes + own SMTP (more control, more work).
2. **Calendar:** Google only for v1, or Outlook from day one (adds ~1 week and a provider abstraction).
3. **Paid enrichment:** budget for Apollo/Clay, or public web only (slower research, fewer emails found).
4. **Team size:** is this really one engineer, or two? Two pulls the pilot to ~6 weeks.
5. **Pilot success metric:** booked calls, reply rate, or hours saved — pick one primary, or the roadmap's exit criteria will drift.
