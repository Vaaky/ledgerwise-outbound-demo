# How I worked — Ledgerwise outbound agent

**Live demo:** https://ledgerwise-outbound-demo.vercel.app/
**Code:** https://github.com/Vaaky/ledgerwise-outbound-demo
**Run locally:** `npm install && npm run dev`
**Deploy guide:** [`DEPLOY.md`](./DEPLOY.md) · **Demo script:** [`DEMO.md`](./DEMO.md)

This is the submission write-up and the repository README. It was generated from the actual build session with OpenCode, then checked against the code and the test output.

---

## What I built

A working demo of an AI outbound platform for Ledgerwise: **research → qualify → write → reply → book**, with a human gate at every expensive or irreversible step.

- **Sales side:** Today, Companies, Company detail, Review, Inbox, Calls, Statistics.
- **Admin side:** control room, agent pause switches, kill switch, prompt studio with a test bench and publish gate, guardrails, run traces.
- **Research:** a real web search and crawl pipeline that takes an editable ICP brief, finds candidate storefronts, reads their pages, and stores evidence with source URLs and quotes.
- **Human gates:** contact doubt, first email, reply escalation, booking exceptions, complaints and opt-outs.

The architecture is one explicit orchestrator plus three specialist agents:

- **Research** finds companies and stores every fact with a source URL and quote.
- **Qualifier** scores fit and timing with a code-owned rubric and shows the evidence behind every point.
- **Comms** writes the first email, classifies replies, answers without quoting a price, discloses that it is a bot, and books calls.

Hard policy is code, not model judgment: price checks, claim-to-evidence binding, suppression, disclosure, length, signature, outcome promises, booking arithmetic and the human gates.

---

## How the system works

The orchestrator is explicit code. It owns state and decides which job runs next; the model never chooses its own tool order.

1. **Research.** The agent searches Tavily → DuckDuckGo → Bing, extracts candidate storefronts from results and public DTC lists, checks for a live storefront, then crawls the homepage plus about, careers and contact pages. Each fact becomes an evidence row: field, value, source URL, exact quote, retrieval time, confidence, and `verified` or `estimated`.
2. **Qualify.** The rubric reads the evidence rows and the contact. It awards points, records a reason with the evidence id for every point, lists missing data, and sets a verdict. A prompt cannot change this math.
3. **Write.** The comms agent builds a first email from the company, contact and evidence. With a model configured it writes the prose; otherwise a deterministic template. Every factual sentence is bound to an evidence id. The guard layer checks price, claims, suppression, length, signature and outcome promises.
4. **Human gate.** The draft lands in Review. A person can edit, approve or reject. Edits re-run the guards. Approve is disabled while a guard fails, the agent is paused, or the kill switch is armed.
5. **Send.** Sends are simulated unless Resend is configured. Approval records who approved and when.
6. **Reply.** Inbound messages (simulated or webhook later) are classified. Opt-outs and complaints never go to the model. The reply agent writes for price, bot, interested, objection and referral; the rule classifier is a guardrail. A reply that fails guards is not sent.
7. **Book / stop / escalate.** Booking is code: free slots, slot match, idempotent call row, `.ics`. Opt-out writes a suppression row checked before every send. A complaint, second objection, unclear intent or booking exception opens a human gate.
8. **Admin.** Agents can be paused; the kill switch blocks all sends. Prompts are versioned, tested against adversarial cases, published only if the test bench passes, and rolled back by publishing a prior version. Every action is in the audit trail and every job has a run trace.

The data model is the safety boundary: companies, evidence, contacts, scores, drafts, threads, messages, calls, suppressions, prompts, runs, audit. The UI is a view over those rows.

---

## How scoring works

The rubric is in `lib/rubric.ts`; it is not a prompt. Every awarded point points at an evidence row.

**Fit — 60 points**

| Signal | Points | Rule |
|---|---:|---|
| Revenue | 20 | Only if the value parses inside the $0.8M–$11M tolerance around the $1M–$10M target. Revenue evidence outside that band rejects the company. |
| Headcount | 10 | 5–50 employees. Headcount evidence outside that band rejects the company. |
| US location | 10 | Requires evidence that says United States/US. Non-US evidence rejects. |
| Sells online | 10 | Shopify, Amazon or own storefront evidence. |
| Multi-channel need | 10 | Shopify + Amazon, wholesale, retail or catalog complexity. |

**Intent — 40 points**

| Signal | Points |
|---|---:|
| Hiring finance / accounting / ops | 15 |
| Recently raised | 15 |
| Expanding channels | 10 |

