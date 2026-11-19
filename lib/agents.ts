import { sql } from "drizzle-orm";
import { rows, run } from "./db";
import { id, insertRows } from "./db/sql";
import type {
  CallRow,
  Claim,
  Company,
  Contact,
  Draft,
  Evidence,
  Message,
  Reason,
  RunRow,
  Score,
  ThreadRow,
} from "./types";
import { computeScore } from "./rubric";
import { guardDraft } from "./guards";
import { llmEnabled, llmJson } from "./llm";
import { fmtSlot, titleCase } from "./format";
import {
  extractBrandHosts,
  htmlToText,
  isBrandHost,
  searchWeb,
  type SearchHit,
} from "./websearch";

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ reads */

export async function getCompany(companyId: string): Promise<Company | null> {
  const r = await rows<Company>(sql`select * from companies where id = ${companyId}`);
  return r[0] ?? null;
}

export async function getEvidence(companyId: string): Promise<Evidence[]> {
  return rows<Evidence>(
    sql`select * from evidence where company_id = ${companyId} order by field`,
  );
}

export async function getContact(companyId: string): Promise<Contact | null> {
  const r = await rows<Contact>(sql`select * from contacts where company_id = ${companyId}`);
  return r[0] ?? null;
}

export async function getScore(companyId: string): Promise<Score | null> {
  const r = await rows<any>(sql`select * from scores where company_id = ${companyId}`);
  if (!r[0]) return null;
  return { ...r[0], reasons: safeParse(r[0].reasons, []), missing: safeParse(r[0].missing, []) };
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
  const r = await rows<ThreadRow>(sql`select * from threads where id = ${threadId}`);
  return r[0] ?? null;
}

function safeParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function logRun(
  kind: string,
  companyId: string | null,
  label: string,
  steps: RunRow["steps"],
  tokens = 0,
  status = "done",
): Promise<void> {
  await insertRows("runs", [
    { id: id("run"), kind, company_id: companyId, label, status, steps: JSON.stringify(steps), tokens, created_at: now() },
  ]);
}

async function audit(actor: string, action: string, objectType: string, objectId: string, before: string, after: string) {
  await insertRows("audit", [
    { id: id("aud"), actor, action, object_type: objectType, object_id: objectId, before, after, ts: now() },
  ]);
}

/* -------------------------------------------------------------- qualify */

export async function qualifyCompany(companyId: string, actor = "agent:qualifier"): Promise<Score> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("company not found");
  const evidence = await getEvidence(companyId);
  const contact = await getContact(companyId);
  const result = computeScore(company, evidence, contact);

  await run(sql`delete from scores where company_id = ${companyId}`);
  await insertRows("scores", [
    {
      id: id("scr"),
      company_id: companyId,
      fit: result.fit,
      intent: result.intent,
      total: result.total,
      verdict: result.verdict,
      reasons: JSON.stringify(result.reasons),
      missing: JSON.stringify(result.missing),
      confidence: result.confidence,
      created_at: now(),
    },
  ]);

  const flowStates = ["researching", "qualified", "needs_review", "rejected"];
  if (flowStates.includes(company.status)) {
    await run(sql`update companies set status = ${result.verdict} where id = ${companyId}`);
  }

  await logRun("qualify", companyId, `Scored ${company.name}: ${result.total}/100 (${result.verdict})`, [
    { at: now(), text: `Read ${evidence.length} evidence records`, tool: "evidence.query", ok: true },
    {
      at: now(),
      text: `${result.reasons.length} points awarded, ${result.missing.length} gaps`,
      tool: "rubric.score",
      ok: true,
    },
    {
      at: now(),
      text: result.verdict === "needs_review" ? "Routed to human review (missing or borderline)" : `Verdict: ${result.verdict}`,
      tool: "gate.request",
      ok: result.verdict !== "needs_review",
    },
  ]);

  return { ...result, id: "", company_id: companyId, created_at: now() };
}

/* --------------------------------------------------------------- write */

function triggerSentence(company: Company, ev: Evidence): string {
  if (ev.field === "trigger_hiring") {
    return `Saw ${company.name} is hiring a ${ev.value.toLowerCase()} — usually the point where the monthly close starts to slip.`;
  }
  if (ev.field === "trigger_funding") {
    return `Congrats on the ${ev.value} — that usually means more channels to reconcile, not fewer.`;
  }
  return `Saw ${company.name} is moving into ${ev.value} — that's usually where Shopify bookkeeping gets messy.`;
}

function channelSentence(company: Company, complexity: Evidence | undefined): string {
  if (complexity) {
    return `Selling through ${company.channels.replace(/,/g, " and")} means multiple payout reports to reconcile every month.`;
  }
  return `Keeping Shopify clean usually becomes a second job around ${company.headcount} people.`;
}

export function buildEmail(
  company: Company,
  contact: Contact,
  evidence: Evidence[],
): { subject: string; body: string; claims: Claim[] } {
  const first = contact.name.split(" ")[0];
  const trigger =
    evidence.find((e) => e.field.startsWith("trigger_")) ??
    evidence.find((e) => e.field === "ecommerce")!;
  const complexity = evidence.find((e) => e.field === "complexity");
  const tSentence = triggerSentence(company, trigger);
  const cSentence = channelSentence(company, complexity);

  const subjects: Record<string, string> = {
    trigger_hiring: `${company.name} + a finance hire`,
    trigger_funding: `After the ${trigger.value}`,
    trigger_expansion: `Bookkeeping as ${company.name} adds ${trigger.value}`,
  };
  const subject = subjects[trigger.field] ?? `Bookkeeping at ${company.name}`;

  const claims: Claim[] = [{ text: tSentence, evidence_id: trigger.id }];
  const channelEv = complexity ?? evidence.find((e) => e.field === "ecommerce");
  if (channelEv) claims.push({ text: cSentence, evidence_id: channelEv.id });

  const body = [
    `Hi ${first},`,
    "",
    tSentence,
    cSentence,
    "",
    "We run the monthly close for e-commerce brands your size — Shopify payouts, Amazon settlements and sales tax — so reconciliation stops landing on your team.",
    "",
    "Worth 15 minutes next week? I can send two times that work.",
    "",
    "Maya Chen",
    "Ledgerwise · monthly bookkeeping for e-commerce brands",
    'Not relevant? Reply "stop" and I won\'t follow up.',
  ].join("\n");

  return { subject, body, claims };
}

const CLAIM_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "was",
  "were", "has", "have", "had", "our", "their", "about", "into", "over", "under",
  "more", "than", "its", "they", "them", "can", "will", "not", "but", "all", "one",
  "two", "new", "per", "via", "using", "use", "sells", "selling", "sold", "company",
  "brand", "page", "lists", "listed", "noticed",
]);

/** Bind a factual sentence to an evidence row only when the sentence contains that row's value. */
function autoBindClaims(body: string, evidence: Evidence[]): Claim[] {
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const claims: Claim[] = [];
  for (const sentence of sentences) {
    const haystack = sentence.toLowerCase();
    for (const item of evidence) {
      const tokens = item.value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => (token.length > 2 || /^\d+$/.test(token)) && !CLAIM_STOP.has(token));
      if (!tokens.length) continue;
      const matched = tokens.filter((token) => haystack.includes(token));
      if (matched.length >= Math.min(2, tokens.length)) {
        claims.push({ text: sentence, evidence_id: item.id });
      }
    }
  }
  return claims;
}

