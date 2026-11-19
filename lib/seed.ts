import { insertRows } from "./db/sql";
import { SEED_COMPANIES } from "./fixtures";
import { draftEmail, logRun, qualifyCompany } from "./agents";
import { sql } from "drizzle-orm";
import { rows, run } from "./db";

const iso = (d: Date) => d.toISOString();
const now = () => iso(new Date());
const minsAgo = (m: number) => iso(new Date(Date.now() - m * 60000));

function country(hq: string): string {
  return /canada|,\s*(NS|BC|ON|QC|AB|MB|SK|NB|NL|PE)\b/i.test(hq) ? "Canada" : "United States";
}

function nextDow(dow: number, hourUTC: number): string {
  const d = new Date();
  d.setUTCHours(hourUTC, 0, 0, 0);
  for (let i = 1; i <= 10; i++) {
    const c = new Date(d.getTime() + i * 86400000);
    if (c.getUTCDay() === dow) return c.toISOString();
  }
  return d.toISOString();
}

const PROMPTS = [
  {
    id: "prm_research_v1",
    agent: "research",
    block: "identity",
    body: `You are the research analyst for Ledgerwise, a US bookkeeping firm that serves e-commerce brands.\n\nYou find companies, not contacts lists. Every fact you return must include a source URL, an exact quote from that page, and a retrieval timestamp. If you cannot source it, you return nothing for that field.\n\nYou never estimate silently: an estimate is stored with status = estimated and the method in the quote.`,
  },
  {
    id: "prm_research_task_v1",
    agent: "research",
    block: "task",
    body: `Find US e-commerce brands with $1M–$10M yearly revenue and 5–50 employees. The buyer is the founder, COO, or whoever owns finance.\n\nFor each company collect:\n1. Storefront platform and channels (Shopify, Amazon, own site, wholesale, retail)\n2. Revenue band estimate + the inputs used\n3. Headcount estimate + source\n4. One fresh trigger: a finance/accounting/ops hire (≤90 days), a funding round (≤12 months), or expansion into a new channel or country (≤6 months)\n5. A named decision-maker with a role title\n\nStop when 30 companies pass the ICP with a named contact. Reject duplicates and anything you cannot source. If a company is outside the US, outside the revenue band, or outside the headcount band, drop it — do not soften the rule.`,
  },
  {
    id: "prm_qual_task_v1",
    agent: "qualifier",
    block: "task",
    body: `Score the company against Ledgerwise's rubric and show your work.\n\nFit (60): revenue band 20, headcount 10, US 10, sells online 10, multi-channel complexity 10.\nIntent (40): finance/ops hire 15, recent raise 15, channel expansion 10.\n\nRules:\n- You may only cite evidence ids that were provided. You cannot add facts from world knowledge.\n- Every reason must include the evidence id, source URL, and quote.\n- No evidence, no points. Unknown is not zero-with-a-guess; it is a missing field that goes to a human.\n- If two sources conflict, mark the field conflicting, drop the points, and escalate.\n\nVerdict: 65+ qualified, 45–64 needs human review, below 45 rejected. A missing contact or missing trigger always routes to a human.`,
  },
  {
    id: "prm_write_v1",
    agent: "comms",
    block: "write",
    body: `Write one short first email for a qualified company.\n\nShape: one sourced fact about them, one reason to reach out now, one sentence on the relevant outcome, one ask (15 minutes). Under 110 words. Plain text.\n\nHard rules:\n- Never mention price, cost, fees, rates or money. Pricing is discussed on a call.\n- Every factual sentence must map to a provided evidence id.\n- No fake familiarity, no invented mutual connections, no "I loved your podcast" unless sourced.\n- Sign as Maya Chen, Ledgerwise. Include the opt-out line.\n\nReturn JSON: { "subject", "body", "claim_ids": [...] }.`,
  },
  {
    id: "prm_write_v2",
    agent: "comms",
    block: "write",
    body: `Write one short first email for a qualified company.\n\nShape: one sourced fact about them, one reason to reach out now, one sentence on the relevant outcome, one ask (15 minutes). Under 90 words. Plain text, no exclamation marks.\n\nHard rules:\n- Never mention price, cost, fees, rates or money. Pricing is discussed on a call.\n- Every factual sentence must map to a provided evidence id.\n- No fake familiarity and no invented details.\n- Sign as Maya Chen, Ledgerwise. Include the opt-out line.\n\nReturn JSON: { "subject", "body", "claim_ids": [...] }.`,
  },
  {
    id: "prm_reply_v1",
    agent: "comms",
    block: "reply",
    body: `Answer the prospect using only the thread and the evidence provided.\n\n- Questions: answer directly and briefly.\n- Pricing: never give a number or a range. Say pricing depends on scope and is covered on the call, then offer real slots.\n- "Are you a bot?": say yes plainly. You are an AI assistant working with the Ledgerwise team, and a human reviews outreach.\n- Objections: acknowledge once, reframe once with sourced facts, then offer an exit. Never argue twice.\n- Stop / unsubscribe / not interested: no reply. The system suppresses the contact permanently.\n- Complaints, legal, press, refunds, data requests: no reply. Escalate to a human immediately.\n- Anything ambiguous or outside policy: escalate instead of guessing.`,
  },
  {
    id: "prm_booking_v1",
    agent: "comms",
    block: "booking",
    body: `Offer real availability only.\n\n- Read free/busy from the connected Ledgerwise calendar, next 10 business days.\n- Offer 2–3 slots in the prospect's timezone, business hours only.\n- Hold the slot for 30 minutes and say when the hold expires.\n- On confirmation, create the event with the company, contact, thread link and a 3-line agenda.\n- If the slot was taken in the meantime, apologise and offer two new times. Never double-book.\n- No booking without a confirmed Ledgerwise attendee.`,
  },
  {
    id: "prm_style_v1",
    agent: "comms",
    block: "style",
    body: `Voice: direct, warm, low-status. Short sentences. No buzzwords ("synergy", "streamline", "unlock"), no exclamation marks, no emoji, no bold, no bullet lists in a first email.\n\nReading level: a busy founder on a phone. One idea per paragraph. If a sentence needs a comma splice to survive, cut it.\n\nBanned phrases: "I hope this finds you well", "quick question", "circling back", "just following up", "touch base".`,
  },
];

