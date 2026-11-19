# Task 1 — Agent Architecture

**Status:** design only. No code written.
**Scope:** one orchestrator agent + three specialist sub-agents + human gate.
**Client:** Ledgerwise (US bookkeeping for e-commerce brands).

---

## 1. Design principles

1. **LLM proposes, deterministic layer disposes.** Every outbound action passes a code-level guard, not just a prompt instruction.
2. **Facts are objects, not prose.** Each company fact is a record with a URL, a quote, and a fetch timestamp. Emails reference fact IDs; they never contain unbound claims.
3. **One owner of state.** The orchestrator owns the pipeline state machine. Sub-agents are stateless workers: input → structured output.
4. **Silence is a valid action.** The agent may choose "do nothing / escalate" at any step. Default on doubt is human.
5. **Everything is auditable.** Every score, draft, send, reply and booking records which agent, which prompt version, which evidence.

---

## 2. Topology

```
                         ┌──────────────────────────┐
                         │      ORCHESTRATOR        │
                         │  (Conductor / policy)    │
                         │  state · routing · gates │
                         └───┬───────┬───────┬──────┘
              ┌──────────────┘       │       └──────────────┐
              ▼                      ▼                      ▼
   ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
   │ RESEARCH AGENT     │  │ QUALIFIER AGENT    │  │ COMMS AGENT        │
   │ find + collect     │  │ score + justify    │  │ write / reply /    │
   │ evidence           │  │ with sources       │  │ book               │
   └─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
             │                       │                       │
             └───────────┬───────────┴───────────┬───────────┘
                         ▼                       ▼
                 ┌───────────────┐       ┌────────────────┐
                 │  EVIDENCE     │       │  GUARD LAYER   │
                 │  STORE (facts)│       │  code + policy │
                 └───────┬───────┘       └───────┬────────┘
                         │                       │
                         └──────────┬────────────┘
                                    ▼
                         ┌────────────────────┐
                         │    HUMAN GATE      │
                         │ review · approve   │
                         │ pause · takeover   │
                         └────────────────────┘
```

The orchestrator is the only component that can advance a lead, trigger a send, or close a thread. Sub-agents return proposals; the orchestrator decides.

---

## 3. Orchestrator

**Job:** run the pipeline, enforce policy, route work, own budgets and gates.

**Responsibilities**
- Own the lead state machine (§10) and all transitions.
- Assign work to sub-agents, validate their structured output against schemas.
- Enforce hard limits: daily volume, per-domain frequency, retry caps, cost budget.
- Open human-gate requests and wait for resolution.
- Never perform research, writing, or scoring itself.

**Tools**
| Tool | Purpose |
|---|---|
| `queue.enqueue / claim / ack` | durable work items |
| `state.transition(lead_id, from, to, reason)` | guarded transitions |
| `gate.request(type, payload, sla)` | human review ticket |
| `budget.check / consume(agent, run_id)` | cost + volume caps |
| `audit.log(event)` | append-only trail |
| `suppression.is_blocked(email, domain, company)` | pre-send hard check |

**Modes:** `dry_run` (research + qualify only, no outbound), `supervised` (default: every send gated), `autopilot` (sends allowed only after N approved sends and zero guard failures — still opt-out-safe, still gated on escalations), `paused`.

---

## 4. Shared data contracts

### 4.1 Evidence (the atom of truth)

```
Evidence {
  id
  company_id
  field          // "revenue_band" | "headcount" | "hq_country" | "channel_shopify" |
                 // "hiring_finance" | "funding_round" | "channel_expansion" | "contact_role" ...
  value          // normalized: "1M-10M" | "18" | "US" | "true" | "Series A $8M"
  source_url
  source_type    // company_site | shopify_storefront | job_board | news | registry | social | press_release
  quote          // exact snippet supporting value (max 400 chars)
  retrieved_at
  confidence     // 0-1
  status         // verified | stale | conflicting
}
```

Rules enforced in code:
- An `Evidence` row cannot exist without `source_url` + `quote`.
- A score reason must reference ≥1 `Evidence.id`.
- A draft email claim must reference ≥1 `Evidence.id`.
- Research agent output that fails validation is dropped, not averaged.

### 4.2 Other entities