export async function draftEmail(
  companyId: string,
  opts: { promptVersionId?: string; actor?: string; useLlm?: boolean } = {},
): Promise<{ draft?: Draft; error?: string }> {
  if (await isPaused("comms")) return { error: "Comms agent is paused." };
  const company = await getCompany(companyId);
  if (!company) return { error: "company not found" };
  const contact = await getContact(companyId);
  if (!contact) return { error: "No named contact yet — human gate required." };
  const evidence = await getEvidence(companyId);
  const score = await getScore(companyId);
  if (!score || score.verdict === "rejected") return { error: "Company is not qualified." };
  if (evidence.some((e) => e.field.startsWith("trigger_")) === false) {
    return { error: "No trigger evidence — cannot write a truthful reason to reach out." };
  }

  const fallback = buildEmail(company, contact, evidence);
  let subject = fallback.subject;
  let body = fallback.body;
  let claims = fallback.claims;
  let tokens = 0;
  let mode: "live" | "mock" = "mock";
  let note = "Deterministic writer (no LLM key or mock mode).";
  let llmError: string | null = null;

  if (llmEnabled() && opts.useLlm !== false) {
    // Revenue is a scoring input, not something the writer may quote.
    const writerEvidence = evidence.filter((e) => e.field !== "revenue");
    const evList = writerEvidence
      .map((e) => `- id=${e.id} | ${e.label}: ${e.value} | source: ${e.source_url} | quote: "${e.quote}"`)
      .join("\n");
    const res = await llmJson<{
      subject: string;
      body: string;
      claim_ids?: string[];
      claims?: { text: string; evidence_id: string }[];
    }>(
      [
        "You write one short cold email for Ledgerwise, a US bookkeeping firm for e-commerce brands.",
        "Hard rules: never mention price, fees, cost, money, revenue, dollar amounts or percentages. Every factual sentence must be traceable to the evidence list.",
        "Do not invent titles, numbers, events or channels. If you mention the contact's title or a hiring signal, include that exact sentence in claims.",
        "Max 110 words. One ask: a 15-minute call. Plain text.",
        'End with exactly:\nMaya Chen\nLedgerwise — monthly bookkeeping for e-commerce brands\nNot relevant? Reply "stop" and I won\'t follow up.',
        'Return JSON: {"subject": string, "body": string, "claims": [{"text": exact sentence from body, "evidence_id": one id from the list}]}. Every factual sentence in the body must appear in claims.',
      ].join("\n"),
      `Company: ${company.name} (${company.domain}), ${company.hq}, ${company.headcount} staff, channels: ${company.channels}.\nContact: ${contact.name}, ${contact.title}.\nQualification reasons: ${score.reasons
        .map((r) => `${r.label} (${r.claim})`)
        .join("; ")}.\nEvidence:\n${evList}\n\nWrite the first email.`,
    );
    tokens = res.tokens;
    mode = res.mode;
    if (res.error) llmError = res.error;
    if (res.data && res.data.body) {
      const ids = new Set(writerEvidence.map((e) => e.id));
      const provided: Claim[] = res.data.claims?.length
        ? res.data.claims
            .filter((c) => ids.has(c.evidence_id) && c.text?.trim())
            .map((c) => ({ text: c.text.trim(), evidence_id: c.evidence_id }))
        : (res.data.claim_ids ?? [])
            .filter((cid) => ids.has(cid))
            .map((cid) => {
              const sentence =
                res.data!.body
                  .split(/(?<=[.!?])\s+|\n+/)
                  .find((s) => /hiring|raised|series|wholesale|amazon|retail|market/i.test(s)) ??
                res.data!.body;
              return { text: sentence, evidence_id: cid };
            });
      const seen = new Set<string>();
      const llmClaims = [...provided, ...autoBindClaims(res.data.body, writerEvidence)].filter((claim) => {
        const key = `${claim.evidence_id}|${claim.text.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const probe = guardDraft({
        kind: "outreach",
        subject: res.data.subject,
        body: res.data.body,
        claims: llmClaims,
        evidenceIds: [...ids],
        suppressed: false,
      });
      if (probe.pass) {
        subject = res.data.subject.slice(0, 90);
        body = res.data.body;
        claims = llmClaims;
        note = `Live model (${res.mode}) draft passed guards.`;
      } else {
        const failed = probe.checks
          .filter((c) => !c.pass)
          .map((c) => `${c.label}: ${c.detail}`)
          .join(" | ");
        note = `Model draft failed guards (${failed.slice(0, 300)}); fell back to the deterministic writer.`;
      }
    } else if (llmError) {
      note = `Live model call failed (${llmError}); fell back to the deterministic writer.`;
    } else {
      note = "Model returned no usable draft; fell back to the deterministic writer.";
    }
  }

  const guard = guardDraft({
    kind: "outreach",
    subject,
    body,
    claims,
    evidenceIds: evidence.map((e) => e.id),
    suppressed: false,
  });

  const promptVersionId =
    opts.promptVersionId ??
    (
      await rows<any>(
        sql`select id from prompts where agent = 'comms' and block = 'write' and status = 'published' order by version desc limit 1`,
      )
    )[0]?.id ??
    null;

  const draftId = id("drf");
  await insertRows("drafts", [
    {
      id: draftId,
      company_id: companyId,
      contact_id: contact.id,
      subject,
      body,
      claims: JSON.stringify(claims),
      prompt_version_id: promptVersionId,
      status: "pending",
      guard: JSON.stringify(guard),
      created_at: now(),
      edited: 0,
    },
  ]);

  await logRun("write", companyId, `Drafted first email for ${company.name}`, [
    { at: now(), text: `Loaded ${evidence.length} evidence records`, tool: "evidence.query", ok: true },
    { at: now(), text: note, tool: llmEnabled() ? "llm.generate" : "writer.template", ok: true },
    {
      at: now(),
      text: guard.pass ? "Guard layer passed — queued for human review" : "Guard layer flagged issues — human must resolve",
      tool: "guards.check",
      ok: guard.pass,
    },
  ], tokens);

  const draft = (
    await rows<any>(sql`select * from drafts where id = ${draftId}`)
  )[0];
  return { draft: { ...draft, claims: safeParse(draft.claims, []), guard: safeParse(draft.guard, { pass: false, checks: [] }) } };
}

/* ---------------------------------------------------------------- send */

export async function sendDraft(
  draftId: string,
  actor: string,
): Promise<{ ok: boolean; guard: any; simulated: boolean; error?: string }> {
  if (await isPaused("outbound")) {
    return { ok: false, guard: null, simulated: true, error: "Outbound is paused in the admin console." };
  }
  const d = (
    await rows<any>(sql`select * from drafts where id = ${draftId}`)
  )[0];
  if (!d) return { ok: false, guard: null, simulated: true, error: "draft not found" };
  const company = await getCompany(d.company_id);
  const contact = await getContact(d.company_id);
  if (!company || !contact) return { ok: false, guard: null, simulated: true, error: "missing data" };

  const suppressed = (
    await rows<any>(
      sql`select id from suppressions where lower(email) = ${contact.email.toLowerCase()} or lower(domain) = ${company.domain.toLowerCase()} limit 1`,
    )
  ).length > 0;

  const guard = guardDraft({
    kind: "outreach",
    subject: d.subject,
    body: d.body,
    claims: safeParse<Claim[]>(d.claims, []),
    evidenceIds: (await getEvidence(d.company_id)).map((e) => e.id),
    suppressed,
  });
  if (!guard.pass) {
    await run(sql`update drafts set guard = ${JSON.stringify(guard)} where id = ${draftId}`);
    return { ok: false, guard, simulated: true, error: "Guards blocked this send." };
  }

  const canSend = Boolean(process.env.RESEND_API_KEY && process.env.DEMO_INBOX);
  let simulated = true;
  if (canSend) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "Ledgerwise Demo <onboarding@resend.dev>",
          to: [process.env.DEMO_INBOX],
          subject: d.subject,
          text: d.body,
        }),
      });
      simulated = !res.ok;
    } catch {
      simulated = true;
    }
  }

  await run(
    sql`update drafts set status = 'sent', sent_at = ${now()}, approved_by = ${actor}, guard = ${JSON.stringify(guard)} where id = ${draftId}`,
  );
  await run(sql`update companies set status = 'contacted' where id = ${d.company_id} and status = 'qualified'`);

  const existing = await rows<any>(sql`select id from threads where company_id = ${d.company_id}`);
  let threadId: string;
  if (existing.length) {
    threadId = existing[0].id;
  } else {
    threadId = id("thr");
    await insertRows("threads", [
      {
        id: threadId,
        company_id: d.company_id,
        contact_id: contact.id,
        state: "contacted",
        handoff_reason: null,
        assigned_to: null,
        summary: `First email sent to ${contact.name}.`,
        created_at: now(),
      },
    ]);
  }
  await insertRows("messages", [
    {
      id: id("msg"),
      thread_id: threadId,
      direction: "out",
      body: `Subject: ${d.subject}\n\n${d.body}`,
      classification: null,
      confidence: null,
      sent_by: simulated ? "agent:comms (simulated)" : "agent:comms",
      created_at: now(),
    },
  ]);
  await audit(actor, "draft.approve_send", "draft", draftId, "pending", "sent");
  return { ok: true, guard, simulated };
}

/* --------------------------------------------------------------- reply */

export type ReplyClass =
  | "opt_out"
  | "complaint"
  | "bot"
  | "price"
  | "booking"
  | "interested"
  | "objection"
  | "referral"
  | "other";

export function classify(text: string): { cls: ReplyClass; confidence: number; label: string } {
  const t = text.toLowerCase();
  const rules: [ReplyClass, RegExp, string][] = [
    ["opt_out", /unsubscribe|take me off|remove me|stop (emailing|contacting|sending)|not interested|do not contact|leave me alone|opt out/, "Opt-out request"],
    ["complaint", /lawyer|lawsuit|legal action|attorney|report(ing)? (you|this)|file a complaint|ftc/, "Complaint / legal"],
    ["bot", /are you (a |an )?(bot|robot|ai|human)|is this (a |an )?(bot|ai|robot)|are you real|human or (a )?bot/, "Asks if this is a bot"],
    ["price", /price|pricing|how much|cost|fees?|rates?|retainer|budget/, "Pricing question"],
    ["booking", /\b(monday|tuesday|wednesday|thursday|friday)\b|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|works for me|book (it|the call|a call)|calendar invite|send (me )?an invite/, "Ready to book"],
    ["interested", /interested|tell me more|sounds good|happy to (chat|talk)|let'?s talk|send (me )?(more )?(info|information|details)|open to it|worth a (chat|call)/, "Interested"],
    ["referral", /talk to|speak with|reach out to|my (colleague|partner|vp|controller|bookkeeper)/, "Referral"],
    ["objection", /already (have|work with)|in[- ]house|too expensive|no budget|not now|later|too busy|we use|don't need/, "Objection"],
  ];
  for (const [cls, re, label] of rules) {
    if (re.test(t)) {
      return { cls, confidence: cls === "other" ? 0.4 : 0.92, label };
    }
  }
  return { cls: "other", confidence: 0.4, label: "Unclear" };
}

const REPLY_CLASSES: ReplyClass[] = [
  "opt_out",
  "complaint",
  "bot",
  "price",
  "booking",
  "interested",
  "referral",
  "objection",
  "other",
];

/**
 * Deterministic hard rules first (opt-out and legal complaints are never delegated),
 * then the live model for intent. Falls back to the rule classifier on any error.
 */
export async function classifyAsync(
  text: string,
): Promise<{ cls: ReplyClass; confidence: number; label: string; source: "llm" | "rules" }> {
  const base = classify(text);
  if (base.cls === "opt_out" || base.cls === "complaint") return { ...base, source: "rules" };
  if (!llmEnabled()) return { ...base, source: "rules" };

  const res = await llmJson<{ class: string; confidence?: number; label?: string }>(
    [
      "Classify a prospect reply for a B2B outbound sales agent.",
      "Choose exactly one class: opt_out, complaint, bot, price, booking, interested, referral, objection, other.",
      "opt_out means they want no more contact. complaint means legal or angry escalation.",
      "booking means they named a day/time or asked for an invite. other means unclear.",
      'Return JSON: {"class": string, "confidence": number, "label": string}.',
    ].join("\n"),
    `Prospect message: """${text.slice(0, 1200)}"""`,
  );

  const cls = res.data?.class as ReplyClass | undefined;
  if (cls && REPLY_CLASSES.includes(cls)) {
    // The rule classifier is the guardrail: if it is confident and the model disagrees, keep the rule.
    if (base.cls !== "other" && cls !== base.cls) return { ...base, source: "rules" };
    return {
      cls,
      confidence: Math.max(0, Math.min(1, Number(res.data?.confidence ?? 0.7))),
      label: res.data?.label || base.label,
      source: "llm",
    };
  }
  return { ...base, source: "rules" };
}

export function freeSlots(count = 3, taken: string[] = []): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 1; i < 12 && out.length < count; i++) {
    const day = new Date(d.getTime() + i * 86400000);
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (const hour of [15, 19, 21]) {
      const slot = new Date(day);
      slot.setUTCHours(hour, 0, 0, 0);
      const iso = slot.toISOString();
      if (iso < new Date().toISOString()) continue;
      if (taken.includes(iso)) continue;
      out.push(iso);
      if (out.length >= count) break;
    }
  }
  return out;
}

async function takenSlots(): Promise<string[]> {
  const r = await rows<any>(
    sql`select slot_start from calls where status in ('booked','held')`,
  );
  return r.map((x) => x.slot_start);
}

const SIGN = "Maya Chen\nLedgerwise · monthly bookkeeping for e-commerce brands";

function templateReply(cls: ReplyClass, slots: string[], contactName: string): string {
  const first = contactName.split(" ")[0];
  const times = slots.map((s) => fmtSlot(s)).join(" or ");
  switch (cls) {
    case "bot":
      return `Hi ${first} — yes. I'm an AI assistant working with the Ledgerwise team. Every first email here is reviewed by a person before it goes out, and I can hand you to one right now if you'd rather talk to a human.\n\n${SIGN}`;
    case "price":
      return `Good question. Pricing depends on your channels, order volume and how messy the close is, so we only quote after a short call rather than guessing.\n\nI have ${times} open. Want me to hold one?\n\n${SIGN}`;
    case "interested":
      return `Glad to hear it. Two times that are actually open: ${times}.\n\nThe call is 15 minutes: what you sell, where the books hurt, and whether we're a fit. No deck.\n\n${SIGN}`;
    case "objection":
      return `Fair — most brands your size already have someone doing the books. The part that usually breaks first is marketplace payouts and sales tax, not the monthly close.\n\nIf it's not worth 15 minutes, say the word and I'll close the loop. Otherwise: ${times}.\n\n${SIGN}`;
    case "referral":
      return `Thanks — happy to be pointed the right way. Would you rather I reach out to them directly, or would an intro from you land better?\n\n${SIGN}`;
    default:
      return `Thanks for the reply. I'll keep this short: we do monthly bookkeeping for e-commerce brands, and the first step is a 15-minute call. ${times} are open.\n\n${SIGN}`;
  }
}

export async function respond(
  threadId: string,
  inboundText: string,
  actor = "agent:comms",
): Promise<{
  action: "suppressed" | "escalated" | "replied" | "booked" | "silent";
  cls: ReplyClass;
  label: string;
  reply?: string;
  call?: CallRow;
  reason?: string;
}> {
  const thread = await getThread(threadId);
  if (!thread) throw new Error("thread not found");
  if (await isPaused("comms")) {
    return { action: "escalated", cls: "other", label: "Comms paused", reason: "Agent is paused; inbound left for a human." };
  }
  const company = await getCompany(thread.company_id);
  const contact = await getContact(thread.company_id);
  if (!company || !contact) throw new Error("missing data");

  const c = await classifyAsync(inboundText);
  const classifyTool = c.source === "llm" ? "llm.classify" : "classify";
  await insertRows("messages", [
    {
      id: id("msg"),
      thread_id: threadId,
      direction: "in",
      body: inboundText,
      classification: c.cls,
      confidence: c.confidence,
      sent_by: "prospect",
      created_at: now(),
    },
  ]);

  // A human owns this thread: log and stay silent.
  if (thread.state === "human") {
    await logRun("reply", thread.company_id, `Inbound on ${company.name} (human owns thread)`, [
      { at: now(), text: `Classified as ${c.label} (${c.cls})`, tool: classifyTool, ok: true },
      { at: now(), text: "Agent stayed silent — thread assigned to a human", tool: "handoff", ok: true },
    ]);
    return { action: "silent", cls: c.cls, label: c.label };
  }

  if (c.cls === "opt_out") {
    await insertRows("suppressions", [
      { id: id("sup"), email: contact.email, domain: company.domain, reason: `Opt-out: "${inboundText.slice(0, 120)}"`, created_at: now() },
    ]);
    await run(sql`update threads set state = 'opted_out', summary = ${"Prospect opted out. No further contact."} where id = ${threadId}`);
    await run(sql`update companies set status = 'opted_out' where id = ${company.id}`);
    await run(sql`update drafts set status = 'rejected' where company_id = ${company.id} and status = 'pending'`);
    await audit(actor, "suppression.add", "contact", contact.id, "active", "suppressed");
    await logRun("reply", company.id, `Opt-out honored for ${company.name}`, [
      { at: now(), text: `Classified as opt-out: "${inboundText.slice(0, 80)}"`, tool: classifyTool, ok: true },
      { at: now(), text: "Wrote suppression row (email + domain). All future sends hard-blocked.", tool: "suppression.add", ok: true },
      { at: now(), text: "No reply sent. Terminal state.", tool: "guards.check", ok: true },
    ]);
    return { action: "suppressed", cls: c.cls, label: c.label, reason: "Suppressed permanently at the data layer." };
  }

  if (c.cls === "complaint") {
    await run(sql`update threads set state = 'needs_human', handoff_reason = ${"Complaint / legal language"} where id = ${threadId}`);
    await logRun("reply", company.id, `Escalated ${company.name}: complaint`, [
      { at: now(), text: `Classified as ${c.label}`, tool: classifyTool, ok: true },
      { at: now(), text: "No automated reply. Human gate opened.", tool: "gate.request", ok: false },
    ]);
    return { action: "escalated", cls: c.cls, label: c.label, reason: "Complaint / legal — never answered by the agent." };
  }

  const taken = await takenSlots();
  const slots = freeSlots(2, taken);

  if (c.cls === "booking") {
    const picked = pickSlot(inboundText, slots) ?? slots[0];
    if (!picked) {
      await run(sql`update threads set state = 'needs_human', handoff_reason = ${"No free slots"} where id = ${threadId}`);
      return { action: "escalated", cls: c.cls, label: c.label, reason: "No free slots — human needed." };
    }
    const call = await bookCall(threadId, picked, actor);
    const body = `Done — I've put us down for ${fmtSlot(picked)}. Calendar invite and a 3-line agenda are on the way.\n\nIf that stops working, reply here and I'll move it.\n\n${SIGN}`;
    await insertRows("messages", [
      { id: id("msg"), thread_id: threadId, direction: "out", body, classification: null, confidence: null, sent_by: actor, created_at: now() },
    ]);
    await run(sql`update threads set state = 'booked', summary = ${`Call booked for ${fmtSlot(picked)}`} where id = ${threadId}`);
    await logRun("book", company.id, `Booked call with ${company.name}`, [
      { at: now(), text: `Requested: "${inboundText.slice(0, 70)}"`, tool: "email.read", ok: true },
      { at: now(), text: `Matched free slot ${fmtSlot(picked)}`, tool: "calendar.freebusy", ok: true },
      { at: now(), text: "Event created, idempotency key = thread + slot", tool: "calendar.book", ok: true },
    ]);
    return { action: "booked", cls: c.cls, label: c.label, reply: body, call };
  }

  let reply = templateReply(c.cls, slots, contact.name);
  let replyTool = "writer.template";
  let replyNote = "Deterministic reply template.";

  const botQuestion =
    c.cls === "bot" ||
    (
      await rows<any>(
        sql`select id from messages where thread_id = ${threadId} and direction = 'in' and classification = 'bot' limit 1`,
      )
    ).length > 0;

  const llmClasses: ReplyClass[] = ["price", "bot", "interested", "objection", "referral"];
  if (llmEnabled() && llmClasses.includes(c.cls)) {
    const history = await rows<any>(
      sql`select direction, body from messages where thread_id = ${threadId} order by created_at desc limit 8`,
    );
    const transcript = history
      .slice()
      .reverse()
      .map(
        (m) =>
          `${m.direction === "in" ? "Prospect" : "Maya"}: ${String(m.body).replace(/\s+/g, " ").trim()}`,
      )
      .join("\n\n");

    const guidance: Record<string, string> = {
      price:
        "They asked about price. Acknowledge the question in one line, say the number depends on their channels, order volume and how messy the close is, and that you only quote after a short call. Do not give a number or a range.",
      bot:
        "They asked if you are a bot. Answer yes, plainly and without defensiveness. Say you are an AI assistant working with the Ledgerwise team, that a person reviews every first email, and that you can hand them to a human.",
      interested:
        "They are open. Offer two specific times from the open slots and say the call is 15 minutes. No deck, no pitch.",
      objection:
        "They already have someone or do not see the need. Agree without arguing. Name one thing that usually breaks for e-commerce brands (marketplace payouts and sales tax), then offer a clean exit: if it is not worth 15 minutes, they can say so and you will close the loop. Do not push twice.",
      referral:
        "They pointed you to a colleague. Ask whether they would rather make an intro or have you reach out directly. Three sentences maximum.",
    };

    const system = [
      "You are Maya Chen at Ledgerwise, a US bookkeeping firm for e-commerce brands.",
      "Write the next message in an ongoing sales conversation. It should read like a busy human typed it, not like marketing copy.",
      "Voice: direct, warm, specific. Short sentences. No corporate filler, no bullet points, no emojis, no 'I hope this finds you well'.",
      "Never mention price, fees, cost, rates or money. Never invent a fact about their company; only use what appears in the conversation.",
      guidance[c.cls] ?? "",
      `If you offer times, use only these open slots: ${slots.join("; ")}.`,
      "Under 110 words. Plain text. End with exactly:\nMaya Chen\nLedgerwise — monthly bookkeeping for e-commerce brands",
      'Return JSON: {"body": string}.',
    ]
      .filter(Boolean)
      .join("\n");

    const user = `Company: ${company.name}. Contact: ${contact.name}, ${contact.title}.
Conversation so far:
${transcript || "(no prior messages)"}

Their latest message: "${inboundText}"
Intent: ${c.label}
Write Maya's reply.`;

    const res = await llmJson<{ body: string }>(system, user);
    if (res.data?.body) {
      const probe = guardDraft({
        kind: "reply",
        body: res.data.body,
        claims: [],
        evidenceIds: [],
        suppressed: false,
        botQuestion,
      });
      if (probe.pass) {
        reply = res.data.body;
        replyTool = "llm.reply";
        replyNote = `Live reply (${res.mode}, ${res.tokens} tokens).`;
      } else {
        replyNote = "Model reply failed guards; fell back to template.";
      }
    } else {
      replyNote = res.error ? `Model unavailable (${res.error}); used template.` : "Model returned no reply; used template.";
    }
  }

  const guard = guardDraft({
    kind: "reply",
    body: reply,
    claims: [],
    evidenceIds: [],
    suppressed: false,
    botQuestion,
  });

  if (!guard.pass) {
    await run(sql`update threads set state = 'needs_human', handoff_reason = ${"Guard blocked automated reply"} where id = ${threadId}`);
    await logRun("reply", company.id, `Guard blocked reply to ${company.name}`, [
      { at: now(), text: `Draft reply failed: ${guard.checks.filter((x) => !x.pass).map((x) => x.label).join(", ")}`, tool: "guards.check", ok: false },
      { at: now(), text: "Escalated instead of sending", tool: "gate.request", ok: false },
    ]);
    return { action: "escalated", cls: c.cls, label: c.label, reason: "Guard blocked the reply." };
  }

  if (c.cls === "objection") {
    const prior = await rows<any>(
      sql`select id from messages where thread_id = ${threadId} and direction = 'out' and body like '%Fair — most brands%' limit 1`,
    );
    if (prior.length) {
      await run(sql`update threads set state = 'needs_human', handoff_reason = ${"Second objection"} where id = ${threadId}`);
      await logRun("reply", company.id, `Second objection from ${company.name}`, [
        { at: now(), text: "Same objection repeated — stopped arguing", tool: classifyTool, ok: true },
        { at: now(), text: "Handed to human", tool: "gate.request", ok: false },
      ]);
      return { action: "escalated", cls: c.cls, label: c.label, reason: "Second objection — human takes over." };
    }
  }

  if (c.cls === "other") {
    await run(sql`update threads set state = 'needs_human', handoff_reason = ${"Unclear intent"} where id = ${threadId}`);
    return { action: "escalated", cls: c.cls, label: c.label, reason: "Could not classify confidently." };
  }

  await insertRows("messages", [
    { id: id("msg"), thread_id: threadId, direction: "out", body: reply, classification: null, confidence: null, sent_by: actor, created_at: now() },
  ]);
  await run(sql`update threads set state = 'engaged', summary = ${`Agent replied: ${c.label}`} where id = ${threadId}`);
  await logRun("reply", company.id, `Replied to ${company.name} (${c.label})`, [
    { at: now(), text: `Classified: ${c.label} (${c.confidence})`, tool: classifyTool, ok: true },
    { at: now(), text: replyNote, tool: replyTool, ok: true },
    { at: now(), text: "Guards passed — no price, no unsourced claim, disclosure OK", tool: "guards.check", ok: true },
    { at: now(), text: "Reply sent", tool: "email.send", ok: true },
  ]);

  return { action: "replied", cls: c.cls, label: c.label, reply };
}

function pickSlot(text: string, slots: string[]): string | null {
  const t = text.toLowerCase();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const slot of slots) {
    const d = new Date(slot);
    const et = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      hour: "numeric",
      hour12: true,
    }).formatToParts(d);
    const weekday = et.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "";
    const hour = et.find((p) => p.type === "hour")?.value ?? "";
    if (t.includes(weekday.slice(0, 5)) && t.includes(hour)) return slot;
  }
  for (const slot of slots) {
    const d = new Date(slot);
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: true,
    }).format(d).toLowerCase().replace(/\s/g, "");
    if (t.replace(/\s/g, "").includes(hour)) return slot;
  }
  return days.some((d) => t.includes(d)) ? slots[0] : slots[0];
}