Total = fit + intent.

**Verdict**

- 65+ → `qualified`
- 45–64 → `needs_review`
- below 45 → `rejected`

**Hard gates override the total:**

- No named contact **or** no timing signal → `needs_review`, regardless of score.
- Non-US evidence → `rejected`.
- Revenue evidence outside the band → `rejected`.
- Headcount evidence outside 5–50 → `rejected`.
- Missing revenue, headcount or location is never invented. It is listed as a gap; the verdict falls to the arithmetic, and a missing contact or trigger still forces `needs_review`.

**Confidence is separate from the score.** It is the average evidence confidence, minus 0.12 if any evidence is `estimated`, clamped to 0–0.99. It tells the reviewer how much to trust the evidence, not how good the lead is.

**Example:** Northwind Supply has revenue +20, headcount +10, US +10, ecommerce +10, complexity +10 = 60 fit; hiring +15 = 15 intent; total **75 → qualified**.

**Example:** Sundry Co also scores 75 but has no named contact, so it goes to **`needs_review`**. The score is not allowed to overrule the gate.

---

## Tools by step, and why

| Step | What I used | Why I chose it | What I tried and dropped |
|---|---|---|---|
| Research | Tavily / DuckDuckGo / Bing search, direct `fetch`, Shopify `/products.json`, listicle crawl | Free provider chain with a keyless fallback. `/products.json` detects Shopify without rendering JavaScript. Every fact is stored with a URL and quote. | I planned **Brave Search + Firecrawl**. I dropped them because they add paid keys and JavaScript-rendering infrastructure. Direct fetch plus a provider chain was enough for the demo. |
| Qualification | TypeScript rubric in `lib/rubric.ts` | The model must not be able to change the score. Hard gates override arithmetic: out-of-band revenue or headcount rejects; non-US rejects; missing contact or trigger forces `needs_review`. | I kept this code-owned even after adding a live model. The model explains; the rubric decides. |
| Email writing | Qwen3 1.7B Q4_K_M through `llama.cpp` on `localhost:8000`, behind a small OpenAI-compatible wrapper; Groq `openai/gpt-oss-20b` on Vercel | Local, free, private and no rate limit. The same wrapper works with Groq, Ollama, vLLM or LM Studio. | I started with a deterministic template so the demo never needed a key. I kept the template as a fallback when the model is down or its draft fails guards. |
| Replies | Regex intent classifier + live model for reply prose, with `lib/guards.ts` deciding whether it can send | Opt-outs and complaints must never be delegated. The model handles ambiguous language and writes the reply; the guard layer blocks price, unsourced claims, evasion, over-length and missing signature. | The first version was all templates. I caught that after turning off localhost and seeing replies still work. I then added live classification and reply generation, with the rule classifier as a guardrail. |
| Booking | Code slot picker, free/busy check, `.ics` generation, Google Calendar template link | Real files without OAuth setup; the calendar provider is one adapter. | I planned **Google Calendar OAuth**. I dropped it for the free-tier demo because OAuth verification and token handling add friction. I also considered **Cal.com** and dropped it because it gives less control over holds, free/busy and idempotency than the small abstraction. |
| Platform | Next.js 15.5.29 App Router, React 19.3.1, Tailwind 4, Drizzle 0.45.4, TypeScript 5.9.3, lucide-react | One deployable app, server-rendered pages, no separate API service to manage. | I did not split the backend out. The route handlers are enough for the demo. I rejected **LangChain/LangGraph** early because tool order and gate placement have to be auditable. |
| Data | PGlite locally, Neon Postgres on Vercel via `DATABASE_URL` | Zero-setup local database; Neon free tier gives persistence on Vercel. | My first PGlite path was `.data/pg` and failed with `ENOENT mkdir`. I used a single-level `.pglite` directory instead. |
| Hosting | Vercel Hobby, Neon free Postgres, Groq free tier, Tavily free tier | Native Next.js hosting, free, one deploy. Neon keeps state across cold starts. Groq gives a hosted LLM without exposing a local server. Tavily is much more reliable from Vercel’s shared IPs than keyless search. | I planned a **Trigger.dev** worker for research. I deferred it; the demo runs inline and stays inside the 60-second function limit. |
| Email sending | Resend optional; simulated by default | Free tier, and the demo must never fail because an email provider is down. | I planned **Instantly or Smartlead** for production sending and warm-up. I dropped them for a demo; the send function is one adapter. |
| Auth | Cookie-based demo seats: Maya (sales) and Sam (admin) | The point is the workflow, not auth. No password friction on stage. | This is not production auth; it is a demo seat picker. |
| AI coding tool | **OpenCode** with **DeepSeek V4.1 Flash** | It could read and edit the repo, run the shell, run builds and tests, drive the browser, use git/GitHub CLI, and verify its own work in one loop. | I used one coding tool for the whole build. I did not switch tools mid-case. |
| Verification | `tsx` scripts, `npm run build`, `npm run test:guards`, `npm run test:classify`, HTTP checks, browser checks | A compiling app is not a working app. I checked behaviour, not just types. | Guards and classification got their own executable tests. |

