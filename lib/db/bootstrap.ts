import { sql } from "drizzle-orm";
import { rows, run } from "./index";
import { seedDemo } from "@/lib/seed";

const DDL = [
  `create table if not exists settings (key text primary key, value text)`,
  `create table if not exists users (id text primary key, name text, email text, role text)`,
  `create table if not exists companies (id text primary key, name text, domain text, hq text, revenue_band text, revenue_note text, headcount integer, channels text, status text, created_at text)`,
  `create table if not exists evidence (id text primary key, company_id text, field text, label text, value text, source_url text, source_type text, quote text, retrieved_at text, confidence real, status text)`,
  `create table if not exists contacts (id text primary key, company_id text, name text, title text, role_class text, email text, evidence_id text)`,
  `create table if not exists scores (id text primary key, company_id text unique, fit integer, intent integer, total integer, verdict text, reasons text, missing text, confidence real, created_at text)`,
  `create table if not exists drafts (id text primary key, company_id text, contact_id text, subject text, body text, claims text, prompt_version_id text, status text, guard text, created_at text, approved_by text, sent_at text, rejection_reason text, edited integer default 0)`,
  `create table if not exists threads (id text primary key, company_id text, contact_id text, state text, handoff_reason text, assigned_to text, summary text, created_at text)`,
  `create table if not exists messages (id text primary key, thread_id text, direction text, body text, classification text, confidence real, sent_by text, created_at text)`,
  `create table if not exists calls (id text primary key, thread_id text, company_id text, contact_id text, slot_start text, slot_end text, status text, timezone text, created_at text)`,
  `create table if not exists suppressions (id text primary key, email text, domain text, reason text, created_at text)`,
  `create table if not exists prompts (id text primary key, agent text, block text, version integer, body text, status text, parent_id text, published_at text, published_by text, scorecard text)`,
  `create table if not exists runs (id text primary key, kind text, company_id text, label text, status text, steps text, tokens integer, created_at text)`,
  `create table if not exists audit (id text primary key, actor text, action text, object_type text, object_id text, before text, after text, ts text)`,
  `create table if not exists jobs (id text primary key, type text, company_id text, payload text, status text, created_at text)`,
  `create index if not exists idx_evidence_company on evidence(company_id)`,
  `create index if not exists idx_messages_thread on messages(thread_id)`,
  `create index if not exists idx_drafts_status on drafts(status)`,
  `create index if not exists idx_jobs_status on jobs(status)`,
];

declare global {
  // eslint-disable-next-line no-var
  var __lwInit: Promise<void> | undefined;
}

export function ensureDb(): Promise<void> {
  if (!globalThis.__lwInit) globalThis.__lwInit = init();
  return globalThis.__lwInit;
}

async function init(): Promise<void> {
  for (const stmt of DDL) {
    await run(sql.raw(stmt));
  }
  const existing = await rows(sql`select key from settings where key = 'seed'`);
  if (existing.length) return;

  // Only one instance wins the seed race.
  const claim = await rows(
    sql`insert into settings (key, value) values ('seed', 'running') on conflict (key) do nothing returning key`,
  );
  if (!claim.length) return;

  try {
    await seedDemo();
    await run(sql`update settings set value = 'done' where key = 'seed'`);
  } catch (err) {
    await run(sql`delete from settings where key = 'seed'`);
    throw err;
  }
}
