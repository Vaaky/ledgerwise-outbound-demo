# Ledgerwise outbound agent — working demo

An interview demo of an AI outbound platform for Ledgerwise: **research → qualify → write → reply → book**, with a human gate at every expensive or irreversible step. Sales works in a review queue; admins edit prompts and guardrails without a deploy.

This repo is the built version of the design docs in `docs/`.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No keys required. The first request seeds a 30-company synthetic corpus into a local PGlite database (`./.pglite`), which takes a few seconds.

```bash
npm run test:guards    # 15 executable guard assertions
npm run test:classify  # 30-message intent classification eval
npm run build          # production build
npm run lint           # tsc --noEmit
```

Sign in as one of two seats (no password):

- **Maya · Sales** — review, edit, approve, reply, take over.
- **Sam · Admin** — everything above plus the control room, prompts, rules and runs.

## The 6-minute demo

See [`DEMO.md`](./DEMO.md) for the full script, requirement mapping, deploy steps and failsafes.

## What's in the workspace

- **Today** — live counts, the review queue, calls and agent activity.
- **Companies** — scores and evidence, plus an AI company search: describe your ICP (or paste a name/domain). The agent searches Tavily, DuckDuckGo or Bing, crawls candidate storefronts plus their about, careers and contact pages, then scores them against the brief.
- **Review** — approve, edit or reject every first email; guards re-run on edits.
- **Inbox** — reply, take over, simulate a custom inbound reply, book.
- **Calls** — booked slots and `.ics` downloads.
- **Statistics** — funnel, reply rate, guard blocks, trigger mix and agent runs.
- **Control room** — pause agents, kill switch, prompt studio, rules and run traces.

## What is real vs simulated

**Real:** the pipeline and state machine, the code-owned rubric, the guard layer, the reply classifier, suppression rows, slot generation, `.ics` export, prompt versioning and publish gate, audit log, and every UI action.

**Simulated on the free tier:** outbound email (unless `RESEND_API_KEY` + `DEMO_INBOX` are set), inbound replies (triggered from the Inbox), the 30-company corpus (synthetic names/domains so no invented claim touches a real business), and the calendar provider (real `.ics`, Google OAuth adapter stubbed). Live research against a real domain works via **Run research**.

## Optional free services

Copy `.env.example` to `.env.local` and fill only what you want:

| Env | Effect |
|---|---|
| `DATABASE_URL` | Neon Postgres instead of local PGlite. **Required on Vercel** for state to persist across cold starts. |
| `LLM_BASE_URL` + `LLM_MODEL` | Any OpenAI-compatible endpoint, e.g. local llama.cpp/Qwen at `http://localhost:8000/v1`. |
| `GROQ_API_KEY` | Groq free tier as the hosted option. Without either, a deterministic mock writer keeps the demo reliable. |
| `TAVILY_API_KEY` | Real name/ICP search. Without it, the agent uses a keyless DuckDuckGo/Bing + public-directory crawl (best-effort). |
| `RESEND_API_KEY` + `DEMO_INBOX` | Actually send an approved draft to your inbox. Otherwise sends are simulated. |
| `FORCE_MOCK=1` | Pin the deterministic writer even when an LLM key exists. |

## Deploy to Vercel (free)

1. Push to GitHub and import the repo in Vercel.
2. Create a free Neon Postgres and set `DATABASE_URL`.
3. Add `GROQ_API_KEY` (or a hosted OpenAI-compatible endpoint) and `TAVILY_API_KEY`.
4. Deploy. The first authenticated request seeds the database.

**Local Qwen cannot be reached from Vercel.** A `localhost:8000` endpoint times out in the cloud. Use Groq, a hosted Qwen endpoint, or a tunnel. Full env table, Neon setup and failure modes: [`DEPLOY.md`](./DEPLOY.md).

## How it is put together

| Path | Purpose |
|---|---|
| `app/` | Next.js App Router pages: Today, Companies, Review, Inbox, Calls, Admin |
| `components/` | Client UI: review queue, inbox, prompt studio, navigation |
| `lib/agents.ts` | Research, qualify, draft, send, classify, reply, book; pause checks |
| `lib/guards.ts` | Seven executable rule checks; six run on outreach, six on replies |
| `lib/rubric.ts` | Fit/timing scoring and hard gates (US, revenue, headcount) |
| `lib/seed.ts`, `lib/fixtures.ts` | Synthetic 30-company corpus and demo state |
| `lib/db/` | Neon/PGlite adapter, schema bootstrap, seed-once claim |
| `lib/queries.ts` | Read models for every page |
| `scripts/guard-tests.ts` | Guard regression tests |

## Design docs

| File | What it is |
|---|---|
| [`HOW_I_WORKED.md`](./HOW_I_WORKED.md) | Build process, tool choices, mistakes, exact scoring formula, cost and next steps |
| [`BRIEF.md`](./BRIEF.md) | The original case: client, ICP, triggers, rules, required capabilities |
| [`docs/TASK-1-AGENT-ARCHITECTURE.md`](./docs/TASK-1-AGENT-ARCHITECTURE.md) | Orchestrator + specialist agents, guard layer, human gates, state machine |
| [`docs/TASK-2-PLATFORM.md`](./docs/TASK-2-PLATFORM.md) | Sales workspace and admin console with prompt studio |
| [`docs/TECH-STACK-AND-ROADMAP.md`](./docs/TECH-STACK-AND-ROADMAP.md) | Stack, repo shape, cost, roadmap, risks |

## One-paragraph version

One orchestrator owns state and policy; specialist jobs do the work. **Research** finds US e-commerce companies in the ICP and stores every fact with a source URL and quote. **Qualifier** scores fit and timing with a rubric the model cannot edit, and shows the evidence behind every point. **Comms** writes the first email, classifies replies, answers without quoting a price, discloses that it is a bot, and books real slots. A pure-code guard layer blocks price quotes, unsourced claims, suppressed contacts, outcome promises and missing signatures. Opt-outs are suppression rows checked before any send, not prompt instructions. Four human gates sit at contact doubt, first email, reply escalation and booking exceptions. Sales gets a review queue and inbox; admins get versioned prompts with a test bench and publish gate.