```
Company   { id, domain, name, hq_country, revenue_band, headcount, channels[], status }
Contact   { id, company_id, name, title, role_class, email, email_source, confidence }
Score     { id, company_id, fit[], intent[], total, verdict, reasons[]→Evidence }
Draft     { id, company_id, contact_id, subject, body, claims[]→Evidence, prompt_version }
Thread    { id, contact_id, state, handoff_reason?, assigned_user? }
Message   { id, thread_id, direction, body, classification, sent_by(agent|human) }
Call      { id, thread_id, slot_start, slot_end, status, calendar_event_id }
Suppression { email?, domain?, company_id?, reason, created_at, source }
AuditEvent  { id, actor, action, object, before, after, ts }
```

### 4.3 Confidence and escalation

Every sub-agent returns `confidence (0-1)` plus `reason_codes[]`. Orchestrator escalates if `confidence < threshold` **or** a hard-gate condition fires. Thresholds are configurable in the admin console (Task 2).

---

## 5. Agent 1 — Research

**Mission:** produce a deduplicated candidate set of real US e-commerce companies that pass the ICP filter, with evidence attached to every field.

**ICP is a hard predicate, not a suggestion**
| Field | Rule | Handling when unknown |
|---|---|---|
| Geography | US-based (HQ or primary market) | Reject unless strongly implied; never guess |
| Business model | Sells physical goods online (Shopify / Amazon / own store) | Reject if B2B SaaS, services-only, dropship-spam, adult/gambling |
| Revenue | ~$1M–$10M/yr | Estimate from headcount, traffic, funding, marketplace signal; mark `estimated`; reject if outside band |
| Headcount | 5–50 | LinkedIn / site / job posts; mark estimate |
| Contact | Founder, COO, or finance owner (CFO, controller, VP Finance, "finance lead") | Company stays in `needs_contact`; no email drafted until a named contact exists |

**Tools**
| Tool | Returns | Notes |
|---|---|---|
| `web.search(query, filters)` | result titles/URLs/snippets | source of discovery |
| `web.fetch(url)` | rendered text + archived HTML snapshot | snapshot stored to defend claims later |
| `storefront.detect(domain)` | platform, theme, catalog size | Shopify/Amazon/own-site classification |
| `jobs.search(company, terms)` | open roles + URLs | triggers: finance/accounting/ops roles |
| `news.search(company, window)` | funding / expansion articles | triggers: raise, new channel, new country |
| `registry.lookup(company)` | state registration, address | corroborates US + entity type |
| `social.profile(company | person)` | public LinkedIn-style facts | public data only, respect ToS/robots |
| `contact.find(company, roles)` | names, titles, public emails | role_class normalization |
| `dedupe.check(domain | name)` | existing lead match | hard block on duplicates |

**Loop**
1. Generate discovery queries from ICP + triggers (e.g. `"Shopify" "hiring" "staff accountant" site:...`, funding round lists, DTC brand directories, marketplace seller lists).
2. Expand: for each candidate domain → storefront + site + about + careers.
3. Extract candidate facts as Evidence rows; anything unsupported is discarded.
4. Score-lite gate: drop obvious non-fits immediately (wrong country, SaaS, >50 employees with clear evidence).
5. Stop when **≥30 companies pass the ICP predicate** with a named contact (target 40–50 candidates to absorb qualifier rejections).
6. Hand batch to orchestrator; write nothing to CRM without evidence.

**Hard limits**
- No invented domains or emails. If a contact email is not found on a real page, leave empty (do not pattern-guess and send).
- Respect `robots.txt`, rate limits, and site ToS; no logged-in scraping of gated networks.
- Max 3 fetch retries per URL; archive snapshot per fact.

**Output contract**
```
ResearchBatch {
  companies: [{
    domain, name, hq_country,
    facts: Evidence[],
    contacts: [{name, title, role_class, email?, evidence_id}],
    icp: { revenue: pass|fail|unknown, headcount: ..., us: ..., ecommerce: ..., contact: ... },
    confidence, reason_codes[]
  }]
}
```

---

## 6. Agent 2 — Qualifier

**Mission:** rank candidates by (a) how well they fit Ledgerwise and (b) how good the reason to reach out *now* is — and show the receipt for every point.

**Two scores, not one**
- **Fit (0–60):** can Ledgerwise serve them well?
- **Intent / timing (0–40):** why now?

| Fit dimension | Pts | Evidence needed |
|---|---|---|
| Revenue inside $1–10M band | 20 | source or marked estimate; unknown = 0 + flag |
| Headcount 5–50 | 10 | source or estimate |
| US-based | 10 | site/registry/address |
| Sells online (Shopify/Amazon/own) | 10 | storefront detection |
| Multi-channel / marketplace complexity (bookkeeping need) | 10 | 2+ channels or marketplace payouts visible |

