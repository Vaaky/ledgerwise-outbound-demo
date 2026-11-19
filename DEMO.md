# Demo guide — Ledgerwise outbound agent

A working demo of the architecture in `docs/TASK-1-AGENT-ARCHITECTURE.md` and the platform in `docs/TASK-2-PLATFORM.md`.

**What is real:** the pipeline, the rubric, the guard layer, the reply classifier, suppression, slot generation, `.ics` files, prompt versioning, publish gate, audit log, and every UI action.
**What is simulated for a free-tier demo:** outbound email (unless `RESEND_API_KEY` is set), inbound replies (you trigger them from the Inbox), the 30-company corpus (synthetic, so no invented fact is attached to a real business), and the calendar provider (real `.ics` generation, Google OAuth adapter stubbed).

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

First request seeds the demo database (~5–10s on PGlite). No keys required.

Optional:

| Env | Effect |
|---|---|
| `LLM_BASE_URL` + `LLM_MODEL` | any OpenAI-compatible endpoint, e.g. local llama.cpp/Qwen at `http://localhost:8000/v1` |
| `GROQ_API_KEY` | hosted Groq free tier; otherwise deterministic mock writer |
| `TAVILY_API_KEY` | live web search in “Run research”; otherwise research uses direct fetch + storefront detection |
| `RESEND_API_KEY` + `DEMO_INBOX` | actually emails the approved draft to your inbox |
| `DATABASE_URL` | Postgres (Neon free) instead of the local PGlite file |

```bash
npm run test:guards   # 15 executable checks for the five rules
npm run build
```

---

## Sign in

Two seats, no password:

- **Maya · Sales** — review, edit, approve, reply, take over.
- **Sam · Admin** — everything above plus the control room.

Switch by signing out (bottom-left) and picking the other seat.

---

## The 6-minute script

### 0:00 — Frame it (Today)

> “Five agents and one human gate. Research finds companies, qualification scores them with a code-owned rubric, comms writes and replies, and every outbound message passes a guard layer before a person can send it.”

Point at the four numbers: emails to review, threads needing a human, calls booked, qualified companies.

### 0:45 — Companies (trust the data)

Open **Companies → Northwind Supply**.

- Score is 75/100, split into **fit** and **timing**.
- Every awarded point has a **source chip**. Click one: URL, exact quote, retrieval date, confidence, and whether it is `verified` or `estimated`.
- Estimates look different from facts. The rubric refuses points for out-of-band revenue or headcount, and a missing contact or trigger forces `needs_review`.
- Try **Sundry Co** (no contact) — the agent stopped and asked for a person.

> “This is the anti-hallucination design: facts are rows, emails are views over rows.”

Optional flourish: use the **company search** at the top of Companies. Leave the default ICP brief, or edit it (for example “sustainable skincare brands on Shopify”). The agent searches Tavily/DuckDuckGo/Bing, crawls listicles and candidate storefronts plus their about, careers and contact pages, extracts signals and contacts, then scores each company against the brief. Missing contacts and borderline companies open a human gate. Results appear in the table and in Statistics.

### 1:45 — Review (the human gate)

Open **Review**.

- Three columns: queue, draft, why-this-company.
- Each personalized claim is a chip. Click it to see the receipt.
- **Approve & send** is disabled unless every guard passes (six checks run on outreach: price, claims, suppression, length, signature, outcome promises).

Now the two moments worth demoing:

1. Click **Edit**, change a sentence to “Our fee is $1,500 per month.” → **Save & re-check rules**. The price guard blocks it. Revert the edit.
2. Click **Reject** and pick “Weak angle” → the reason is stored and attributed to the reviewer.

> “A person can change the words, not the rules.”

### 3:00 — Inbox (reply + book + stop)

Open **Inbox → Tidepool Skin**.

- The prospect asked for a price. The agent answered without a number and offered real slots.
- Show the classification chip and the handoff reason.

Use **Simulate an inbound reply**:

| Button | What happens |
|---|---|
| “Are you a bot?” | Honest disclosure, no evasion |
| “Sounds good — Thursday at 2pm works.” | Agent books the call, writes the confirmation; it appears in Calls |
| “We already have a bookkeeper in-house.” | One reframe, then an exit offer |
| “Not interested, take me off your list.” | Hard suppression: no reply, red banner, agent locked out |

Then click **Take over**. The agent goes silent and you can type as yourself. **Hand back to agent** resumes it.

