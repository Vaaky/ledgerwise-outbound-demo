import { sql } from "drizzle-orm";
import { rows } from "./db";
import { ensureDb } from "./db/bootstrap";
import { getCompany, getContact, getEvidence, getScore } from "./agents";
import type {
  CallRow,
  Claim,
  Company,
  Contact,
  Draft,
  Evidence,
  Message,
  RunRow,
  Score,
  ThreadRow,
} from "./types";

const parse = <T,>(v: unknown, fallback: T): T => {
  if (typeof v !== "string") return (v as T) ?? fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export interface ReviewItem {
  draft: Draft;
  company: Company;
  contact: Contact;
  score: Score;
  evidence: Evidence[];
}

export async function getReviewQueue(): Promise<ReviewItem[]> {
  await ensureDb();
  const drafts = await rows<any>(
    sql`select * from drafts where status = 'pending' order by created_at asc`,
  );
  const items: ReviewItem[] = [];
  for (const d of drafts) {
    const company = await getCompany(d.company_id);
    const contact = await getContact(d.company_id);
    const score = await getScore(d.company_id);
    const evidence = await getEvidence(d.company_id);
    if (!company || !contact || !score) continue;
    const draft = {
      ...d,
      claims: parse<Claim[]>(d.claims, []),
      guard: parse(d.guard, { pass: false, checks: [] }),
    } as Draft;
    items.push({ draft, company, contact, score, evidence });
  }
  return items;
}

export interface ThreadView {
  thread: ThreadRow;
  company: Company;
  contact: Contact;
  messages: Message[];
}

export async function getThreadViews(onlyId?: string): Promise<ThreadView[]> {
  await ensureDb();
  const threads = await rows<ThreadRow>(
    onlyId
      ? sql`select * from threads where id = ${onlyId}`
      : sql`select * from threads order by case state when 'needs_human' then 0 when 'human' then 1 else 2 end, created_at desc`,
  );
  const out: ThreadView[] = [];
  for (const t of threads) {
    const company = await getCompany(t.company_id);
    const contact = await getContact(t.company_id);
    const messages = await rows<Message>(
      sql`select * from messages where thread_id = ${t.id} order by created_at asc`,
    );
    if (!company || !contact) continue;
    out.push({ thread: t, company, contact, messages });
  }
  return out;
}

export interface CallView {
  call: CallRow;
  company: Company;
  contact: Contact | null;
}

export async function getCalls(): Promise<CallView[]> {
  await ensureDb();
  const calls = await rows<CallRow>(sql`select * from calls order by slot_start asc`);
  const out: CallView[] = [];
  for (const c of calls) {
    const company = await getCompany(c.company_id);
    const contact = await getContact(c.company_id);
    if (!company) continue;
    out.push({ call: c, company, contact });
  }
  return out;
}

export async function getRuns(limit = 8): Promise<RunRow[]> {
  await ensureDb();
  const r = await rows<any>(sql`select * from runs order by created_at desc limit ${limit}`);
  return r.map((x) => ({ ...x, steps: parse<RunRow["steps"]>(x.steps, []) }));
}

export interface Dashboard {
  pendingReviews: number;
  needsHuman: number;
  bookedCalls: number;
  qualified: number;
  totalCompanies: number;
  queue: ReviewItem[];
  escalations: ThreadView[];
  calls: CallView[];
  runs: RunRow[];
}

export async function getDashboard(): Promise<Dashboard> {
  await ensureDb();
  const [pending, needsHuman, calls, qualified, total] = await Promise.all([
    rows<any>(sql`select count(*)::int as n from drafts where status = 'pending'`),
    rows<any>(sql`select count(*)::int as n from threads where state in ('needs_human','human')`),
    rows<any>(sql`select count(*)::int as n from calls where status = 'booked'`),
    rows<any>(sql`select count(*)::int as n from scores where verdict = 'qualified'`),
    rows<any>(sql`select count(*)::int as n from companies`),
  ]);
  const queue = (await getReviewQueue()).slice(0, 5);
  const threads = await getThreadViews();
  return {
    pendingReviews: pending[0]?.n ?? 0,
    needsHuman: needsHuman[0]?.n ?? 0,
    bookedCalls: calls[0]?.n ?? 0,
    qualified: qualified[0]?.n ?? 0,
    totalCompanies: total[0]?.n ?? 0,
    queue,
    escalations: threads.filter((t) => ["needs_human", "human"].includes(t.thread.state)),
    calls: (await getCalls()).filter((c) => c.call.status === "booked").slice(0, 4),
    runs: await getRuns(7),
  };
}

export async function getCompanyBundle(companyId: string) {
  await ensureDb();
  const company = await getCompany(companyId);
  if (!company) return null;
  const [evidence, contact, score] = await Promise.all([
    getEvidence(companyId),
    getContact(companyId),
    getScore(companyId),
  ]);
  const drafts = await rows<any>(
    sql`select * from drafts where company_id = ${companyId} order by created_at desc limit 1`,
  );
  const threads = await rows<any>(sql`select * from threads where company_id = ${companyId} limit 1`);
  const calls = await rows<CallRow>(sql`select * from calls where company_id = ${companyId}`);
  const runs = await rows<any>(
    sql`select * from runs where company_id = ${companyId} order by created_at desc limit 12`,
  );
  return {
    company,
    evidence,
    contact,
    score,
    draft: drafts[0]
      ? {
          ...drafts[0],
          claims: parse<Claim[]>(drafts[0].claims, []),
          guard: parse(drafts[0].guard, { pass: false, checks: [] }),
        }
      : null,
    thread: threads[0] ?? null,
    calls,
    runs: runs.map((r) => ({ ...r, steps: parse<RunRow["steps"]>(r.steps, []) })),
  };
}

export interface StatSlice {
  label: string;
  count: number;
  pct: number;
}

export interface Stats {
  totals: {
    companies: number;
    qualified: number;
    pending: number;
    sent: number;
    replies: number;
    booked: number;
    optedOut: number;
    guardBlocked: number;
    handoffs: number;
    evidence: number;
    runs: number;
  };
  funnel: { label: string; value: number; pct: number }[];
  companyStatus: StatSlice[];
  draftStatus: StatSlice[];
  threadState: StatSlice[];
  runsByKind: StatSlice[];
  triggers: StatSlice[];
}

export async function getStats(): Promise<Stats> {
  await ensureDb();
  const [companies, scores, drafts, threads, messages, calls, evidence, runs] = await Promise.all([
    rows<Company>(sql`select * from companies`),
    rows<Score>(sql`select * from scores`),
    rows<any>(sql`select * from drafts`),
    rows<ThreadRow>(sql`select * from threads`),
    rows<Message>(sql`select * from messages`),
    rows<CallRow>(sql`select * from calls`),
    rows<Evidence>(sql`select * from evidence`),
    rows<RunRow>(sql`select * from runs`),
  ]);

  const parsedDrafts = drafts.map((d) => ({
    ...d,
    guard: parse<{ pass?: boolean }>(d.guard, { pass: true }),
  }));

  const total = companies.length || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const group = (values: string[]) => {
    const map = new Map<string, number>();
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };
  const slice = (entries: [string, number][], denominator: number): StatSlice[] =>
    entries.map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / (denominator || 1)) * 100),
    }));

  const qualified = scores.filter((s) => s.verdict === "qualified").length;
  const pending = parsedDrafts.filter((d) => d.status === "pending").length;
  const sent = parsedDrafts.filter((d) => d.status === "sent").length;
  const guardBlocked = parsedDrafts.filter((d) => d.guard?.pass === false).length;
  const booked = calls.filter((c) => c.status === "booked").length;
  const optedOut = threads.filter((t) => t.state === "opted_out").length;
  const handoffs = threads.filter((t) => ["needs_human", "human"].includes(t.state)).length;
  const repliedThreads = new Set(messages.filter((m) => m.direction === "in").map((m) => m.thread_id));
  const contacted = companies.filter((c) =>
    ["contacted", "engaged", "needs_human", "booked", "opted_out"].includes(c.status),
  ).length;

  const triggerMap = new Map<string, number>();
  for (const e of evidence) {
    if (!e.field.startsWith("trigger_")) continue;
    triggerMap.set(e.field, (triggerMap.get(e.field) ?? 0) + 1);
  }
  const triggers = [...triggerMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => ({
      label: field.replace("trigger_", "").replace(/_/g, " "),
      count,
      pct: Math.round((count / total) * 100),
    }));

  return {
    totals: {
      companies: companies.length,
      qualified,
      pending,
      sent,
      replies: repliedThreads.size,
      booked,
      optedOut,
      guardBlocked,
      handoffs,
      evidence: evidence.length,
      runs: runs.length,
    },
    funnel: [
      { label: "Researched", value: companies.length, pct: 100 },
      { label: "Qualified", value: qualified, pct: pct(qualified) },
      { label: "Contacted", value: contacted, pct: pct(contacted) },
      { label: "Replied", value: repliedThreads.size, pct: pct(repliedThreads.size) },
      { label: "Booked", value: booked, pct: pct(booked) },
    ],
    companyStatus: slice(group(companies.map((c) => c.status)), companies.length),
    draftStatus: slice(group(parsedDrafts.map((d) => d.status)), parsedDrafts.length),
    threadState: slice(group(threads.map((t) => t.state)), threads.length),
    runsByKind: slice(group(runs.map((r) => r.kind)), runs.length),
    triggers,
  };
}