export async function bookCall(threadId: string, slotStart: string, actor: string): Promise<CallRow> {
  const thread = await getThread(threadId);
  if (!thread) throw new Error("thread not found");
  const taken = await takenSlots();
  if (taken.includes(slotStart)) throw new Error("slot already taken");
  const start = new Date(slotStart);
  const end = new Date(start.getTime() + 15 * 60000);
  const call: CallRow = {
    id: id("cal"),
    thread_id: threadId,
    company_id: thread.company_id,
    contact_id: thread.contact_id,
    slot_start: start.toISOString(),
    slot_end: end.toISOString(),
    status: "booked",
    timezone: "America/New_York",
    created_at: now(),
  };
  await insertRows("calls", [call as any]);
  await run(sql`update threads set state = 'booked' where id = ${threadId}`);
  await run(sql`update companies set status = 'booked' where id = ${thread.company_id}`);
  await audit(actor, "call.book", "call", call.id, "none", slotStart);
  return call;
}

/* ------------------------------------------------------------ research */

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeDomain(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(cleaned) ? cleaned : null;
}

async function tavily(query: string): Promise<{ title: string; url: string; content: string }[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: 5, search_depth: "basic" }),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json.results ?? []).map((r: any) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      content: String(r.content ?? ""),
    }));
  } catch {
    return [];
  }
}

