# Task 2 — Platform Design

**Status:** design only. No code written.
**Users:** Ledgerwise sales team (non-technical) + one admin/operator who tunes the agents.
**Principle:** the sales surface is a work queue, not a dashboard. The admin surface is a control room, not a code editor.

---

## 1. Two surfaces, one product

| Surface | Who | Job to be done | Default? |
|---|---|---|---|
| **Sales Workspace** | founder/ops reviewer, SDR, sales lead | review companies, approve emails, talk to prospects, see calls | yes |
| **Admin Console** | Unscale operator / Ledgerwise owner | change how agents think, set rules, watch quality, pause things | hidden behind role + menu |

Admin is not a separate app — same product, gated by role. Non-admins never see a prompt, a JSON schema, or a token count.

---

## 2. Sales Workspace

### 2.1 Navigation (five items, no more)

```
Today · Companies · Review · Inbox · Calls
```

`Today` = what needs a human right now: emails awaiting approval, threads escalated, calls booked today, campaigns paused. One click to the item, not a chart.

### 2.2 Companies

List: name, domain, fit score, intent score, verdict chip, trigger chips, status, last activity.

Row expands to a **company card**:
- **Why this company** — score breakdown with plain-language reasons; each reason has a source chip → hover/popover shows URL, quote, date, and "open source".
- **Facts** — revenue band, headcount, channels, HQ (each sourced or marked *estimated*).
- **People** — name, title, why they're the right contact.
- **History** — emails, replies, calls, notes.
- Actions: approve for outreach, reject (reason required), ask for more research (`needs review`).

Design rules: no score without its reasons visible; estimates look different from verified facts (dotted underline + "estimated"); conflicting data shows a yellow bar, never a silent average.

### 2.3 Review (the core screen)

Three columns:

```
┌─────────────┬───────────────────────────────┬──────────────────┐
│ Queue       │ Draft                         │ Why this company │
│ (pending)   │ subject + body                │ score + reasons  │
│ • Company A │ claims highlighted → source   │ evidence links   │
│ • Company B │ [Approve] [Edit] [Reject]     │ contact + trigger│
└─────────────┴───────────────────────────────┴──────────────────┘
```

- Each personalized claim is underlined; clicking shows the exact source quote.
- Any claim with no source cannot be approved (button disabled + explanation).
- **Approve & send**, **Edit** (inline, re-runs guards, returns to same screen), **Reject** with reason chips: wrong person / wrong company / bad angle / tone / factually wrong / other.
- Keyboard: `A` approve, `E` edit, `R` reject, `J/K` next/prev.
- SLA badge ("waiting 2h"), assignee, and a "send later" option respecting send windows.
- Bulk approve is off by default; unlockable per campaign after a clean streak.
- Every draft shows **"written by Agent v3 · prompt v12"** in small text + a "report a problem" link that feeds the eval set.

### 2.4 Inbox

Unified threads across agent and humans.
- Filters: **Needs you** · Agent handling · Human handling · Booked · Opted out.
- Thread view: message list, AI summary at top, **handoff reason** chips ("asked about pricing", "complaint", "low confidence").
- **Take over** toggle: agent goes silent, human writes freely; **Hand back to agent** requires a one-line note.
- Suggested reply is shown to the human as a starting point — never sent by itself.
- Opt-out threads are read-only with a red banner: "Suppressed — no further contact."
- Booking events appear inline ("Call booked Thu 2:00 PM ET").

### 2.5 Calls

Table: company, contact, date/time (user TZ), status (held/booked/completed/no-show/cancelled), booked by (agent/human), calendar sync state.
- Click → thread, company card, reschedule/cancel.
- "Add to my calendar" and a copyable agenda.
- No-show → one suggested follow-up (human-approved).

### 2.6 Non-technical decisions

- Plain labels: "Why we picked this company", not "qualification rationale".
- Rules appear as **locked cards** with a padlock, so reviewers know what the agent cannot do.
- One-click **Pause everything** in the header (with confirm + reason).
- No raw JSON, no model names, no logs in the sales surface.
- Empty states always say the next action.
- Mobile-readable review screen: approve/reject works on a phone.
- Undo window after reject; approve is final (it sends).

