import { sql } from "drizzle-orm";
import { Check, Lock, ShieldCheck, X } from "lucide-react";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import { relTime } from "@/lib/format";
import { Badge, PageHeader, Panel, PanelHeader } from "@/components/ui";

const RULES = [
  {
    rule: "Never quote a price",
    how: "Currency and price-term detector runs on every outbound draft and reply. A hit blocks the send. Pricing questions are routed to a call.",
    code: "guards.price",
    human: "Call offer",
  },
  {
    rule: "Never claim anything that isn't true",
    how: "Facts live in an evidence table with a source URL, exact quote and timestamp. A sentence that looks factual must map to an evidence id or the send is blocked.",
    code: "guards.claims",
    human: "Unsourceable → gate",
  },
  {
    rule: "Stop means stop",
    how: "Opt-out is classified deterministically, writes a suppression row for email and domain, and the send function checks that row first. Fail-closed.",
    code: "guards.suppression",
    human: "Owner notified",
  },
  {
    rule: "Be honest about being a bot",
    how: "Banned evasions ('I'm a real person'). If the thread asks, the reply must disclose that it is an AI assistant.",
    code: "guards.disclosure",
    human: "—",
  },
  {
    rule: "When unsure, ask a human",
    how: "Confidence thresholds, missing contact, conflicting sources, complaints and unmatched intent all open a gate instead of guessing.",
    code: "gate.request",
    human: "Four gates",
  },
];

export default async function RulesPage() {
  await ensureDb();
  const suppressions = await rows<any>(sql`select * from suppressions order by created_at desc`);
  const checks = [
    { label: "Currency / fee scan", pass: true },
    { label: "Claim → evidence binding", pass: true },
    { label: "Suppression lookup before send", pass: true },
    { label: "Bot disclosure", pass: true },
    { label: "Length and signature", pass: true },
    { label: "Outcome-promise scan", pass: true },
  ];

  return (
    <div>
      <PageHeader
        title="Rules & guardrails"
        subtitle="The five rules Ledgerwise gave us live here, in code. Prompts can explain them; they cannot remove them."
        action={
          <Badge tone="neutral">
            <Lock size={11} /> immutable layer
          </Badge>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          {RULES.map((r, i) => (
            <Panel key={r.rule} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-400/10 text-[11px] font-semibold text-lime-300">
                  {i + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink-100">{r.rule}</span>
                    <Badge tone="green">enforced</Badge>
                    <span className="font-mono text-[9.5px] text-ink-500">{r.code}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{r.how}</p>
                  <div className="mt-1.5 text-[10px] text-ink-500">human side: {r.human}</div>
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="space-y-3">
          <Panel>
            <PanelHeader title="Guard pipeline" hint="Runs after generation, before send" />
            <div className="divide-y divide-ink-700">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                    <Check size={10} />
                  </span>
                  <span className="text-ink-300">{c.label}</span>
                  <span className="ml-auto font-mono text-[9px] text-ink-500">always</span>
                </div>
              ))}
            </div>
            <div className="border-t border-ink-700 px-3 py-2 text-[10px] text-ink-500">
              Fail-closed: any failed check stops the send and opens a gate.
            </div>
          </Panel>

          <Panel>
            <PanelHeader title={`Suppression list · ${suppressions.length}`} hint="Checked before every send" />
            {suppressions.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-ink-400">Nobody has opted out yet.</p>
            ) : (
              <div className="divide-y divide-ink-700">
                {suppressions.map((s) => (
                  <div key={s.id} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[11px] text-ink-200">{s.email}</span>
                      <span className="ml-auto text-[9.5px] text-ink-500">{relTime(s.created_at)}</span>
                    </div>
                    <div className="text-[9.5px] text-ink-400">{s.domain} · {s.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
              <ShieldCheck size={12} /> What admins can change
            </div>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-ink-400">
              <li>· Wording, tone, examples and escalation thresholds</li>
              <li>· Which tools are enabled, and pause switches</li>
              <li>· <span className="text-rose-300">Not</span> opt-out handling, price blocking, or claim binding</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