const US_STATE_NAMES =
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming";
const US_STATE_ABBR =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY";

const FINANCE_ROLES =
  "Staff Accountant|Finance Manager|Financial Analyst|Controller|Bookkeeper|Head of Finance|VP of Finance|CFO|Chief Financial Officer|Operations Manager";

function around(text: string, index: number, radius = 90): string {
  return text
    .slice(Math.max(0, index - radius), Math.min(text.length, index + radius))
    .replace(/\s+/g, " ")
    .trim();
}

function findGeo(text: string): { value: string; quote: string } | null {
  const named = new RegExp(
    `\\b(?:based in|headquartered in|headquarters in|located in|our (?:office|hq|headquarters) (?:is )?in|address[:\\s]+)[^.]{0,100}?\\b(${US_STATE_NAMES})\\b`,
    "i",
  ).exec(text);
  if (named) {
    return {
      value: `United States (${named[1]})`,
      quote: around(text, named.index ?? 0, 120),
    };
  }
  const abbr = new RegExp(
    `\\b(?:based in|headquartered in|located in|address[:\\s]+)[^.]{0,80}?,\\s?(${US_STATE_ABBR})\\b`,
    "i",
  ).exec(text);
  if (abbr) {
    return {
      value: `United States (${abbr[1]})`,
      quote: around(text, abbr.index ?? 0, 120),
    };
  }
  const country = /\b(?:headquartered|based|located) in (?:the )?(?:United States|USA|U\.S\.A\.)\b/i.exec(text);
  if (country) return { value: "United States", quote: around(text, country.index ?? 0, 120) };
  return null;
}

