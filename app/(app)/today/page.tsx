import Link from "next/link";
import { ArrowRight, CalendarCheck2, CircleAlert, MailCheck, Sparkles, Users } from "lucide-react";
import { getDashboard } from "@/lib/queries";
import { relTime } from "@/lib/format";
import { Badge, Empty, LinkText, PageHeader, Panel, PanelHeader, ScoreBar, StatusBadge } from "@/components/ui";

function Stat({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof MailCheck;
  tone: "lime" | "amber" | "green" | "blue";
}) {
  const tones = {
    lime: "text-lime-400 bg-lime-400/10",
    amber: "text-amber-300 bg-amber-400/10",
    green: "text-emerald-300 bg-emerald-400/10",
    blue: "text-sky-300 bg-sky-400/10",
  } as const;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-ink-700 bg-ink-850 p-4 transition hover:border-ink-600 hover:bg-ink-800"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-ink-400">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon size={14} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink-100">{value}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-400">
        {hint}
        <ArrowRight size={11} className="opacity-0 transition group-hover:opacity-100" />
      </div>
    </Link>
  );
}

export default async function TodayPage() {
  const d = await getDashboard();

  return (
    <div className="animate-in">
      <PageHeader
        title="Today"
        subtitle="Everything the agents did, and everything that needs a person."
        action={
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 px-2 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Agents running
            </span>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Emails to review"
          value={d.pendingReviews}
          hint="Nothing sends without you"
          href="/review"
          icon={MailCheck}
          tone="lime"
        />
        <Stat
          label="Threads needing a human"
          value={d.needsHuman}
          hint="Agent is holding"
          href="/inbox"
          icon={CircleAlert}
          tone="amber"
        />
        <Stat label="Calls booked" value={d.bookedCalls} hint="On the real calendar" href="/calls" icon={CalendarCheck2} tone="green" />
        <Stat
          label="Qualified companies"
          value={d.qualified}
          hint={`of ${d.totalCompanies} researched`}
          href="/companies?status=qualified"
          icon={Users}
          tone="blue"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel>
          <PanelHeader title="Waiting on you" hint="Approve the email, or take the thread" action={<LinkText href="/review">Open review</LinkText>} />
          {d.queue.length === 0 && d.escalations.length === 0 ? (
            <Empty title="Nothing waiting." hint="The agents are working. Check back after the next run." />
          ) : (
            <div className="divide-y divide-ink-700">
              {d.queue.map((q) => (
                <Link
                  key={q.draft.id}
                  href={`/review?draft=${q.draft.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-800/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-[11px] font-semibold text-ink-200">
                    {q.company.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink-100">{q.company.name}</span>
                      <Badge tone={q.score.verdict === "qualified" ? "green" : "amber"}>
                        {q.score.verdict === "qualified" ? `${q.score.total}/100` : "needs look"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-400">
                      “{q.draft.subject}” · {q.contact.name}, {q.contact.title}
                    </div>
                  </div>
                  <span className="text-[10px] text-ink-400">{relTime(q.draft.created_at)}</span>
                  <ArrowRight size={14} className="text-ink-500" />
                </Link>
              ))}
              {d.escalations.map((t) => (
                <Link
                  key={t.thread.id}
                  href={`/inbox?thread=${t.thread.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-800/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                    <CircleAlert size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink-100">{t.company.name}</span>
                      <Badge tone="amber">{t.thread.state === "human" ? "human handling" : "needs a human"}</Badge>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-400">
                      {t.thread.handoff_reason ?? t.thread.summary} · {t.messages.at(-1)?.body.slice(0, 70)}
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-ink-500" />
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Calls booked" hint="Agent-booked, real slots" action={<LinkText href="/calls">All calls</LinkText>} />
            {d.calls.length === 0 ? (
              <Empty title="No calls yet." />
            ) : (
              <div className="divide-y divide-ink-700">
                {d.calls.map(({ call, company, contact }) => (
                  <div key={call.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                      <CalendarCheck2 size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink-100">{company.name}</div>
                      <div className="text-[11px] text-ink-400">
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/New_York",
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(call.slot_start))}{" "}
                        ET · {contact?.name}
                      </div>
                    </div>
                    <StatusBadge status={call.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Agent activity" hint="Latest runs" action={<LinkText href="/admin/runs">All runs</LinkText>} />
            <div className="divide-y divide-ink-700">
              {d.runs.map((r) => (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-[12px] text-ink-200">
                    <Sparkles size={12} className="text-lime-400" />
                    <span className="truncate">{r.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-ink-400">{relTime(r.created_at)}</span>
                  </div>
                  <div className="mt-0.5 pl-5 text-[10px] text-ink-400">{r.steps.length} steps · {r.tokens} tokens</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