### The LLM path on Vercel

Vercel functions cannot reach `http://localhost:8000`. The deployed demo therefore uses **Groq `openai/gpt-oss-20b`**, and keeps the local Qwen path for local runs. The original default Groq model, `llama-3.3-70b-versatile`, became an Enterprise-only model, so I changed the default to `openai/gpt-oss-20b` and added a run-trace error when the model falls back.

---

## The plan, and how it changed

I started with design documents only, as requested. Once the goal became an interview demo, the plan changed from “production architecture” to “the smallest end-to-end slice that proves the architecture on free services.”

The changes that mattered:

1. **Paid stack → free stack.** Brave + Firecrawl became direct fetch + `/products.json` + optional Tavily. Google Calendar OAuth became `.ics` + a template link. Instantly/Smartlead became simulated send + optional Resend. Trigger.dev became inline work.
2. **Deterministic demo → live agents.** I first made every path deterministic so the demo could not fail without keys. That was the right call for reliability but the wrong call for the brief: it made the reply agent look like a script. After the local Qwen server was available, I moved first-email writing, reply classification and reply writing onto the model, and kept only hard policy in code.
3. **Live seed → deterministic seed.** When I enabled Qwen, the seed itself started calling the model and generated weird seeded emails. I forced the seed to use the deterministic writer (`useLlm: false`). Only new drafts you trigger use the model.
4. **LLM classification → hybrid classification.** A 1.7B model misread “We already have a bookkeeper in-house” as interested. I made the regex classifier a guardrail: if the rule classifier is confident and the model disagrees, the rule wins. The model is used for genuinely ambiguous text.
5. **Over-constrained reply prompt → transcript + persona.** The first prompt only saw the last outbound message and told the model to avoid a list of words. The replies were stiff. The prompt now includes the recent conversation and per-intent guidance, and the guard layer handles compliance.
6. **Missing UX → custom inbound reply + prompt version label + sticky sidebar.** These came from using the demo myself and noticing friction.
7. **Domain guesser → real search and crawl.** The first company search only guessed `.com`/`.co`/`.shop` domains. The brief asked for real companies and evidence, so I added Tavily/DuckDuckGo/Bing search, listicle link extraction, storefront checks and deep page crawling.
8. **Localhost LLM on Vercel → hosted Groq.** The first deployment had a live LLM config but every call fell back; the header only checked configuration, not success. The stale Enterprise-only default and a possible local URL were the suspects. I fixed the model default, exposed the fallback error in the run trace, increased the GPT-OSS completion budget, lowered reasoning effort, removed revenue from the writer’s evidence, and added sentence-level evidence binding.
9. **Model claims → deterministic auto-binding.** The model did not reliably copy every factual sentence into its `claims` array. I added a binder that scans each sentence and binds it only when the sentence contains the evidence value. No evidence match, no claim.

If I did it again, I would build the live path earlier and put the seed fixtures behind a hard “no model” boundary from day one. I would also write the reply and classification eval set before tuning prompts, and I would test the hosted model’s JSON/guard pass before calling the LLM path done.

---

## Rules and context I gave the AI coding tool

**Product rules**

- Never quote a price. Pricing is discussed on a call.
- Never state an unsourced fact. Every claim maps to an evidence row with a URL and quote.
- Opt-outs are absolute and live in the data layer, not in a prompt.
- Answer “are you a bot?” honestly.
- Escalate uncertainty, complaints and second objections to a human.
- Human gates at contact doubt, first email, reply escalation and booking exceptions.
- Sales UI must be usable by a non-technical team: plain labels, visible reasons, approve/edit/reject, take over.
- Admin UI must let a non-engineer edit prompts, test them against adversarial cases, publish, and roll back without a deploy.

**Demo constraints**