function findHeadcount(text: string): { value: string; quote: string; number: number } | null {
  const range = /\b(\d{1,3})\s*[-–]\s*(\d{1,3})\s*(?:employees|people|staff|team members)\b/i.exec(text);
  if (range) {
    const n = Math.min(500, parseInt(range[2], 10));
    return { value: `${n} employees`, quote: around(text, range.index ?? 0), number: n };
  }
  const exact = /\b(\d{1,3})\+?\s*(?:employees|people|staff|team members)\b/i.exec(text);
  if (exact) {
    const n = Math.min(500, parseInt(exact[1], 10));
    return { value: `${n} employees`, quote: around(text, exact.index ?? 0), number: n };
  }
  return null;
}

function findRevenue(text: string): { value: string; quote: string } | null {
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!/\b(revenue|annual sales|net sales|arr)\b/i.test(sentence)) continue;
    if (
      /\b(raised|funding|valuation|series [a-d]|gmv|impressions|users|customers|events|orders|downloads|followers)\b/i.test(
        sentence,
      )
    ) {
      continue;
    }
    const match = /\$\s?([\d.]+)\s*(m|million|k|thousand|b|billion)\b/i.exec(sentence);
    if (!match) continue;
    const raw = match[2].toLowerCase();
    const unit = raw.startsWith("m") ? "M" : raw.startsWith("b") ? "B" : "K";
    return { value: `$${match[1]}${unit}`, quote: sentence.slice(0, 240).trim() };
  }
  return null;
}

function findPerson(text: string): { name: string; title: string } | null {
  const titleFirst = new RegExp(
    `\\b(${FINANCE_ROLES}|Founder|Co-?Founder|CEO|COO|Chief Operating Officer)\\b\\s*[:\\-–—|,]?\\s*([A-Z][a-z]+(?:\\s+[A-Z][a-z'-]+){1,2})`,
  ).exec(text);
  const nameFirst = new RegExp(
    `\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z'-]+){1,2})\\s*[:\\-–—|,]\\s*(${FINANCE_ROLES}|Founder|Co-?Founder|CEO|COO|Chief Operating Officer)\\b`,
  ).exec(text);
  const match = nameFirst ?? titleFirst;
  if (!match) return null;
  const name = nameFirst ? match[1] : match[2];
  const title = nameFirst ? match[2] : match[1];
  if (/^(Our|The|Your|We|Company|About|Contact|Privacy|Terms|Read)\b/i.test(name)) return null;
  return { name, title };
}

function findEmail(text: string, person?: { name: string } | null): string | null {
  const emails = (text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase());
  const clean = emails.filter((email) => {
    if (/^(noreply|no-reply|support|info|hello|sales|press|privacy|legal|careers|jobs|team|contact)@/i.test(email)) return false;
    const host = email.split("@")[1] ?? "";
    return !/(example|sentry|wixpress|shopify|domain)\./i.test(host);
  });
  if (person) {
    const first = person.name.split(" ")[0].toLowerCase();
    const personal = clean.find((email) => email.startsWith(first) || email.includes(`.${first}`));
    if (personal) return personal;
  }
  return clean[0] ?? null;
}

function findHiringRole(text: string): { value: string; quote: string } | null {
  const patterns = [
    new RegExp(`(?:hiring|open role|job opening|join our team|we.re looking for)[^.]{0,120}?(${FINANCE_ROLES})`, "i"),
    new RegExp(`(${FINANCE_ROLES})[^.]{0,80}?(?:hiring|open role|position|job)`, "i"),
  ];
  for (const re of patterns) {
    const match = re.exec(text);
    if (match) return { value: match[1], quote: around(text, match.index ?? 0) };
  }
  return null;
}

