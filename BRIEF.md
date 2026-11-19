# Ledgerwise — AI Outbound Platform Brief

Stored: 2026-11-19
Status: brief only — no build work started yet.

## Context

**Unscale** builds AI systems that bring clients new customers: finding the right companies, reaching out, turning replies into booked calls.

On this project we play the AI engineer. The client is **Ledgerwise** (fictional, but a typical Unscale client).

---

## The Client: Ledgerwise

- US **bookkeeping** firm.
- Does **monthly bookkeeping for e-commerce brands**.
- Today, the sales team finds leads by hand, writes every first email by hand, and answers every reply by hand.
- They want a platform that does most of this for them — **while a human stays in control**.

## Who They Sell To (ICP)

- US **e-commerce brands** selling online (Shopify, Amazon, own site).
- **~$1M–$10M** yearly revenue.
- **5–50 employees**.
- Contact person: **founder, COO, or whoever runs finance**.

## Good Reasons To Reach Out Now (Trigger Signals)

- Hiring for **finance, accounting, or operations**.
- Recently **raised money**.
- Growing into **new channels**: wholesale, Amazon, retail stores, new countries.

---

## The Rules Ledgerwise Gave Us (Hard Constraints)

1. **Never quote a price.** Pricing is discussed on a call.
2. **Never claim anything about a company that isn't true.** Every fact in an email must come from a real source.
3. **If someone says stop, unsubscribe, or "not interested"** → stop and never contact them again.
4. **If someone asks whether they're talking to a bot**, answer honestly.
5. **Anything the AI isn't sure about goes to a human.**

---

## The Job: Five Agent Capabilities

### 1. Research
- Find **at least 30 real companies** that fit Ledgerwise's customer profile.
- Collect what we need about each one.

### 2. Qualify
- Decide which companies fit and **how well**.
- Show **why**, with the **source for each reason** (a link, a quote).

### 3. Write
- Draft a **short, personal first email** for each qualified company.
- **Every fact in it must come from our research.**

### 4. Reply
- When a prospect replies, the agent answers.
- Answers questions, handles objections, follows the rules above, and **knows when to hand the thread to a human**.

### 5. Book Calls
- When a prospect wants to talk, the agent offers **real free slots** and **books the call in a calendar**.

---

## The Platform (for Ledgerwise Sales Team)

Users are **not technical**. They must be able to:

- **See the companies**, their **score**, and the **reasons behind it**.
- **Review each email before it goes out**: approve, edit, or reject.
- **Read every conversation** and **take over any thread**.
- **See the calls the agent booked**.

---

## Requirement Traceability (quick reference)

| Area | Requirement |
|---|---|
| Research | ≥30 real companies matching ICP, with collected evidence |
| Qualify | Fit score + sourced reasons (link or quote per reason) |
| Write | Short personal first email, every fact sourced |
| Reply | Q&A, objection handling, rule compliance, human handoff |
| Book | Real availability → booked calendar call |
| UI | Companies + scores + reasons; email approve/edit/reject; conversations + takeover; booked calls |
| Rules | No pricing; no unsourced claims; hard opt-out; honest bot disclosure; escalate uncertainty |