> “Opt-out is not a prompt instruction. It is a row the send function checks first.”

### 4:30 — Calls

Open **Calls**. Two agent-booked calls, real slots, real timezone formatting. Download the `.ics` or open the Google Calendar template.

> “In production this is Google free/busy plus an idempotent event insert. The provider is one adapter.”

Open **Statistics** for ten seconds: the pipeline from researched to booked, reply rate, guard-blocked drafts, trigger mix and agent runs. The numbers are derived from the same rows the other pages use, not a separate analytics pipeline.

### 5:00 — Admin (control without deploys)

Sign out → **Sam · Admin** → **Control room**.

- Pause the research agent; Run research now refuses.
- Arm the **kill switch**; approve buttons refuse to send.
- **Prompts**: pick *Comms → First email*. Show `v1 published`, `v2 draft`. Edit a clause, run **Test bench** (7 adversarial guard cases + clause lint). A failing case blocks publish. Publish, then roll back a version.
- **Rules**: the five Ledgerwise rules with the code path that enforces each one, plus the live suppression list.
- **Runs**: a readable trace per job — tool calls, guard decisions, escalations.

> “Prompts are versioned and pinned: every draft records the prompt that produced it.”

### 6:00 — Close

> “The interesting part is not the model. It is where the model is not allowed to decide: pricing, facts, opt-outs, and when to stop and ask a person.”

---

## What maps to what

| Brief requirement | Where to show it |
|---|---|
| 30+ real companies, ICP filter | Companies list, `researchDomain` live run |
| Source for every reason | Evidence chip on every score reason |
| Short personal first email | Review draft |
| Every fact sourced | Guard: claim ↔ evidence binding |
| Answers replies, handles objections | Inbox simulations |
| Knows when to hand over | Loom & Larder (second objection), complaints, unclear intent |
| No price | Edit a draft with a price → blocked |
| Stop means stop | Opt-out simulation → suppression |
| Honest about being a bot | “Are you a bot?” simulation |
| Books real slots | Calls + `.ics` |
| Non-technical UI | Six nav items, plain labels; Statistics for the funnel |
| Find new companies with AI | Companies → search a name or domain |
| Admin prompt control | Prompt studio with test bench, publish, rollback |

---

## Deploy to Vercel (free)

1. Push this repo to GitHub, import it in Vercel.
2. Create a **Neon** free Postgres and set `DATABASE_URL` in Vercel env vars. This is what makes state persist; without it the app seeds an in-memory database per cold start.
3. Optional: `GROQ_API_KEY`, `TAVILY_API_KEY`, `RESEND_API_KEY`, `DEMO_INBOX`, `RESEND_FROM`.
4. Deploy. The first authenticated request seeds the corpus; give it a few seconds.

Notes:

- **Vercel cannot reach `localhost:8000`.** For the deployed demo, use Groq, a hosted OpenAI-compatible Qwen endpoint, or a tunnel. Full steps: [`DEPLOY.md`](./DEPLOY.md).
- Vercel Hobby functions cap at 60s; the seed is batched into ~250 round trips and normally finishes well inside that.
- Resend's free tier only delivers to your own verified address, which is why `DEMO_INBOX` exists.
- No cron or queue is required: the demo runs the pipeline inline. Production would move research to a durable worker (Trigger.dev) — see the roadmap doc.

---

## Demo-day failsafes

- **No internet / API keys:** everything still works on the deterministic mock writer.
- **Model quota exhausted:** the writer falls back to the template and records the fallback in the run trace.
- **Live research fails:** the company is created with whatever was fetched and routed to `needs_review` — which is the correct product behaviour, not an error.
- **State drifted from rehearsing:** delete `.pglite/` (or truncate the Postgres tables) and reload to reseed.

---

## Things to say if asked

- **Why not LangChain?** The orchestrator is explicit code; tool order and gate placement must be auditable, not inferred.
- **Why is scoring code-owned?** Prompt edits must not be able to change the rubric. The model explains; the rubric decides.
- **How do you stop prompt regressions?** Draft → test bench → publish gate → canary in production → one-click rollback; every draft stores its prompt version.
- **How do you prove a claim was true?** Evidence rows store the quote and an archived snapshot; the UI links to the live source.
- **What happens on a complaint?** No automated reply. Thread opens a human gate immediately.
- **What would you change at scale?** Durable workers, per-mailbox warmup and throttling, Outlook, CRM sync, and multi-tenant `workspace_id` — the schema already carries the tenant key.