---

## 3. Admin Console

### 3.1 Navigation

```
Agents · Prompts · Rules & Guardrails · Tools & Data · Quality · Runs · Team · Danger Zone
```

### 3.2 Agents

Card per agent: Research, Qualifier, Comms, Orchestrator.
- Status (running / paused), model, temperature, tool list, last run, success rate, escalation rate, cost today.
- Toggles: enable tool, pause agent, dry-run mode.
- **Mental model shown plainly:** "Research finds companies. Qualifier scores them. Comms writes, replies, books. The Conductor decides who does what."

### 3.3 Prompt Studio (the main admin feature)

Per agent, a set of **named prompt blocks**, each independently versioned:

| Block | Editable? | Purpose |
|---|---|---|
| Identity | yes | role, voice, boundaries ("you are a research analyst for a bookkeeping firm") |
| Task instructions | yes | the loop for this agent (research method, scoring explanation, email shape) |
| Rules (inherited) | **locked** | the five Ledgerwise rules; read-only, managed by policy owner |
| Output schema | locked | must match the code contract |
| Examples (few-shot) | yes | 3–10 curated examples, each with expected output |
| Style & tone | yes | length, reading level, banned phrases, signature |
| Escalation policy | numeric | confidence threshold, retry cap, when to ask a human |

**Editing flow (draft → test → publish):**
1. Edit in **Draft** — published version keeps running untouched.
2. **Diff view** vs published, with comments.
3. **Test bench**: run the draft against a fixed set of fixtures (5 saved companies, 8 saved replies, 3 objections, 2 opt-outs, 1 bot question).
4. **Scorecard** per run: claim-source coverage %, rule violations (must be 0 for publish), price mentions (0), unsourced claims (0), tone/length pass rate, escalation correctness, latency, cost.
5. **Publish** requires passing the scorecard + (optionally) a second approver.
6. **Canary**: 10% of runs on the new version; auto-rollback if violation rate > 0 or escalation rate spikes >2×.
7. **Rollback** to any prior version in one click.

Every draft/email/score/booking stores the exact prompt version + model + tool set that produced it, so "why did it say that?" is always answerable.

