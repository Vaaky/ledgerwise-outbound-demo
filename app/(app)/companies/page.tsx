import Link from "next/link";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import type { Company, Contact } from "@/lib/types";
import { CompanySearch } from "@/components/CompanySearch";
import { Badge, PageHeader, Panel, ScoreBar, StatusBadge } from "@/components/ui";

const TABS = [
  { key: "all", label: "All" },
  { key: "qualified", label: "Qualified" },
  { key: "needs_review", label: "Needs review" },
  { key: "pending_review", label: "Email queued" },
  { key: "contacted", label: "Contacted" },
  { key: "booked", label: "Booked" },
  { key: "opted_out", label: "Opted out" },
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  await ensureDb();
  const q = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "all";

  const companies = await rows<Company>(sql`select * from companies order by created_at asc`);
  const scores = await rows<any>(sql`select * from scores`);
  const contacts = await rows<Contact>(sql`select * from contacts`);

  const scoreOf = (id: string) => scores.find((s) => s.company_id === id);
  const contactOf = (id: string) => contacts.find((c) => c.company_id === id);

  const filtered = companies.filter((c) => {
    if (q && !`${c.name} ${c.domain} ${c.hq}`.toLowerCase().includes(q)) return false;
    if (status !== "all" && c.status !== status) return false;
    return true;
  });

  const count = (s: string) => companies.filter((c) => c.status === s).length;

  return (
    <div className="animate-in">
      <PageHeader
        title="Companies"
        subtitle="Every company carries its score and the sources behind it. Estimates are marked as estimates."
      />

      <CompanySearch />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/companies?status=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-2.5 py-1 text-[11px] transition ${
                status === t.key ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {t.label}
              <span className="ml-1 text-[10px] text-ink-400">
                {t.key === "all"
                  ? companies.length
                  : t.key === "needs_review"
                    ? count("needs_review") + count("researching")
                    : count(t.key)}
              </span>
            </Link>
          ))}
        </div>
        <form className="ml-auto flex items-center gap-2" action="/companies">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search company, domain, city"
            className="w-56 rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-1 text-[11px] text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
          />
          <button className="rounded-lg border border-ink-600 px-2.5 py-1 text-[11px] text-ink-300 hover:text-ink-100">
            Filter
          </button>
        </form>
      </div>

      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.7fr_0.7fr] gap-3 border-b border-ink-700 px-4 py-2 text-[10px] uppercase tracking-wide text-ink-400 md:grid">
          <span>Company</span>
          <span>Score</span>
          <span>Reason to reach out</span>
          <span>Contact</span>
          <span className="text-right">Status</span>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-ink-400">
            No companies match. Try clearing the filter or research a live domain.
          </div>
        )}
        <div className="divide-y divide-ink-700">
          {filtered.map((c) => {
            const s = scoreOf(c.id);
            const contact = contactOf(c.id);
            const intent = s ? (JSON.parse(s.reasons || "[]") as any[]).filter((r) => r.dimension === "intent") : [];
            return (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="grid grid-cols-1 gap-2 px-4 py-3 transition hover:bg-ink-800/50 md:grid-cols-[1.5fr_1fr_0.8fr_0.7fr_0.7fr] md:items-center md:gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink-100">{c.name}</span>
                    {c.status === "needs_review" && <Badge tone="amber">human gate</Badge>}
                  </div>
                  <div className="truncate text-[11px] text-ink-400">
                    {c.domain} · {c.hq} · {c.headcount > 0 ? `${c.headcount} staff` : "headcount unknown"}
                  </div>
                </div>
                <div>
                  {s ? (
                    <div className="flex items-center gap-2">
                      <ScoreBar score={{ fit: s.fit, intent: s.intent, total: s.total }} compact />
                      <span className="text-[12px] tabular-nums text-ink-200">{s.total}</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-ink-400">not scored</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {intent.length ? (
                    intent.map((r: any) => (
                      <Badge key={r.label} tone="violet">
                        {r.label}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[11px] text-ink-400">—</span>
                  )}
                </div>
                <div className="truncate text-[11px] text-ink-300">
                  {contact ? `${contact.name}` : <span className="text-amber-300">no contact</span>}
                </div>
                <div className="md:text-right">
                  <StatusBadge status={c.status} />
                </div>
              </Link>
            );
          })}
        </div>
      </Panel>

      <p className="mt-3 text-[10px] text-ink-400">
        Demo corpus is synthetic so no invented fact is attached to a real business. “Run research” uses the live
        pipeline on any public domain and writes real evidence rows.
      </p>
    </div>
  );
}
