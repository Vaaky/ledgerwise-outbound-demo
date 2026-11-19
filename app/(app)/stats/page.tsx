import {
  Activity,
  CalendarCheck2,
  MailCheck,
  MessagesSquare,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import { getStats } from "@/lib/queries";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui";

const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Kpi({
  icon: Icon,
  label,
  value,
  note,
  tone = "text-lime-300",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  note: string;
  tone?: string;
}) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{value}</div>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 ${tone}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="mt-2 text-[10px] leading-relaxed text-ink-400">{note}</div>
    </Panel>
  );
}

function Bars({
  rows,
  tone = "bg-violet-400/75",
}: {
  rows: { label: string; count: number; pct: number }[];
  tone?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) {
    return <div className="px-4 py-6 text-center text-[11px] text-ink-400">No data yet.</div>;
  }
  return (
    <div className="divide-y divide-ink-700/70">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 px-4 py-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-ink-300">{titleCase(row.label)}</span>
          <div className="h-1.5 flex-1 rounded-full bg-ink-800">
            <div
              className={`h-1.5 rounded-full ${tone}`}
              style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right text-[11px] tabular-nums text-ink-200">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

export default async function StatsPage() {
  const s = await getStats();
  const qualifiedPct = Math.round((s.totals.qualified / (s.totals.companies || 1)) * 100);
  const replyRate = Math.round((s.totals.replies / (s.totals.sent || 1)) * 100);

  return (
    <div className="animate-in">
      <PageHeader
        title="Statistics"
        subtitle="What the agents did, where the funnel leaks, and how much still needs a person."
        action={
          <Badge tone="neutral">
            {s.totals.companies} companies · {s.totals.runs} runs
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Users}
          label="Companies researched"
          value={s.totals.companies}
          note={`${s.totals.qualified} qualified (${qualifiedPct}%) · ${s.totals.evidence} evidence rows`}
        />
        <Kpi
          icon={MailCheck}
          label="Emails to review"
          value={s.totals.pending}
          note={`${s.totals.sent} sent · ${s.totals.guardBlocked} blocked by guards`}
          tone="text-amber-300"
        />
        <Kpi
          icon={MessagesSquare}
          label="Conversations"
          value={s.totals.replies}
          note={`${replyRate}% reply rate on sent email · ${s.totals.handoffs} need a human`}
          tone="text-sky-300"
        />
        <Kpi
          icon={CalendarCheck2}
          label="Calls booked"
          value={s.totals.booked}
          note={`${s.totals.optedOut} opted out · suppression is permanent`}
          tone="text-emerald-300"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <PanelHeader title="Pipeline" hint="Researched → qualified → contacted → replied → booked" />
          <div className="space-y-3 p-4">
            {s.funnel.map((step, index) => (
              <div key={step.label}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-ink-300">
                    <span className="mr-1.5 text-ink-500">{index + 1}.</span>
                    {step.label}
                  </span>
                  <span className="tabular-nums text-ink-200">
                    {step.value} <span className="text-ink-500">({step.pct}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-ink-800">
                  <div
                    className="h-2 rounded-full bg-lime-400/80"
                    style={{ width: `${Math.max(2, step.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Company status" hint="Every company in the workspace" />
          <Bars rows={s.companyStatus} tone="bg-lime-400/70" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Draft outcomes" hint="Generated email, by state" />
          <Bars rows={s.draftStatus} tone="bg-amber-400/70" />
        </Panel>
        <Panel>
          <PanelHeader title="Thread states" hint="Where conversations stand" />
          <Bars rows={s.threadState} tone="bg-sky-400/70" />
        </Panel>
        <Panel>
          <PanelHeader title="Agent runs" hint="Jobs by agent role" />
          <Bars rows={s.runsByKind} tone="bg-violet-400/70" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader title="Trigger mix" hint="Why companies entered the funnel" />
          <Bars rows={s.triggers} tone="bg-emerald-400/70" />
        </Panel>
        <Panel>
          <PanelHeader title="Quality gates" hint="Code-owned controls, not model judgment" />
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <ShieldAlert size={14} className="text-rose-300" />
              <div className="mt-2 text-lg font-semibold tabular-nums text-ink-100">{s.totals.guardBlocked}</div>
              <div className="text-[10px] text-ink-400">drafts blocked by guards</div>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <Target size={14} className="text-amber-300" />
              <div className="mt-2 text-lg font-semibold tabular-nums text-ink-100">{s.totals.handoffs}</div>
              <div className="text-[10px] text-ink-400">threads handed to a human</div>
            </div>
            <div className="rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <Activity size={14} className="text-sky-300" />
              <div className="mt-2 text-lg font-semibold tabular-nums text-ink-100">{s.totals.runs}</div>
              <div className="text-[10px] text-ink-400">agent runs recorded</div>
            </div>
          </div>
          <p className="px-4 pb-4 text-[10px] leading-relaxed text-ink-500">
            The rubric, suppression, price checks and claim binding are code. Prompt edits cannot change them.
          </p>
        </Panel>
      </div>
    </div>
  );
}