- Free services only; deploy on Vercel’s free tier.
- No key required for the basic demo; the stage must not fail because of a quota.
- The 30-company corpus is synthetic, so no invented fact is attached to a real business.
- Outbound email is simulated unless Resend is configured.
- The calendar produces real `.ics` files without OAuth.
- Two seats: sales and admin.
- The local Qwen path must be used for live agents, not just scripts.
- The company-search box must accept a natural-language ICP brief and crawl real sites.

**Technical context**

- Windows, PowerShell, no git repository at the start.
- Next.js 15.5.29, React 19.3.1, TypeScript 5.9.3, Tailwind 4, Drizzle 0.45.4.
- PGlite needs a single-level directory; use `.pglite`.
- Next renders layout and page in parallel, so every page/query calls `ensureDb()` before reading.
- Do not use LangChain. Keep tool order explicit.
- The rubric lives in code; prompt edits must not change scores.
- Prompts are versioned and pinned to drafts.

**Hosting context**

- Vercel cannot reach a laptop’s `localhost`.
- Use a Neon pooled `DATABASE_URL`; without it Vercel uses in-memory PGlite and reseeds on every cold start.
- Keep `LLM_BASE_URL` empty when using Groq.
- Use `openai/gpt-oss-20b` or `openai/gpt-oss-120b`; `llama-3.3-70b-versatile` is Enterprise-only.
- Set `LLM_TIMEOUT_MS` below the 60-second function limit.
- Turn off Vercel Deployment Protection for the public demo URL.

**Process rules**

- Verify with `npm run build`, `npm run test:guards`, `npm run test:classify`, HTTP checks and browser checks.
- Do not trust a generated email or reply; read it and check the guard result.
- Keep the fallback path working at all times.
- Push working commits to the public repo and keep the deployed demo online.

---

## Where the AI got it wrong, and how I noticed

| What went wrong | How I noticed | What I changed |
|---|---|---|
| The “agent” replies were deterministic templates. Turning off the local model changed nothing in the Inbox | I turned off `localhost:8000` and replies still came back. That contradicted the agent story | Added live classification and reply generation, with template fallback only on failure |
| The seed called the live model | The seeded Inbox had emails like “Dear Alex Moreau, I hope this message finds you well…” instead of the intended demo copy | Forced `useLlm: false` in `seedDemo()` |
| The reply prompt was over-constrained and only saw the last outbound message | The replies were stiff and repetitive; the user feedback was direct | Added the recent transcript, persona/style guidance and per-intent guidance |
| The claim mapper bound two evidence IDs to the same sentence, so a live draft failed the claim guard | The run trace said “Model draft failed the claim guard; fell back to the deterministic writer” | Added a deterministic sentence-level binder that only binds a sentence when it contains the evidence value |
| The first real search returned media/tool sites and false revenue numbers ($50M from “50M impressions”) | The companies were rejected for out-of-band revenue and the result list was mostly articles | Tightened candidate filtering (require storefront signals, skip media/tools) and revenue extraction (revenue sentence only, no GMV/impressions) |
| The bot regex missed "Is this an AI?" | The 30-message classification eval scored 29/30, with `other != bot` on that exact sentence | Changed the regex from `(a )?` to `(a |an )?`; reran the eval at 30/30 |
| The header said “Live model” even when the endpoint was offline | I turned off localhost and the pill still said Live model | Not fully fixed. The run trace is the source of truth. A health check is the next step |
| `.env.example` shipped with `FORCE_MOCK=1` | I caught it while documenting the local-model setup; it would have disabled a real key | Set `FORCE_MOCK=` empty with a comment |
| The PGlite path `.data/pg` failed | `ENOENT mkdir` on first boot | Used `.pglite` |
| The first pages 500'd with `relation "drafts" does not exist` | Next rendered layout and page in parallel before seeding | Added `ensureDb()` to every page/query path |
| Editing server code made the simulate route 404 until restart | Repeated 404s after hot reload during testing | Restarted the dev server; the production build was unaffected |
| The sign-out chip sat below the fold on long pages | A screenshot showed no user chip in the sidebar | Made the sidebar sticky and added a mobile sign-out |
| The prompt pill showed a truncated ID like `prm_write_v…` | A screenshot of the review page | Showed `prompt v1` instead |
| The deployed LLM was silently falling back | Admin → Runs showed `0 tokens` and “Deterministic writer” while the header said “Live model” | Added the actual LLM error to the run trace. The old default `llama-3.3-70b-versatile` is Enterprise-only; after switching to `openai/gpt-oss-20b`, tokens appeared |
| GPT-OSS returned 1,447 tokens but no valid JSON | The run trace said “Model did not return valid JSON” | Raised the completion budget to 2,048, set `reasoning_effort=low`, merged the system prompt into the user message for GPT-OSS |
| The model quoted `$4.2M` revenue and the price guard blocked the draft | The run trace showed `Blocked term: "$4"` | Removed revenue from the writer’s evidence and told the model not to mention revenue, money, dollar amounts or percentages |
| The model wrote “hiring a Staff Accountant in Portland, OR” but did not put that sentence in `claims` | The run trace showed the exact unsourced sentence | Added the deterministic sentence-level claim binder; the model can no longer rely on a generic keyword map |
| The hosted LLM draft still fell back at the last check | Latest trace showed 1,384 tokens and a claim-guard failure; the auto-bind patch was pushed but the final hosted check was interrupted | This is the open item: verify a guard-passing hosted draft end to end |