**Guardrail rule editor** (separate from prompts, so it can't be prompted away):
- Forbidden: price terms, currency patterns, outcome promises, "I'm a real person".
- Required: identification, opt-out line, bot disclosure template, signature.
- Opt-out keywords and intents → hard suppression.
- Max words, max links, send windows, per-domain frequency caps, daily caps.
- Claim policy: block send if any claim lacks an evidence id.
- All rule changes are logged and require the owner role; some (opt-out, bot disclosure) can be marked immutable.

### 3.4 Tools & Data

Registry of tools each agent can call, with credentials status, rate limits, and permission toggles.
- Research: web search, page fetch, storefront detect, job boards, news, registry, contact find.
- Comms: email send/read, calendar read/book, CRM write.
- Per-tool kill switch and a "requires human" flag (e.g. `email.send` in supervised mode).
- Suppression list manager: view/search/add/remove, with reason and timestamp; import/export.
- Evidence archive: stored page snapshots with retention setting ("keep 12 months") — this is how we defend "every fact is true".

### 3.5 Quality

- **Eval set** grows from rejected drafts, edited drafts, and human replies; each item stores expected behavior.
- Weekly scorecard per agent: qualified precision, reply classification accuracy, guard blocks, human override rate, handoff correctness.
- **Drift alerts**: "Research agent's revenue estimates dropped 12% in confidence this week."
- Sample audit: 10 random sent emails/week for a human spot-check; misses become eval fixtures.

### 3.6 Runs

A readable trace per lead: discovered → sources fetched → score with reasons → draft → guards → approval → send → reply → booking. Expand any step to see inputs, outputs, tool calls, and version. Searchable by company, contact, error code. "Replay on new prompt" button for debugging.

### 3.7 Team & roles

| Role | Sees | Can do |
|---|---|---|
| Owner (Ledgerwise) | everything | rules, prompts (with approval), spend limits, kill switch |
| Admin/Operator (Unscale) | everything | prompts, tools, thresholds, runs |
| Manager | Sales + Quality + Runs | approve, takeover, pause campaign, edit thresholds within bounds |
| Reviewer / SDR | Sales | approve/edit/reject, reply, takeover, book |
| Read-only | Sales | view |

Prompt edits require re-auth + reason; rules marked immutable are Owner-only and change-logged.

### 3.8 Danger Zone

Pause all outreach · clear queue · revoke a tool's credentials · export data · delete campaign (soft delete with 30-day restore). Each with typed confirmation and an audit entry.

---

## 4. Key screens, summarized

| Screen | Must answer in <5 seconds |
|---|---|
| Today | What needs me, and what's stuck? |
| Companies | Who are we targeting, and is the reason credible? |
| Review | Is this email true, on-message, and safe to send? |
| Inbox | Who replied, who's waiting, who's angry? |
| Calls | What's booked, and did it stick? |
| Prompt Studio | What changed, does it still pass, who approved it? |
| Runs | Why did the agent do that? |

---

## 5. Data model (platform level)

Extends Task 1 §4. Key tables:

`users, roles, campaigns, companies, contacts, evidence, scores, drafts, threads, messages, calls, suppressions, agents, prompt_versions, prompt_runs, guardrail_rules, tool_registry, eval_cases, eval_runs, audit_events, settings`

Platform-only fields worth noting:
- `drafts.prompt_version_id`, `drafts.model`, `drafts.guard_result`
- `messages.sent_by` (`agent` | `user:<id>`), `messages.classification`, `messages.confidence`
- `prompt_versions.{agent, block, body, status, parent_id, published_by, published_at, scorecard}`
- `audit_events.{actor, actor_type, action, object_type, object_id, before, after, reason}`

---

## 6. Suggested stack (if/when we build)

Deliberately boring so Ledgerwise can own it after handover:
- **App:** Next.js + TypeScript, Tailwind + shadcn/ui, server actions.
- **DB:** Postgres (Neon/Supabase) + Drizzle; row-level scoping by workspace.
- **Jobs:** Inngest or Trigger.dev for research loops, retries, holds, SLAs.
- **Email:** Postmark or Resend (inbound webhook + outbound), dedicated subdomain, warm-up plan.
- **Calendar:** Google Calendar OAuth (Outlook later), free/busy + event insert.
- **LLM:** one gateway (Vercel AI SDK or OpenRouter) so models are swappable per agent; prompts stored in DB, not in code.
- **Observability:** Langfuse (or similar) for traces; Postgres for product-visible runs.
- **Auth:** Clerk/Auth.js with org roles.

---

## 7. MVP cut (what ships first)

1. Companies + evidence + source popovers.
2. Qualifier score with reasons.
3. Draft → review → approve/edit/reject → send (guarded).
4. Inbound reply → classification → human gate → takeover.
5. Calendar slots → book → Calls list.
6. Admin: pause switches, suppression list, run traces, prompt versioning with test/publish/rollback.
7. Guardrail rules + eval set seeded from first 50 human decisions.

Deferred: autopilot sending, A/B prompt experiments at scale, multi-mailbox routing, Outlook, CRM sync beyond push, analytics dashboards.

---

## 8. Open decisions for you

1. **Email identity:** one shared Ledgerwise inbox, or one per SDR? Affects thread ownership and "take over".
2. **Calendar:** Google only, or Google + Outlook from day one?
3. **Lead source budget:** paid enrichment (Apollo/Clay) allowed, or public-web only?
4. **Approval scope:** first email only, or also every outbound reply until trust is earned?
5. **Reply volume:** expected replies/day — decides whether Inbox needs assignment/routing in v1.
6. **Data retention:** how long we keep page snapshots that back old claims (12 months suggested).