| Intent signal | Pts | Freshness |
|---|---|---|
| Hiring finance / accounting / ops | 15 | ≤90 days |
| Raised money | 15 | ≤12 months |
| New channel / country / wholesale / retail | 10 | ≤6 months |

**Verdict bands**
- `≥65` → **qualified** (still needs email approval)
- `45–64` → **needs human review** (gate 2)
- `<45` → **rejected** (reason logged)
- Hard gates that force rejection regardless of score: no named decision-maker contact, no evidence-backed trigger, clear out-of-ICP, duplicate, suppressed.

**Anti-hallucination rules**
- The agent may only cite `Evidence.id`s it received; it cannot add facts from world knowledge.
- Every reason is rendered as: `{claim, evidence_id, source_url, quote}`.
- If two sources conflict (e.g. headcount 40 vs 120), mark `conflicting`, drop the point, escalate.
- No score point is awarded for absence of evidence.

**Tools:** `evidence.query(company_id)`, `rubric.score(facts)` (deterministic, code-owned weights), `evidence.verify(evidence_id)` (re-fetch to confirm still true), `gate.request`.

The rubric lives in code so prompt edits cannot silently change scoring math.

**Output**
```
Qualification {
  company_id, fit_score, intent_score, total, verdict,
  reasons: [{ dimension, points, claim, evidence_id }],
  missing: [field...], confidence, escalation?: {code, question}
}
```

---

## 7. Agent 3 — Communications

Three capabilities behind one agent: **write**, **reply**, **book**. It is the only agent allowed to touch an outbound channel — and only through the guard layer.

### 7.1 Write — first email

Input: company + contact + qualified reasons. Output: subject, body, `claims[]` (each mapped to an Evidence id).

Constraints (checked in code):
- ≤120 words body, 1 idea, 1 ask (15-min call), no attachments, no images, plain text.
- Exactly one personalization anchor (a sourced fact about *them*), one trigger reference, one relevant outcome for a bookkeeping firm.
- **No price, no "$", no "cost", no "fee", no "per month", no ranges.**
- No claim without a claim→evidence binding.
- No fake familiarity ("loved your podcast" unless evidenced), no fake urgency, no invented mutual connections.
- Includes required identification + opt-out line per sending policy.
- Signature from config, never model-invented.

Status: `draft → pending_review → approved | edited | rejected → sent`.

### 7.2 Reply — inbound handling

Classify each inbound message, then route:

| Class | Agent action | Human? |
|---|---|---|
| Interested / "tell me more" | answer briefly with sourced facts, offer slots | no |
| Pricing question | **no number**; explain pricing depends on scope and is covered on the call; offer slots | no |
| "Are you a bot / AI?" | disclose plainly, continue helpfully | no |
| Objection (have a bookkeeper, in-house, too expensive, bad timing) | acknowledge, one sourced reframe max, offer exit | escalate if repeated 2× or hostile |
| Not now / later | tag nurture, propose a specific re-contact date, respect frequency cap | no |
| Not interested / stop / unsubscribe / remove me | **suppress immediately**, no further contact, no retention beyond legal need | auto + notify owner |
| Referral / "talk to X" | thank, ask permission to contact X; do not auto-add | no |
| Complaint / legal / press / refund / data request | do not answer on merits | **yes, immediate** |
| Ambiguous, contradictory, new topic, policy gap, low confidence | short holding reply or silence | **yes** |
| Thread already owned by a human | stay silent | — |

Guard checks on every reply: price scan, claim binding, suppression check, tone/length, no promises of outcomes or timelines, no legal/tax advice, no invented availability.

### 7.3 Book — calendar

1. `calendar.freebusy` on the connected Ledgerwise calendar(s), next 10 business days.
2. Offer 2–3 real slots in the prospect's timezone, business hours only.
3. Place a **hold** (15–30 min TTL) and state the expiry.
4. On confirmation, `calendar.book` with title, attendees, company, thread link, agenda; idempotency key = thread + slot.
5. Send confirmation + calendar invite; write `Call` row; notify owner.
6. If slot is taken between offer and confirm → apologize, offer 2 new slots; never double-book.
7. No booking without a confirmed human attendee from Ledgerwise; no bookings outside configured hours; no meetings on US federal holidays.

**Tools:** `crm.read/write`, `email.thread.read`, `email.send` (guard-gated), `calendar.freebusy`, `calendar.hold`, `calendar.book`, `suppression.check`, `handoff.create`, `notify.owner`, `template.render`.

---

## 8. Guard layer (where the five rules actually live)

