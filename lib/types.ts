export type Role = "sales" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  hq: string;
  revenue_band: string;
  revenue_note: string;
  headcount: number;
  channels: string;
  status: string;
  created_at: string;
}

export interface Evidence {
  id: string;
  company_id: string;
  field: string;
  label: string;
  value: string;
  source_url: string;
  source_type: string;
  quote: string;
  retrieved_at: string;
  confidence: number;
  status: "verified" | "estimated" | "conflicting";
}

export interface Contact {
  id: string;
  company_id: string;
  name: string;
  title: string;
  role_class: string;
  email: string;
  evidence_id: string;
}

export interface Reason {
  dimension: "fit" | "intent";
  label: string;
  points: number;
  claim: string;
  evidence_id: string;
}

export interface Score {
  id: string;
  company_id: string;
  fit: number;
  intent: number;
  total: number;
  verdict: "qualified" | "needs_review" | "rejected";
  reasons: Reason[];
  missing: string[];
  confidence: number;
  created_at: string;
}

export interface Claim {
  text: string;
  evidence_id: string;
}

export interface GuardCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface GuardResult {
  pass: boolean;
  checks: GuardCheck[];
}

export interface Draft {
  id: string;
  company_id: string;
  contact_id: string;
  subject: string;
  body: string;
  claims: Claim[];
  prompt_version_id: string;
  status: "pending" | "approved" | "sent" | "rejected";
  guard: GuardResult;
  created_at: string;
  approved_by: string | null;
  sent_at: string | null;
  rejection_reason: string | null;
  edited: number;
}

export interface ThreadRow {
  id: string;
  company_id: string;
  contact_id: string;
  state: string;
  handoff_reason: string | null;
  assigned_to: string | null;
  summary: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  direction: "out" | "in";
  body: string;
  classification: string | null;
  confidence: number | null;
  sent_by: string;
  created_at: string;
}

export interface CallRow {
  id: string;
  thread_id: string | null;
  company_id: string;
  contact_id: string | null;
  slot_start: string;
  slot_end: string;
  status: "held" | "booked" | "completed" | "no_show" | "cancelled";
  timezone: string;
  created_at: string;
}

export interface PromptRow {
  id: string;
  agent: string;
  block: string;
  version: number;
  body: string;
  status: "published" | "draft" | "archived";
  parent_id: string | null;
  published_at: string | null;
  published_by: string | null;
  scorecard: string | null;
}

export interface RunRow {
  id: string;
  kind: string;
  company_id: string | null;
  label: string;
  status: string;
  steps: { at: string; text: string; tool?: string; ok?: boolean }[];
  tokens: number;
  created_at: string;
}

export interface JobRow {
  id: string;
  type: string;
  company_id: string | null;
  payload: string | null;
  status: "queued" | "running" | "done" | "error";
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  object_type: string;
  object_id: string;
  before: string | null;
  after: string | null;
  ts: string;
}