---

## How I checked correctness

**Executable checks**

- `npm run test:guards`: **15/15 assertions pass**. The suite covers price language, unsourced funding claims, unknown evidence IDs, suppression, bot disclosure, bot evasion, outcome promises, and rubric hard gates.
- Reply classification eval: **30 labelled messages**, covering opt-out, complaint, bot, price, booking, interested, referral and objection (`npm run test:classify`). First run **29/30**; after fixing the `a | an` bot regex, **30/30**.
- Prompt test bench: **7 adversarial guard cases** plus clause lint; publish is blocked if any case fails.
- `npm run build`: production build succeeds; **22 static pages** generated.
- Key pages returned HTTP 200: `/today`, `/companies`, `/companies/cmp_01`, `/review`, `/inbox`, `/inbox?thread=thr_cmp_04`, `/calls`, `/stats`, `/admin`, `/admin/prompts`, `/admin/rules`, `/admin/runs`, `/login`.
- Company search returned a real result: query `allbirds` → `allbirds.com`, score 0, status `needs_review`, in 2.6 seconds.
- Live ICP crawl: the default brief searched DuckDuckGo, crawled public DTC lists and four live storefronts (Soko Glam, SKIMS, Steve Madden, Made In Cookware). Each got an ecommerce evidence row and went to `needs_review` because no named contact or timing signal was extracted. That is the intended gate, not a silent guess.

**End-to-end flows verified**

| Flow | Result |
|---|---|
| Edit a draft to include “$1,500 per month” | Price and claim guards block it; the draft is saved but not sendable |
| Approve a clean draft | `ok=true`, send simulated |
| Ask “Are you a bot?” | Honest disclosure, no evasion |
| Reply “Not interested, take me off your list.” | Suppression row written; no reply; agent locked out |
| Reply “Friday 10am works.” | Slot matched and booked; confirmation written |
| Prompt save → test → publish → rollback | All four steps succeed; version history intact |
| Download `.ics` | HTTP 200, 624 bytes, contains `BEGIN:VEVENT` |
| Custom inbound reply “We already have a bookkeeper in-house, thanks.” | Classified as objection and answered through the custom input |

**Scoring examples checked against the seeded corpus**

| Company | Score | Verdict | Why |
|---|---:|---|---|
| Northwind Supply | 75 | `qualified` | revenue +20, headcount +10, US +10, ecommerce +10, complexity +10, hiring +15 |
| Sundry Co | 75 | `needs_review` | strong fit but no named contact |
| Foundry & Flint | 40 | `rejected` | 64 staff is outside 5–50 |
| Cedar & Salt | 65 | `rejected` | Halifax, NS is non-US |
| The Slow Store | 35 | `rejected` | 3 staff is outside 5–50 |

**Hosted LLM verification (the honest version)**

The LLM connection is verified; a guard-passing hosted draft is not yet verified.

| Check | Result |
|---|---|
| First deployed draft | `0 tokens`, “Deterministic writer”; the header said Live model but no error was surfaced yet. The old Enterprise-only default was the first suspect |
| After switching the default to `openai/gpt-oss-20b` | `1,447 tokens`, but "Model did not return valid JSON" - reasoning tokens consumed the completion budget |
| After `max_tokens=2048`, `reasoning_effort=low`, merged system prompt | `751 tokens`, valid JSON, but the price guard blocked `$4` and the claim guard found an unsourced sentence |
| After removing revenue from the writer’s evidence | `1,384 tokens`, valid JSON, but the model did not put every factual sentence in `claims` |
| After adding the sentence-level claim binder | Pushed; the final hosted check was interrupted, so this is **not yet confirmed** |