function findExpansion(text: string): { value: string; quote: string } | null {
  const match =
    /\b(sold on amazon|available on amazon|amazon store|amazon marketplace|wholesale partners?|wholesale accounts?|retail partners?|retail stores?|stockists?|expanding (?:into|to)|new (?:market|country))\b/i.exec(
      text,
    );
  return match ? { value: match[1], quote: around(text, match.index ?? 0) } : null;
}

function findFunding(text: string): { value: string; quote: string } | null {
  const match =
    /\b(?:raised|raises|secured|closed)\s+\$?[\d.,]+\s*(?:m|million|k|thousand|b|billion)\b[^.]{0,80}/i.exec(text) ??
    /\bseries [a-d]\s+(?:round|funding)\b[^.]{0,80}/i.exec(text);
  return match ? { value: match[0].trim().slice(0, 90), quote: around(text, match.index ?? 0) } : null;
}

function findSiteName(html: string, domain: string): string {
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const raw = htmlToText(og ?? title ?? "").split(/\s+[|–—]\s+/)[0].trim();
  if (!raw || /^(home|shop|store|welcome|official site)$/i.test(raw)) return titleCase(domain);
  return raw.slice(0, 80);
}

export async function researchDomain(
  input: string,
  opts: {
    deep?: boolean;
    snippets?: SearchHit[];
    storefront?: { productCount: number; strongShop: boolean };
  } = {},
): Promise<{ companyId?: string; error?: string }> {
  if (await isPaused("research")) return { error: "Research agent is paused." };
  const domain = normalizeDomain(input);
  if (!domain) return { error: "That doesn't look like a domain." };

  const existing = await rows<any>(sql`select id from companies where lower(domain) = ${domain}`);
  if (existing.length) return { companyId: existing[0].id };

  const name = titleCase(domain);
  const companyId = id("cmp");
  await insertRows("companies", [
    {
      id: companyId,
      name,
      domain,
      hq: "Unknown",
      revenue_band: "Unknown",
      revenue_note: "No estimate yet",
      headcount: 0,
      channels: "",
      status: "researching",
      created_at: now(),
    },
  ]);

  const steps: RunRow["steps"] = [];
  const evidence: Evidence[] = [];
  const page = await fetchText(`https://${domain}`);
  steps.push({
    at: now(),
    text: page ? `Fetched homepage (${page.length.toLocaleString()} bytes)` : "Homepage fetch failed",
    tool: "web.fetch",
    ok: Boolean(page),
  });

  let productCount = 0;
  const products = await fetchText(`https://${domain}/products.json`);
  if (products) {
    try {
      const json = JSON.parse(products);
      productCount = Array.isArray(json.products) ? json.products.length : 0;
    } catch {
      productCount = 0;
    }
  }
  steps.push({
    at: now(),
    text:
      productCount > 0
        ? `Shopify storefront detected via /products.json (${productCount} products)`
        : "No Shopify products.json found",
    tool: "storefront.detect",
    ok: productCount > 0,
  });

  const retrieved = now();
  if (productCount > 0) {
    evidence.push({
      id: id("ev"),
      company_id: companyId,
      field: "ecommerce",
      label: "Sells online",
      value: "Shopify storefront",
      source_url: `https://${domain}/products.json`,
      source_type: "storefront",
      quote: `products.json returned ${productCount} products`,
      retrieved_at: retrieved,
      confidence: 0.99,
      status: "verified",
    } as Evidence);
    if (productCount > 40) {
      evidence.push({
        id: id("ev"),
        company_id: companyId,
        field: "complexity",
        label: "Catalog size",
        value: `${productCount} products`,
        source_url: `https://${domain}/products.json`,
        source_type: "storefront",
        quote: `Catalog of ${productCount} products suggests marketplace/wholesale mix`,
        retrieved_at: retrieved,
        confidence: 0.6,
        status: "estimated",
      } as Evidence);
    }
  }

  const results = await tavily(
    `"${domain}" (raised OR funding OR "series a" OR hiring OR wholesale OR "new store" OR amazon)`,
  );
  steps.push({
    at: now(),
    text: process.env.TAVILY_API_KEY
      ? `Searched the web: ${results.length} results`
      : "No TAVILY_API_KEY — skipped trigger search (this is why the lead needs a human)",
    tool: "web.search",
    ok: results.length > 0,
  });

  const seen = new Set<string>();
  for (const r of results) {
    const blob = `${r.title} ${r.content}`;
    let field = "";
    let value = "";
    if (/raised|funding|series [a-d]|seed round/i.test(blob)) {
      field = "trigger_funding";
      value = "recent funding round";
    } else if (/wholesale|new (market|country|store)|amazon|expands?/i.test(blob)) {
      field = "trigger_expansion";
      value = "channel expansion";
    } else if (/hiring|career|job|accountant|finance manager/i.test(blob)) {
      field = "trigger_hiring";
      value = "open finance role";
    }
    if (field && !seen.has(field)) {
      seen.add(field);
      evidence.push({
        id: id("ev"),
        company_id: companyId,
        field,
        label: field.replace("trigger_", "Signal: "),
        value,
        source_url: r.url,
        source_type: "web",
        quote: r.content.slice(0, 240),
        retrieved_at: retrieved,
        confidence: 0.7,
        status: "verified",
      } as Evidence);
    }
  }

  const pages: { url: string; text: string }[] = [];
  if (page) pages.push({ url: `https://${domain}`, text: htmlToText(page) });
  if (opts.deep) {
    const paths = [
      "/pages/about",
      "/pages/about-us",
      "/pages/our-story",
      "/pages/careers",
      "/pages/contact",
      "/contact",
    ];
    const fetched = await Promise.all(
      paths.map(async (path) => {
        const html = await fetchText(`https://${domain}${path}`, 8000);
        return html ? { url: `https://${domain}${path}`, text: htmlToText(html) } : null;
      }),
    );
    for (const item of fetched) if (item) pages.push(item);
  }
  const allText = pages.map((p) => p.text).join("\n").slice(0, 300_000);

  if (page) {
    const betterName = findSiteName(page, domain);
    if (betterName && betterName.length > 1) {
      await run(sql`update companies set name = ${betterName} where id = ${companyId}`);
    }
  }

  const addEvidence = (item: Evidence) => {
    if (!evidence.some((e) => e.field === item.field)) evidence.push(item);
  };

  if (opts.storefront) {
    addEvidence({
      id: id("ev"),
      company_id: companyId,
      field: "ecommerce",
      label: "Sells online",
      value: opts.storefront.productCount > 0 ? "Shopify storefront" : "Online storefront",
      source_url: `https://${domain}`,
      source_type: "web",
      quote:
        opts.storefront.productCount > 0
          ? `products.json returned ${opts.storefront.productCount} products during the crawl`
          : "Homepage contains add-to-cart / shopping UI during the crawl",
      retrieved_at: retrieved,
      confidence: 0.6,
      status: "estimated",
    } as Evidence);
  }

  for (const p of pages) {
    const geo = findGeo(p.text);
    if (geo) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "geo",
        label: "US location",
        value: geo.value,
        source_url: p.url,
        source_type: "web",
        quote: geo.quote,
        retrieved_at: retrieved,
        confidence: 0.7,
        status: "estimated",
      } as Evidence);
      await run(sql`update companies set hq = ${geo.value} where id = ${companyId}`);
      break;
    }
  }

  for (const p of pages) {
    const hc = findHeadcount(p.text);
    if (hc) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "headcount",
        label: "Headcount",
        value: hc.value,
        source_url: p.url,
        source_type: "web",
        quote: hc.quote,
        retrieved_at: retrieved,
        confidence: 0.6,
        status: "estimated",
      } as Evidence);
      await run(sql`update companies set headcount = ${hc.number} where id = ${companyId}`);
      break;
    }
  }

  for (const p of pages) {
    const rev = findRevenue(p.text);
    if (rev) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "revenue",
        label: "Revenue",
        value: rev.value,
        source_url: p.url,
        source_type: "web",
        quote: rev.quote,
        retrieved_at: retrieved,
        confidence: 0.55,
        status: "estimated",
      } as Evidence);
      await run(
        sql`update companies set revenue_band = ${rev.value}, revenue_note = ${"Estimated from public web text"} where id = ${companyId}`,
      );
      break;
    }
  }

  for (const p of pages) {
    const hire = findHiringRole(p.text);
    if (hire) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_hiring",
        label: "Signal: hiring",
        value: hire.value,
        source_url: p.url,
        source_type: "web",
        quote: hire.quote,
        retrieved_at: retrieved,
        confidence: 0.75,
        status: "verified",
      } as Evidence);
    }
    const expansion = findExpansion(p.text);
    if (expansion) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_expansion",
        label: "Signal: expansion",
        value: "channel expansion",
        source_url: p.url,
        source_type: "web",
        quote: expansion.quote,
        retrieved_at: retrieved,
        confidence: 0.65,
        status: "estimated",
      } as Evidence);
    }
    const funding = findFunding(p.text);
    if (funding) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_funding",
        label: "Signal: funding",
        value: funding.value,
        source_url: p.url,
        source_type: "web",
        quote: funding.quote,
        retrieved_at: retrieved,
        confidence: 0.7,
        status: "verified",
      } as Evidence);
    }
  }

  for (const snippet of opts.snippets ?? []) {
    const blob = `${snippet.title} ${snippet.snippet}`;
    const hire = findHiringRole(blob);
    if (hire) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_hiring",
        label: "Signal: hiring",
        value: hire.value,
        source_url: snippet.url,
        source_type: "web",
        quote: snippet.snippet,
        retrieved_at: retrieved,
        confidence: 0.6,
        status: "verified",
      } as Evidence);
    }
    const expansion = findExpansion(blob);
    if (expansion) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_expansion",
        label: "Signal: expansion",
        value: "channel expansion",
        source_url: snippet.url,
        source_type: "web",
        quote: snippet.snippet,
        retrieved_at: retrieved,
        confidence: 0.55,
        status: "estimated",
      } as Evidence);
    }
    const funding = findFunding(blob);
    if (funding) {
      addEvidence({
        id: id("ev"),
        company_id: companyId,
        field: "trigger_funding",
        label: "Signal: funding",
        value: funding.value,
        source_url: snippet.url,
        source_type: "web",
        quote: snippet.snippet,
        retrieved_at: retrieved,
        confidence: 0.6,
        status: "verified",
      } as Evidence);
    }
  }

  for (const p of pages) {
    const person = findPerson(p.text);
    const email = findEmail(p.text, person);
    if (!person || !email) continue;
    const existingContact = evidence.find((e) => e.field === "contact_role");
    const evId = existingContact?.id ?? id("ev");
    const roleClass = /founder|ceo|owner/i.test(person.title)
      ? "Founder"
      : /coo|operat/i.test(person.title)
        ? "COO"
        : "Finance";
    if (!existingContact) {
      addEvidence({
        id: evId,
        company_id: companyId,
        field: "contact_role",
        label: "Decision-maker",
        value: person.title,
        source_url: p.url,
        source_type: "web",
        quote: `${person.name}, ${person.title}`,
        retrieved_at: retrieved,
        confidence: 0.8,
        status: "verified",
      } as Evidence);
    }
    await insertRows("contacts", [
      {
        id: id("con"),
        company_id: companyId,
        name: person.name,
        title: person.title,
        role_class: roleClass,
        email,
        evidence_id: evId,
      },
    ]);
    steps.push({ at: now(), text: `Found ${person.name}, ${person.title} <${email}>`, tool: "contact.find", ok: true });
    break;
  }

  const channels = [
    productCount > 0 ? "Shopify" : null,
    /amazon/i.test(allText) ? "Amazon" : null,
    /wholesale/i.test(allText) ? "Wholesale" : null,
    /retail/i.test(allText) ? "Retail" : null,
  ].filter(Boolean);
  if (channels.length) {
    await run(sql`update companies set channels = ${channels.join(", ")} where id = ${companyId}`);
  }

  if (pages.length) {
    steps.push({
      at: now(),
      text: `Crawled ${pages.length} page${pages.length === 1 ? "" : "s"} (home, about, careers, contact)`,
      tool: "web.crawl",
      ok: true,
    });
  }
  const signalCount = evidence.filter((e) => e.field.startsWith("trigger_")).length;
  if (signalCount) {
    steps.push({
      at: now(),
      text: `${signalCount} timing signal${signalCount === 1 ? "" : "s"} found`,
      tool: "evidence.extract",
      ok: true,
    });
  }

  if (evidence.length) await insertRows("evidence", evidence as any[]);

  await logRun("research", companyId, `Researched ${name}`, steps);
  const score = await qualifyCompany(companyId);

  await logRun(
    "qualify",
    companyId,
    `Qualified ${name}: ${score.total}/100`,
    [
      {
        at: now(),
        text: score.reasons.length
          ? `${score.reasons.length} sourced reasons found`
          : "No scored reasons — not enough public evidence",
        tool: "rubric.score",
        ok: score.reasons.length > 0,
      },
      {
        at: now(),
        text: score.missing.length ? `Missing: ${score.missing.join(", ")}` : "No gaps",
        tool: "gate.request",
        ok: score.missing.length === 0,
      },
    ],
  );

  return { companyId };
}

