import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck2, CheckCircle2, CircleAlert, Clock3, Mail } from "lucide-react";
import { getCompanyBundle } from "@/lib/queries";
import { fmtDay, fmtDateTime, relTime } from "@/lib/format";
import { AddContactForm, CompanyActions } from "@/components/CompanyActions";
import {
  Badge,
  EvidenceChip,
  Panel,
  PanelHeader,
  ScoreBar,
  StatusBadge,
  VerdictBadge,
} from "@/components/ui";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getCompanyBundle(id);
  if (!bundle) notFound();
  const { company, evidence, contact, score, draft, thread, calls, runs } = bundle;

  return (
    <div className="animate-in">
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1 text-[11px] text-ink-400 hover:text-ink-200">
        <ArrowLeft size={12} /> All companies
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-100">{company.name}</h1>
            <StatusBadge status={company.status} />
            {score && <VerdictBadge verdict={score.verdict} />}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:text-ink-200">
              {company.domain}
            </a>{" "}
            · {company.hq} · {company.headcount > 0 ? `${company.headcount} employees` : "headcount unknown"} ·{" "}
            {company.channels || "channels unknown"}
          </p>
        </div>
        <CompanyActions
          companyId={company.id}
          canDraft={Boolean(contact) && score?.verdict !== "rejected"}
          hasDraft={Boolean(draft && draft.status !== "rejected")}
          draftPending={draft?.status === "pending"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Why this company"
              hint="Code-owned rubric. Every point has a receipt."
              action={
                score && (
                  <Badge tone={score.confidence > 0.75 ? "green" : "amber"}>
                    confidence {Math.round(score.confidence * 100)}%
                  </Badge>
                )
              }
            />
            {!score ? (
              <p className="px-4 py-6 text-sm text-ink-400">Not scored yet.</p>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-3xl font-semibold tabular-nums text-ink-100">
                    {score.total}
                    <span className="text-sm font-normal text-ink-400">/100</span>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <ScoreBar score={{ fit: score.fit, intent: score.intent, total: score.total }} />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {score.reasons.map((r) => {
                    const ev = evidence.find((e) => e.id === r.evidence_id);
                    return (
                      <div key={`${r.dimension}-${r.label}`} className="rounded-lg border border-ink-700 bg-ink-900/60 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-ink-200">{r.label}</span>
                          <Badge tone={r.dimension === "fit" ? "lime" : "violet"}>+{r.points}</Badge>
                          <span className="ml-auto text-[11px] text-ink-400">{r.claim}</span>
                        </div>
                        <div className="mt-1.5">
                          <EvidenceChip evidence={ev} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {score.missing.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-300">
                      <CircleAlert size={12} /> Gaps that block automation
                    </div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-ink-300">
                      {score.missing.map((m) => (
                        <li key={m}>· {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Collected facts" hint="Nothing enters an email unless it appears here" />
            <div className="divide-y divide-ink-700">
              {evidence.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="w-40 shrink-0 text-[11px] text-ink-400">{e.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">{e.value}</span>
                  <Badge tone={e.status === "estimated" ? "amber" : e.status === "conflicting" ? "red" : "green"}>
                    {e.status}
                  </Badge>
                  <EvidenceChip evidence={e} />
                </div>
              ))}
            </div>
          </Panel>

          {draft && (
            <Panel>
              <PanelHeader
                title="First email"
                hint={`Written against prompt ${draft.prompt_version_id ?? "—"}`}
                action={<StatusBadge status={draft.status} />}
              />
              <div className="p-4">
                <div className="text-[13px] font-medium text-ink-100">{draft.subject}</div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-ink-300">{draft.body}</pre>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draft.claims.map((c: any) => {
                    const ev = evidence.find((e) => e.id === c.evidence_id);
                    return <EvidenceChip key={c.evidence_id} evidence={ev} label={ev?.label ?? "claim"} />;
                  })}
                </div>
                {draft.status === "pending" && (
                  <Link href="/review" className="mt-3 inline-block text-[11px] text-lime-400 hover:underline">
                    Review and approve →
                  </Link>
                )}
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Agent trace" hint="What the agents actually did for this company" />
            <div className="divide-y divide-ink-700">
              {runs.length === 0 && <p className="px-4 py-6 text-sm text-ink-400">No runs yet.</p>}
              {runs.map((r: any) => (
                <details key={r.id} className="group px-4 py-2.5">
                  <summary className="flex items-center gap-2 text-[12px] text-ink-200">
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    <span className="flex-1 truncate">{r.label}</span>
                    <span className="text-[10px] text-ink-400">{relTime(r.created_at)}</span>
                  </summary>
                  <div className="mt-2 space-y-1 border-l border-ink-700 pl-3">
                    {r.steps.map((s: any, i: number) => (
                      <div key={i} className="text-[11px] text-ink-400">
                        <span className={s.ok ? "text-emerald-400" : "text-amber-300"}>{s.ok ? "✓" : "!"}</span>{" "}
                        {s.text}
                        {s.tool && <span className="ml-1 text-[10px] text-ink-500">[{s.tool}]</span>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Decision-maker" hint="Founder, COO, or finance owner" />
            <div className="p-4">
              {contact ? (
                <>
                  <div className="text-[13px] font-medium text-ink-100">{contact.name}</div>
                  <div className="text-[11px] text-ink-400">
                    {contact.title} · {contact.role_class}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-300">
                    <Mail size={12} className="text-ink-400" />
                    {contact.email}
                  </div>
                </>
              ) : (
                <AddContactForm companyId={company.id} />
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Status" />
            <div className="space-y-2 p-4 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Pipeline</span>
                <StatusBadge status={company.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Evidence rows</span>
                <span className="text-ink-200">{evidence.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-400">Researched</span>
                <span className="text-ink-200">{fmtDay(company.created_at)}</span>
              </div>
              {thread && (
                <Link
                  href={`/inbox?thread=${thread.id}`}
                  className="mt-1 flex items-center gap-1.5 rounded-lg border border-ink-700 px-2.5 py-2 text-[11px] text-ink-200 transition hover:border-ink-600 hover:bg-ink-800"
                >
                  <Clock3 size={12} className="text-ink-400" />
                  Open conversation
                  <span className="ml-auto capitalize text-ink-400">{thread.state.replace(/_/g, " ")}</span>
                </Link>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Calls" />
            <div className="divide-y divide-ink-700">
              {calls.length === 0 && <p className="px-4 py-5 text-[12px] text-ink-400">No calls booked.</p>}
              {calls.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                  <CalendarCheck2 size={13} className="text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] text-ink-200">{fmtDateTime(c.slot_start)} ET</div>
                    <div className="text-[10px] text-ink-400">15 minutes · Ledgerwise</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