The UI now shows the real fallback reason in **Admin → Runs**, including the failed guard and the LLM error, instead of pretending the model was used.

**What I did not verify**

- A hosted LLM draft that passes every guard and reaches Review as the LLM’s own prose. The path is implemented and the model is reachable; the last verified run still fell back.
- Real Resend delivery. The path is implemented but needs `RESEND_API_KEY` and `DEMO_INBOX`.
- Google Calendar OAuth. The demo uses `.ics` and template links.
- Live research at 30-company scale. The single-domain path is implemented; the public corpus is synthetic.
- Concurrent Neon cold-start seeding. The demo is single-instance on Vercel; a production system needs a durable seed lock.
- Qwen 7B/14B reply quality. The local model I had was 1.7B; a larger model should be measured before using it on stage.
- A large booking eval. The demo verifies the booking flow and `.ics`; it does not have a 30-reply “booked correctly 27/30” score yet.

**Latency**

- Local Qwen draft: **1.3–3.5 seconds** for a first email.
- Reply path through an OpenAI-compatible mock: **2.1 seconds** end to end, including classification and generation.
- Hosted GPT-OSS call: single-digit seconds in the tested flow; not benchmarked.
- Deterministic template fallback: effectively instant.

---

## What it costs

The demo runs at **$0** on free tiers:

| Service | Cost |
|---|---|
| Vercel Hobby | $0 |
| Neon free Postgres | $0 |
| Local Qwen via llama.cpp | $0 (electricity only) |
| Groq free tier (optional) | $0 |
| Resend free tier (optional) | $0 |
| Tavily free tier (optional) | $0 |

At Groq’s listed GPT-OSS 20B rates — **$0.075 per 1M input tokens, $0.30 per 1M output tokens** — a 1,384-token draft is roughly **$0.0002**. Thirty drafts are roughly **$0.006**; a hundred drafts are roughly **$0.02**. The free tier covers the demo unless it is hammered.

The first paid pieces at scale would be research/scraping (Firecrawl, Brave), sending infrastructure with warm-up (Instantly or Smartlead), a durable worker (Trigger.dev), and a larger hosted model. Those are deliberate production costs, not demo costs.

---

## What I would do next with more time

1. **Finish the hosted LLM path.** Verify a guard-passing GPT-OSS draft end to end, then add a hosted-model eval that measures JSON validity, claim-guard pass rate and fallback rate per model.
2. **Replace the synthetic corpus with a verified real one.** Add human review of every invented-looking fact before any real outreach.
3. **Real inbound email.** Resend or Postmark inbound webhook, dedupe by message ID, thread mapping.
4. **Google Calendar OAuth.** Free/busy, holds, idempotent event insert, cancellation handling.
5. **Durable workers.** Move research and sequencing to Trigger.dev; add retries, backoff and per-mailbox rate limits.
6. **Evals in CI.** Expand the 30-message classification set to 100+ replies; measure booking accuracy, guard false positives and fallback rate per model.
7. **Model routing.** Use a small model for classification and a larger model (Qwen 7B/14B or Groq) for writing; measure quality before choosing.
8. **Observability.** Cost per run, tokens per agent, guard failure reasons, handoff reasons, and a dashboard for the sales team.
9. **Multi-tenant security.** `workspace_id` on every row, row-level scoping, real auth, secret management and suppression-list import.
10. **CRM sync.** HubSpot or Salesforce, with the thread and call linked back to the company record.
11. **A real health indicator.** The header should say “LLM offline” when the configured endpoint is unreachable, not just “Live model.”
12. **Harden search.** Use Tavily in production; keep the keyless DuckDuckGo/Bing + directory crawl as the fallback. Add caching and provider-level rate limits.

---

## Submission checklist

- **Live platform:** https://ledgerwise-outbound-demo.vercel.app/ — seats **Maya · Sales** and **Sam · Admin**, no password. Keep it online for two weeks.
- **Code:** https://github.com/Vaaky/ledgerwise-outbound-demo
- **Session export:** export the full OpenCode session without edits, using the tool’s session export; include the whole case, not just the final build.
- **This file:** `HOW_I_WORKED.md` (also `README.md`).

The session is the honest record: it contains the wrong turns above, including the deterministic reply path, the seeded-email bug, the 29/30 classification run, the stale Groq default, the invalid JSON fallback and the guard rejections.