export interface FoundCompany {
  companyId: string;
  name: string;
  domain: string;
  status: string;
  score?: number;
}

async function foundCompany(companyId: string): Promise<FoundCompany | null> {
  const company = await getCompany(companyId);
  if (!company) return null;
  const score = await getScore(companyId);
  return {
    companyId,
    name: company.name,
    domain: company.domain,
    status: company.status,
    score: score?.total,
  };
}

const FALLBACK_LISTS = [
  "https://www.wisepops.com/blog/best-shopify-stores",
  "https://www.thegenielab.com/blogs/articles/24-best-shopify-stores-2025-secrets-to-ecommerce-success",
  "https://www.ecommerceparadise.com/blog/best-shopify-stores",
];

const FALLBACK_BRANDS = [
  "taylorstitch.com",
  "hiutdenim.co.uk",
  "madeincookware.com",
  "ridge.com",
  "beardbrand.com",
  "sokoglam.com",
  "deathwishcoffee.com",
  "allbirds.com",
  "tentree.com",
  "bombas.com",
];

function focusKeywords(text: string): string {
  const stop = new Set([
    "with", "from", "that", "this", "have", "their", "about", "into", "over", "your", "they",
    "them", "will", "more", "than", "when", "what", "where", "which", "while", "looking",
    "companies", "company", "brands", "brand", "roughly", "prefer", "strong", "signals",
  ]);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !stop.has(word))
    .slice(0, 10)
    .join(" ");
}

/**
 * Real web search + crawl. The agent turns the brief into search queries,
 * pulls candidate domains out of results and listicles, checks for a live
 * storefront, then hands each candidate to the deep research crawler.
 */