export async function seedDemo(): Promise<void> {
  const started = now();

  await insertRows("users", [
    { id: "u_sales", name: "Maya Chen", email: "maya@ledgerwise.demo", role: "sales" },
    { id: "u_admin", name: "Sam Okafor", email: "sam@unscale.demo", role: "admin" },
  ]);

  await insertRows("prompts", [
    ...PROMPTS.map((p) => ({
      id: p.id,
      agent: p.agent,
      block: p.block,
      version: p.id.endsWith("v2") ? 2 : 1,
      body: p.body,
      status: p.id.endsWith("v2") ? "draft" : "published",
      parent_id: p.id.endsWith("v2") ? p.id.replace("v2", "v1") : null,
      published_at: p.id.endsWith("v2") ? null : started,
      published_by: p.id.endsWith("v2") ? null : "Sam Okafor",
      scorecard: null,
    })),
  ]);

  const companies = SEED_COMPANIES.map((c, i) => ({
    id: `cmp_${String(i + 1).padStart(2, "0")}`,
    name: c.n,
    domain: c.d,
    hq: c.hq,
    revenue_band: c.rev,
    revenue_note: c.revNote,
    headcount: c.hc,
    channels: c.ch.join(", "),
    status: "researching",
    created_at: minsAgo(240 - i * 4),
  }));
  await insertRows("companies", companies);

  const evidence: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];

  SEED_COMPANIES.forEach((c, i) => {
    const cid = companies[i].id;
    const slug = c.n.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const retrieved = minsAgo(200 - i * 3);
    const ev = (
      field: string,
      label: string,
      value: string,
      source_url: string,
      source_type: string,
      quote: string,
      confidence: number,
      status: string,
    ) =>
      evidence.push({
        id: `ev_${i}_${field}`,
        company_id: cid,
        field,
        label,
        value,
        source_url,
        source_type,
        quote,
        retrieved_at: retrieved,
        confidence,
        status,
      });

    ev("revenue", "Revenue (estimated)", c.rev, `https://${c.d}/pages/about`, "estimate", `Estimate inputs: ${c.revNote}`, 0.61, "estimated");
    ev("headcount", "Headcount (estimated)", String(c.hc), `https://www.linkedin.com/company/${slug}`, "social", `Company page lists about ${c.hc} employees`, 0.66, "estimated");
    ev("geo", "HQ country", country(c.hq), `https://${c.d}/pages/contact`, "company_site", `Headquarters: ${c.hq}`, 0.93, "verified");
    ev("ecommerce", "Sells online", "Shopify", `https://${c.d}/products.json`, "storefront", "Storefront responds on /products.json (Shopify)", 0.99, "verified");
    if (c.ch.length > 1) {
      ev("complexity", "Sales channels", c.ch.join(" + "), `https://${c.d}/collections/all`, "company_site", `Sells through ${c.ch.join(" and ")}`, 0.9, "verified");
    }

    if (c.trigger === "hiring") {
      ev("trigger_hiring", "Signal: hiring", c.detail, `https://${c.d}/careers`, "job_board", `${c.detail} — ${c.hq} — posted ${5 + (i % 17)} days ago`, 0.9, "verified");
    } else if (c.trigger === "funding") {
      ev("trigger_funding", "Signal: funding", c.detail, `https://${c.d}/blogs/news/${slug}`, "news", `Announced a ${c.detail} round to expand operations.`, 0.84, "verified");
    } else {
      ev("trigger_expansion", "Signal: expansion", c.detail, `https://${c.d}/pages/press`, "press_release", `Now selling through ${c.detail} in addition to its own store.`, 0.86, "verified");
    }

    if (c.contact) {
      ev("contact_role", "Decision-maker", c.contact.title, `https://${c.d}/pages/about`, "company_site", `${c.contact.name}, ${c.contact.title}`, 0.88, "verified");
      const first = c.contact.name.split(" ")[0].toLowerCase();
      const last = c.contact.name.split(" ").slice(-1)[0].toLowerCase();
      contacts.push({
        id: `con_${i}`,
        company_id: cid,
        name: c.contact.name,
        title: c.contact.title,
        role_class: c.contact.role,
        email: `${first}.${last}@${c.d}`,
        evidence_id: `ev_${i}_contact_role`,
      });
    }
  });

  await insertRows("evidence", evidence);
  await insertRows("contacts", contacts);

  // Score every company with the real rubric.
  for (const c of companies) {
    await qualifyCompany(c.id);
  }

  // Draft where a human would expect to see work waiting for them.
  const draftStatuses = ["pending_review", "contacted", "engaged", "needs_human", "booked", "opted_out"];
  for (let i = 0; i < SEED_COMPANIES.length; i++) {
    if (!draftStatuses.includes(SEED_COMPANIES[i].status)) continue;
    // Seed content stays deterministic even when a live model is configured.
    const res = await draftEmail(companies[i].id, { useLlm: false });
    if (res.draft) {
      const sent = SEED_COMPANIES[i].status !== "pending_review";
      await run(
        sql`update drafts set status = ${sent ? "sent" : "pending"}, sent_at = ${sent ? minsAgo(180 - i * 2) : null} where id = ${res.draft.id}`,
      );
    }
  }

  // Restore the intended pipeline state for the demo.
  for (let i = 0; i < SEED_COMPANIES.length; i++) {
    await run(sql`update companies set status = ${SEED_COMPANIES[i].status} where id = ${companies[i].id}`);
  }

  const byName = (name: string) => companies.find((c) => c.name === name)!;
  const draftFor = async (companyId: string) =>
    (await rows<any>(sql`select * from drafts where company_id = ${companyId} order by created_at desc limit 1`))[0];
  const contactFor = async (companyId: string) =>
    (await rows<any>(sql`select * from contacts where company_id = ${companyId} limit 1`))[0];

  const thread = async (
    name: string,
    state: string,
    summary: string,
    handoff: string | null,
    script: { dir: "in" | "out"; body: string; cls?: string; conf?: number; by?: string; mins: number }[],
  ) => {
    const company = byName(name);
    const contact = await contactFor(company.id);
    const firstDraft = await draftFor(company.id);
    const tid = `thr_${company.id}`;
    await insertRows("threads", [
      {
        id: tid,
        company_id: company.id,
        contact_id: contact.id,
        state,
        handoff_reason: handoff,
        assigned_to: state === "human" ? "Maya Chen" : null,
        summary,
        created_at: minsAgo(200),
      },
    ]);
    const msgs = script.map((m, idx) => ({
      id: `msg_${company.id}_${idx}`,
      thread_id: tid,
      direction: m.dir,
      body:
        m.dir === "out" && idx === 0 && firstDraft
          ? `Subject: ${firstDraft.subject}\n\n${firstDraft.body}`
          : m.body,
      classification: m.cls ?? null,
      confidence: m.conf ?? null,
      sent_by: m.by ?? (m.dir === "in" ? "prospect" : "agent:comms"),
      created_at: minsAgo(m.mins),
    }));
    await insertRows("messages", msgs);
    return { tid, company, contact };
  };

  await thread("Kestrel Outdoor", "booked", "Call booked for Thursday 2:00 PM ET", null, [
    { dir: "out", body: "", mins: 190 },
    { dir: "in", body: "Sounds good — Thursday at 2pm works.", cls: "booking", conf: 0.92, mins: 120 },
    { dir: "out", body: "Done — I've put us down for Thursday at 2:00 PM ET. Calendar invite and a 3-line agenda are on the way.\n\nIf that stops working, reply here and I'll move it.", mins: 118 },
  ]);

  await thread("Fernhill Pets", "booked", "Call booked for Tuesday 10:00 AM ET", null, [
    { dir: "out", body: "", mins: 185 },
    { dir: "in", body: "Interested. What does onboarding look like?", cls: "interested", conf: 0.92, mins: 115 },
    { dir: "out", body: "Two weeks of cleanup, then a monthly close by the 10th. First we map your Shopify and Amazon payouts, then we take the reconciliation off your team.\n\nTwo times that are open: Tuesday at 10:00 AM ET or Wednesday at 2:00 PM ET.", mins: 113 },
    { dir: "in", body: "Tuesday 10am is fine.", cls: "booking", conf: 0.92, mins: 70 },
    { dir: "out", body: "Booked — Tuesday at 10:00 AM ET. Invite and agenda are on the way.", mins: 68 },
  ]);

  await thread(
    "Loom & Larder",
    "needs_human",
    "Second objection — human should take over",
    "Second objection",
    [
      { dir: "out", body: "", mins: 175 },
      { dir: "in", body: "We already have a bookkeeper in-house, thanks.", cls: "objection", conf: 0.92, mins: 95 },
      { dir: "out", body: "Fair — most brands your size already have someone doing the books. The part that usually breaks first is marketplace payouts and sales tax, not the monthly close.\n\nIf it's not worth 15 minutes, say the word and I'll close the loop. Otherwise: Thursday at 2:00 PM ET or Friday at 10:00 AM ET.", mins: 93 },
      { dir: "in", body: "I said we're not looking. Please stop pitching.", cls: "objection", conf: 0.74, mins: 40 },
    ],
  );

  await thread("Tidepool Skin", "engaged", "Agent replied to pricing question without quoting", null, [
    { dir: "out", body: "", mins: 170 },
    { dir: "in", body: "How much does this cost per month?", cls: "price", conf: 0.92, mins: 88 },
    { dir: "out", body: "Good question. Pricing depends on your channels, order volume and how messy the close is, so we only quote after a short call rather than guessing.\n\nI have Thursday at 2:00 PM ET or Friday at 10:00 AM ET open. Want me to hold one?", mins: 86 },
  ]);

  await thread("Bramble Home", "engaged", "Answered bot question honestly", null, [
    { dir: "out", body: "", mins: 165 },
    { dir: "in", body: "Is this a bot?", cls: "bot", conf: 0.92, mins: 80 },
    { dir: "out", body: "Yes. I'm an AI assistant working with the Ledgerwise team. Every first email here is reviewed by a person before it goes out, and I can hand you to one right now if you'd rather talk to a human.", mins: 78 },
    { dir: "in", body: "Fair enough. Send the times.", cls: "interested", conf: 0.92, mins: 30 },
    { dir: "out", body: "Two times that are actually open: Thursday at 2:00 PM ET or Friday at 10:00 AM ET. The call is 15 minutes — what you sell, where the books hurt, whether we're a fit.", mins: 28 },
  ]);

  await thread("Pike & Post", "opted_out", "Prospect opted out. No further contact.", null, [
    { dir: "out", body: "", mins: 160 },
    { dir: "in", body: "Not interested. Take me off your list.", cls: "opt_out", conf: 0.92, mins: 60 },
  ]);

  await thread("Vellum Home", "contacted", "First email sent, no reply yet", null, [
    { dir: "out", body: "", mins: 150 },
  ]);

  const kestrel = await contactFor(byName("Kestrel Outdoor").id);
  const fernhill = await contactFor(byName("Fernhill Pets").id);
  await insertRows("calls", [
    {
      id: "cal_kestrel",
      thread_id: `thr_${byName("Kestrel Outdoor").id}`,
      company_id: byName("Kestrel Outdoor").id,
      contact_id: kestrel.id,
      slot_start: nextDow(4, 19),
      slot_end: new Date(new Date(nextDow(4, 19)).getTime() + 15 * 60000).toISOString(),
      status: "booked",
      timezone: "America/New_York",
      created_at: minsAgo(118),
    },
    {
      id: "cal_fernhill",
      thread_id: `thr_${byName("Fernhill Pets").id}`,
      company_id: byName("Fernhill Pets").id,
      contact_id: fernhill.id,
      slot_start: nextDow(2, 15),
      slot_end: new Date(new Date(nextDow(2, 15)).getTime() + 15 * 60000).toISOString(),
      status: "booked",
      timezone: "America/New_York",
      created_at: minsAgo(68),
    },
  ]);

  const pike = await contactFor(byName("Pike & Post").id);
  await insertRows("suppressions", [
    {
      id: "sup_pike",
      email: pike.email,
      domain: byName("Pike & Post").domain,
      reason: 'Opt-out: "Not interested. Take me off your list."',
      created_at: minsAgo(60),
    },
  ]);

  await insertRows("audit", [
    { id: "aud_seed_1", actor: "agent:comms", action: "suppression.add", object_type: "contact", object_id: pike.id, before: "active", after: "suppressed", ts: minsAgo(60) },
    { id: "aud_seed_2", actor: "agent:comms", action: "call.book", object_type: "call", object_id: "cal_kestrel", before: "none", after: "booked", ts: minsAgo(118) },
    { id: "aud_seed_3", actor: "Sam Okafor", action: "prompt.publish", object_type: "prompt", object_id: "prm_write_v1", before: "draft", after: "published", ts: minsAgo(300) },
  ]);

  await logRun(
    "orchestrator",
    null,
    "Demo corpus loaded",
    [
      { at: now(), text: `${SEED_COMPANIES.length} companies researched across 3 trigger types`, tool: "research.batch", ok: true },
      { at: now(), text: "Scores computed with the code-owned rubric", tool: "rubric.score", ok: true },
      { at: now(), text: "First emails drafted and queued for human review", tool: "write", ok: true },
    ],
    0,
  );
}
