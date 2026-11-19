import Link from "next/link";
import { ExternalLink, Link2 } from "lucide-react";
import type { Evidence, Score } from "@/lib/types";
import { fmtDay } from "@/lib/format";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "violet" | "lime";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-800 text-ink-300 border-ink-600",
  lime: "bg-lime-400/10 text-lime-300 border-lime-400/25",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  red: "bg-rose-500/10 text-rose-300 border-rose-500/25",
  blue: "bg-sky-500/10 text-sky-300 border-sky-500/25",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/25",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const VERDICT: Record<string, { label: string; tone: Tone }> = {
  qualified: { label: "Qualified", tone: "green" },
  needs_review: { label: "Needs review", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  researching: { label: "Researching", tone: "blue" },
  qualified: { label: "Qualified", tone: "green" },
  needs_review: { label: "Needs review", tone: "amber" },
  rejected: { label: "Rejected", tone: "red" },
  pending_review: { label: "Email awaiting review", tone: "amber" },
  contacted: { label: "Contacted", tone: "blue" },
  engaged: { label: "Agent handling", tone: "violet" },
  needs_human: { label: "Needs a human", tone: "amber" },
  human: { label: "Human handling", tone: "blue" },
  booked: { label: "Call booked", tone: "green" },
  opted_out: { label: "Opted out", tone: "red" },
  completed: { label: "Completed", tone: "green" },
  no_show: { label: "No-show", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  sent: { label: "Sent", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "green" },
  archived: { label: "Archived", tone: "neutral" },
  error: { label: "Error", tone: "red" },
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = VERDICT[verdict] ?? { label: verdict, tone: "neutral" as Tone };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ScoreBar({ score, compact = false }: { score: Pick<Score, "fit" | "intent" | "total">; compact?: boolean }) {
  return (
    <div className={cx("w-full", compact ? "max-w-[130px]" : "max-w-[280px]")}>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
        <div className="bg-lime-400" style={{ width: `${(score.fit / 100) * 100}%` }} />
        <div className="bg-violet-400" style={{ width: `${(score.intent / 100) * 100}%` }} />
      </div>
      {!compact && (
        <div className="mt-1 flex items-center gap-3 text-[11px] text-ink-400">
          <span>
            fit <span className="text-ink-200">{score.fit}</span>/60
          </span>
          <span>
            timing <span className="text-ink-200">{score.intent}</span>/40
          </span>
          <span className="ml-auto text-ink-200">{score.total}/100</span>
        </div>
      )}
    </div>
  );
}

export function EvidenceChip({ evidence, label }: { evidence?: Evidence; label?: string }) {
  if (!evidence) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300">
        no source
      </span>
    );
  }
  return (
    <details className="relative inline-block">
      <summary className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 text-[11px] text-ink-300 transition hover:border-lime-400/40 hover:text-lime-300">
        <Link2 size={11} />
        {label ?? evidence.label}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-ink-600 bg-ink-850 p-3 text-left shadow-2xl">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-ink-400">
          <span>{evidence.source_type.replace(/_/g, " ")}</span>
          <span className={evidence.status === "estimated" ? "text-amber-300" : "text-emerald-300"}>
            {evidence.status}
          </span>
        </div>
        <p className="mt-2 border-l-2 border-ink-600 pl-2 text-xs italic text-ink-200">“{evidence.quote}”</p>
        <a
          href={evidence.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1 break-all text-[11px] text-sky-300 hover:underline"
        >
          <ExternalLink size={11} className="shrink-0" />
          {evidence.source_url}
        </a>
        <div className="mt-1 text-[10px] text-ink-400">
          retrieved {fmtDay(evidence.retrieved_at)} · confidence {Math.round(evidence.confidence * 100)}%
        </div>
      </div>
    </details>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-ink-700 bg-ink-850", className)}>{children}</section>
  );
}

export function PanelHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-3">
      <div>
        <h2 className="text-sm font-medium text-ink-100">{title}</h2>
        {hint && <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-ink-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

export function LinkText({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs text-lime-400 hover:underline">
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-100">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