export async function findCompanies(
  query: string,
  brief = "",
): Promise<{
  results: FoundCompany[];
  message?: string;
  error?: string;
  source: string;
  provider?: string;
}> {
  const q = query.trim();
  if (!q) return { results: [], error: "Describe the companies you want, or paste a domain.", source: "web" };
  if (await isPaused("research")) {
    return { results: [], error: "Research agent is paused.", source: "web" };
  }

  const direct = normalizeDomain(q);
  if (direct) {
    const res = await researchDomain(direct, { deep: true });
    if (res.error || !res.companyId) {
      return { results: [], error: res.error ?? "Research failed.", source: "domain" };
    }
    const result = await foundCompany(res.companyId);
    return { results: result ? [result] : [], source: "domain" };
  }

  const base = (brief.trim() || q).replace(/\s+/g, " ").trim();
  const short = q.split(/\s+/).length <= 4 && !/[.!?]/.test(q);
  const focus = focusKeywords(base).split(" ").slice(0, 4).join(" ") || "shopify ecommerce";
  const queries = short
    ? [`${q} shopify brand`, `${q} ecommerce careers finance`]
    : [
        `${focus} best shopify brands list`,
        `${focus} DTC brands amazon wholesale`,
        `${focus} ecommerce careers finance`,
      ];

  const hits: SearchHit[] = [];
  const providers = new Set<string>();
  for (const searchQuery of queries.slice(0, 2)) {
    const res = await searchWeb(searchQuery, 8);
    if (res.provider && res.provider !== "none") providers.add(res.provider);
    hits.push(...res.hits);
  }

  const articleHint = (hit: SearchHit) =>
    /list|best|top|stores|brands|dtc|guide|playbook|resources|directory|blog|article/i.test(
      `${hit.title} ${hit.url} ${hit.snippet}`,
    ) ||
    /(thegenielab|sellercenter|trendtrack|fastbundle|synarionit|the4|founderjar|brandsearch|solomediagroup|identixweb|bebolddigital|maggrowth|byteout|admetrics|jarvio)\./i.test(
      hit.domain,
    );

  const candidates = new Set<string>();
  for (const hit of hits) {
    if (articleHint(hit)) continue;
    if (isBrandHost(hit.domain)) candidates.add(hit.domain);
  }

  const articles = hits.filter(articleHint).slice(0, 3);
  for (const article of articles) {
    const html = await fetchText(article.url, 8000);
    if (!html) continue;
    for (const host of extractBrandHosts(html, article.url, 30)) candidates.add(host);
  }

  // If search is thin or blocked, crawl a few public DTC brand directories.
  if (candidates.size < 6) {
    for (const listUrl of FALLBACK_LISTS) {
      const html = await fetchText(listUrl, 8000);
      if (!html) continue;
      for (const host of extractBrandHosts(html, listUrl, 30)) candidates.add(host);
      if (candidates.size >= 12) break;
    }
  }

  const inspectDomains = async (domains: string[]) => {
    const inspected = await Promise.all(
      domains.map(async (domain) => {
        const [home, products] = await Promise.all([
          fetchText(`https://${domain}`, 12000),
          fetchText(`https://${domain}/products.json`, 12000),
        ]);
        if (!home && !products) return null;
        let productCount = 0;
        if (products) {
          try {
            const json = JSON.parse(products);
            productCount = Array.isArray(json.products) ? json.products.length : 0;
          } catch {
            productCount = 0;
          }
        }
        const text = home ? htmlToText(home).slice(0, 12_000) : "";
        const strongShop = /add to cart|shop now|view cart|checkout|free shipping|shop all|our products/i.test(text);
        const saas =
          /saas|analytics platform|software platform|agency|consulting|directory|playbook|resources|bookkeeping|data platform/i.test(
            text,
          );
        const ecommerce = productCount > 0 || (strongShop && !saas);
        if (!ecommerce) return null;
        return { domain, productCount, strongShop };
      }),
    );
    return inspected
      .filter((item): item is { domain: string; productCount: number; strongShop: boolean } => Boolean(item))
      .sort((a, b) => b.productCount - a.productCount || Number(b.strongShop) - Number(a.strongShop));
  };

  const pool = [...candidates].slice(0, 10);
  let live = (await inspectDomains(pool)).slice(0, 4);
  if (live.length < 3) {
    const extra = FALLBACK_BRANDS.filter((domain) => !pool.includes(domain)).slice(0, 6);
    const more = await inspectDomains(extra);
    const combined = [...live, ...more].filter(
      (item, index, all) => all.findIndex((candidate) => candidate.domain === item.domain) === index,
    );
    live = combined
      .sort((a, b) => b.productCount - a.productCount || Number(b.strongShop) - Number(a.strongShop))
      .slice(0, 4);
  }

  if (!live.length) {
    if (short) {
      const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const guesses = [`${slug}.com`, `${slug}.co`, `${slug}.shop`];
      const checks = await Promise.all(
        guesses.map(async (domain) => ({
          domain,
          live: Boolean(await fetchText(`https://${domain}`, 5000)),
        })),
      );
      const alive = checks.filter((c) => c.live).map((c) => c.domain).slice(0, 2);
      if (alive.length) {
        const results: FoundCompany[] = [];
        for (const domain of alive) {
          const res = await researchDomain(domain, { deep: true });
          if (!res.companyId) continue;
          const result = await foundCompany(res.companyId);
          if (result) results.push(result);
        }
        return {
          results,
          message: `Searched the web, then tried ${alive.length} likely domain${alive.length === 1 ? "" : "s"}.`,
          source: "heuristic",
          provider: [...providers].join(" → "),
        };
      }
    }
    return {
      results: [],
      message: `The search ran (${[...providers].join(" → ") || "no provider"}), but no live storefronts matched. Try a more specific description, add TAVILY_API_KEY, or paste a domain.`,
      source: "web",
      provider: [...providers].join(" → "),
    };
  }

  const researched = await Promise.all(
    live.map(async (item) => {
      const snippets = hits.filter((hit) => hit.domain === item.domain).slice(0, 3);
      const res = await researchDomain(item.domain, { deep: true, snippets, storefront: item });
      if (!res.companyId) return null;
      return foundCompany(res.companyId);
    }),
  );
  const results = researched.filter((item): item is FoundCompany => Boolean(item));

  return {
    results,
    message: `Searched ${Math.min(2, queries.length)} queries, crawled ${live.length} live storefront${live.length === 1 ? "" : "s"} (${[...providers].join(" → ")}).`,
    source: "web",
    provider: [...providers].join(" → "),
  };
}

export async function addContact(
  companyId: string,
  input: { name: string; title: string; email: string },
  actor: string,
): Promise<void> {
  const company = await getCompany(companyId);
  if (!company) throw new Error("company not found");
  const evId = id("ev");
  await insertRows("evidence", [
    {
      id: evId,
      company_id: companyId,
      field: "contact_role",
      label: "Decision-maker",
      value: input.title,
      source_url: `https://${company.domain}`,
      source_type: "human",
      quote: `Added by ${actor} during manual review: ${input.name}, ${input.title}`,
      retrieved_at: now(),
      confidence: 0.9,
      status: "verified",
    },
  ]);
  await insertRows("contacts", [
    {
      id: id("con"),
      company_id: companyId,
      name: input.name,
      title: input.title,
      role_class: /founder|ceo|owner/i.test(input.title)
        ? "Founder"
        : /coo|operat/i.test(input.title)
          ? "COO"
          : "Finance",
      email: input.email,
      evidence_id: evId,
    },
  ]);
  await audit(actor, "contact.add", "company", companyId, "none", `${input.name} <${input.email}>`);
  await qualifyCompany(companyId, actor);
}

export async function takeOver(threadId: string, on: boolean, actor: string): Promise<void> {
  const thread = await getThread(threadId);
  if (!thread) return;
  if (on) {
    await run(sql`update threads set state = 'human', assigned_to = ${actor} where id = ${threadId}`);
    await audit(actor, "thread.takeover", "thread", threadId, thread.state, "human");
  } else {
    await run(sql`update threads set state = 'engaged', assigned_to = null where id = ${threadId}`);
    await audit(actor, "thread.handback", "thread", threadId, thread.state, "engaged");
  }
}

export async function humanReply(threadId: string, body: string, actor: string): Promise<void> {
  await insertRows("messages", [
    { id: id("msg"), thread_id: threadId, direction: "out", body, classification: null, confidence: null, sent_by: actor, created_at: now() },
  ]);
  await run(sql`update threads set state = 'human', assigned_to = ${actor} where id = ${threadId}`);
}

export async function pauseAgent(key: string, paused: boolean, actor: string): Promise<void> {
  const settingKey = `paused:${key}`;
  await run(
    sql`insert into settings (key, value) values (${settingKey}, ${paused ? "1" : "0"}) on conflict (key) do update set value = ${paused ? "1" : "0"}`,
  );
  await audit(actor, paused ? "agent.pause" : "agent.resume", "agent", key, String(!paused), String(paused));
}

export async function isPaused(key: string): Promise<boolean> {
  const r = await rows<any>(sql`select value from settings where key = ${`paused:${key}`}`);
  return r[0]?.value === "1";
}

export function reasonEvidenceIds(reasons: Reason[]): string[] {
  return [...new Set(reasons.map((r) => r.evidence_id))];
}