| Rule | Prompt? | Code check? | Human? |
|---|---|---|---|
| No price | yes | **yes** — regex + numeric/currency detector + LLM judge on every outbound; hard block | price requests routed to call |
| No unsourced claims | yes | **yes** — claim↔evidence binding; unmatched claim blocks send | unverifiable → gate |
| Stop / unsubscribe | yes | **yes** — keyword + intent classifier → `Suppression` row; send tool checks it first, fail-closed | owner notified |
| Honest bot disclosure | yes | **yes** — banned evasions ("no, I'm a real person"); disclosure template | — |
| Uncertainty → human | yes | **yes** — confidence threshold + reason codes | gate |

Guard layer runs **after** generation and **before** send, and again on human-edited drafts (an edit cannot bypass the rules; it only changes the text).

Additional send hygiene: max 1 email per contact per 3 days, max 2 per company per 14 days, daily cap, domain warm-up, bounce rate >3% or complaint >0.1% → auto-pause campaign.

---

## 9. Human gate

Not one gate — four, at the points where an error is expensive or irreversible.

| Gate | Trigger | Human options | Blocking? |
|---|---|---|---|
| **G1 — Contact/ICP doubt** | missing role, conflicting data, score 45–64 | approve lead, fix data, reject | yes, for that lead |
| **G2 — First email** | every draft (default) | approve, edit, reject w/ reason | yes, always in v1 |
| **G3 — Reply escalation** | complaint/legal, 2× objection, policy gap, low confidence | reply as human, edit suggestion, close | yes, agent holds |
| **G4 — Booking exception** | no mutual slot, external attendee, off-hours request | approve alternative, decline | yes |

**Gate mechanics**
- Ticket contains: what the agent wants to do, why (evidence links), what it's unsure about, suggested action, and one-click alternatives.
- SLA timer; stale tickets never auto-approve — they expire to "no action".
- **Takeover:** human claims a thread → agent goes silent → human replies → "hand back" resumes agent with summary + rules.
- **Pause:** per agent, per campaign, global kill switch. Pause = stop new outbound immediately; inbound classification continues read-only.
- Every human action logged with actor, before/after, reason code — this becomes the training/eval signal.

---

## 10. Lead state machine

```
discovered → researched → qualified ─┬→ rejected
                                     ├→ needs_review → qualified | rejected
                                     └→ draft_ready → pending_approval
                                                         ├→ approved → sending → sent
                                                         ├→ edited → pending_approval
                                                         └→ rejected (reason)
sent → replied ─┬→ engaged → slots_offered → booked → held → completed | no_show
                ├→ nurture (dated) → re-engage (cap)
                ├→ opted_out (terminal, suppressed forever)
                ├→ escalated → human_handling → handed_back | closed
                └→ no_reply (after N touches, then closed)
```

Terminal states: `rejected`, `opted_out`, `closed`, `unsubscribed`. `opted_out` blocks all future paths at the data layer.

---

## 11. Failure modes and responses

| Failure | Response |
|---|---|
| Research invents a domain | domain must resolve + page fetched + snapshot stored; else dropped |
| Contact email guessed | never send to unverified-pattern addresses; flag for human |
| Qualifier over-scores | rubric is code-owned; every point needs evidence id |
| Writer smuggles a price | pre-send numeric/currency detector blocks |
| Reply argues with an opt-out | classifier hard-routes to suppression, agent output discarded |
| Calendar race | hold + idempotent booking + re-offer |
| Model/provider outage | queue holds, no partial sends, alert |
| Prompt regression | canary + eval suite + one-click rollback (Task 2) |
| Human approves bad email | post-send audit sample + feedback loop into eval set |

---

## 12. Out of scope for v1

- Multi-touch sequences beyond a single polite follow-up (cap: 2 touches total).
- LinkedIn/WhatsApp/phone outreach.
- Autonomous sending without approval.
- Invoicing, onboarding, or delivering bookkeeping work.
- CRM two-way sync beyond a one-way push of booked calls and lead status.

---

## 13. Decisions I made (flag if you disagree)

1. **One orchestrator + 3 stateless specialists**, not 3 autonomous peers. Prevents two agents acting on the same lead.
2. **Scoring weights live in code**, not in a prompt, so admin prompt edits can't change math.
3. **First email is always human-approved in v1**; autopilot is earned, per-campaign, after a clean approval streak.
4. **Opt-out is deterministic and terminal**, never an agent judgment call.
5. **Company facts are a table, emails are a view over it** — the only way "every fact is sourced" is provable.
6. **Two touches max** in v1; "not now" gets a dated nurture, not a sequence.
