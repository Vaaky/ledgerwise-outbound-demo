import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarCheck2,
  GitBranch,
  MailCheck,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { rows } from "@/lib/db";
import { llmMode } from "@/lib/llm";
import { relTime } from "@/lib/format";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui";
import { PauseToggle } from "@/components/PauseToggle";

const AGENTS = [
  {
    key: "orchestrator",
    name: "Orchestrator",
    icon: GitBranch,
    role: "Owns state, routes work, enforces gates and budgets. The only component that can advance a lead.",
    tools: ["queue.claim", "state.transition", "gate.request", "budget.check"],
  },
  {
    key: "research",
    name: "Research agent",
    icon: Search,
    role: "Finds companies that pass the ICP and stores every fact with a URL, quote and timestamp.",
    tools: ["web.search", "web.fetch", "storefront.detect", "jobs.search", "news.search", "contact.find"],
  },
  {
    key: "qualifier",
    name: "Qualifier agent",
    icon: SlidersHorizontal,
    role: "Scores fit and timing. Code owns the math; the agent explains it with evidence ids.",
    tools: ["evidence.query", "rubric.score", "evidence.verify", "gate.request"],
  },
  {
    key: "comms",
    name: "Comms agent",
    icon: MailCheck,
    role: "Writes, replies and books. Every outbound message passes the guard layer before a person can send.",
    tools: ["email.send", "email.thread.read", "calendar.freebusy", "calendar.book", "suppression.check"],
  },
];

export default async function AdminPage() {
  await ensureDb();
  const settings = await rows<{ key: string; value: string }>(sql`select * from settings`);
  const audit = await rows<any>(sql`select * from audit order by ts desc limit 10`);
  const runs = await rows<any>(sql`select * from runs order by created_at desc limit 5`);
  const suppressed = await rows<any>(sql`select count(*)::int as n from suppressions`);
  const blocked = await rows<any>(sql`select count(*)::int as n from drafts where guard like '%"pass":false%'`);

  const paused = (key: string) => settings.find((s) => s.key === `paused:${key}`)?.value === "1";

  return (
    <div>
      <PageHeader
        title="Control room"
        subtitle="Pause anything, change how the agents think, and read the trail. Nothing here needs a deploy."
        action={
          <div className="flex items-center gap-2">
            <Badge tone={llmMode() === "live" ? "green" : "neutral"}>
              <BrainCircuit size={11} /> {llmMode() === "live" ? "live model" : "mock model"}
            </Badge>
            <Badge tone="neutral">
              <ShieldCheck size={11} /> {suppressed[0]?.n ?? 0} suppressed
            </Badge>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-rose-300">Kill switch</div>
              <div className="mt-1 text-[12px] text-ink-300">Stops every outbound send instantly.</div>
            </div>
            <PauseToggle agentKey="outbound" paused={paused("outbound")} />
          </div>
          <div className="mt-2 text-[10px] text-ink-400">
            {paused("outbound") ? "Outbound is paused. Approve buttons will refuse to send." : "Outbound is live."}
          </div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Guard blocks</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{blocked[0]?.n ?? 0}</div>
          <div className="text-[10px] text-ink-400">drafts currently failing a rule</div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Runs today</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-100">{runs.length}</div>
          <div className="text-[10px] text-ink-400">latest {runs[0] ? relTime(runs[0].created_at) : "—"}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {AGENTS.map((a) => {
          const Icon = a.icon;
          const isPaused = paused(a.key);
          return (
            <Panel key={a.key} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-800 text-lime-400">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink-100">{a.name}</span>
                    <Badge tone={isPaused ? "amber" : "green"}>{isPaused ? "paused" : "running"}</Badge>
                    <span className="ml-auto">
                      <PauseToggle agentKey={a.key} paused={isPaused} />
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{a.role}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tools.map((t) => (
                      <span key={t} className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 font-mono text-[9.5px] text-ink-400">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHeader title="Recent runs" hint="Every step is recorded" action={<a href="/admin/runs" className="text-[11px] text-lime-400 hover:underline">All runs</a>} />
          <div className="divide-y divide-ink-700">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2.5">
                <Activity size={12} className="text-lime-400" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">{r.label}</span>
                <Badge tone="neutral">{r.kind}</Badge>
                <span className="text-[10px] text-ink-500">{relTime(r.created_at)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Audit trail" hint="Append-only" />
          <div className="divide-y divide-ink-700">
            {audit.map((a) => (
              <div key={a.id} className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-200">{a.action}</span>
                  <span className="ml-auto text-[10px] text-ink-500">{relTime(a.ts)}</span>
                </div>
                <div className="text-[10px] text-ink-400">
                  {a.actor} · {a.object_type} {a.object_id.slice(0, 16)} · {a.before} → {a.after}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          { icon: Search, title: "Research", value: "30 companies", hint: "3 trigger types, every fact sourced" },
          { icon: Sparkles, title: "Qualify", value: "One rubric", hint: "fit 60 + timing 40, hard gates override" },
          { icon: CalendarCheck2, title: "Book", value: "Real slots", hint: "free/busy → hold → event" },
        ].map((c) => (
          <div key={c.title} className="rounded-lg border border-ink-700 bg-ink-850 p-3">
            <c.icon size={14} className="text-lime-400" />
            <div className="mt-2 text-[13px] font-medium text-ink-100">{c.value}</div>
            <div className="text-[10.5px] text-ink-400">{c.title} · {c.hint}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-500">
        <Bot size={11} /> Agents cannot send, suppress, or change a score without the code path that owns that rule.
      </div>
    </div>
  );
}
