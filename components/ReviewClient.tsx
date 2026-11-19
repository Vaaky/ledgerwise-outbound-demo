"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import type { GuardResult } from "@/lib/types";
import type { ReviewItem } from "@/lib/queries";
import { fmtDateTime, relTime } from "@/lib/format";
import { Badge, EvidenceChip, Panel, PanelHeader, ScoreBar, VerdictBadge, cx } from "./ui";

const REJECT_REASONS = ["Wrong person", "Wrong company", "Weak angle", "Tone", "Factually wrong"];

export function ReviewClient({ initialItems }: { initialItems: ReviewItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState(initialItems[0]?.draft.id ?? null);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(initialItems[0]?.draft.subject ?? "");
  const [body, setBody] = useState(initialItems[0]?.draft.body ?? "");
  const [guard, setGuard] = useState<GuardResult | null>(initialItems[0]?.draft.guard ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const signature = initialItems.map((i) => i.draft.id).join(",");
  useEffect(() => {
    setItems(initialItems);
    if (!initialItems.find((i) => i.draft.id === selectedId)) {
      setSelectedId(initialItems[0]?.draft.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const current = useMemo(
    () => items.find((i) => i.draft.id === selectedId) ?? items[0],
    [items, selectedId],
  );

  useEffect(() => {
    if (!current) return;
    setSubject(current.draft.subject);
    setBody(current.draft.body);
    setGuard(current.draft.guard);
    setEditing(false);
    setRejecting(false);
  }, [current?.draft.id]);

  const remove = (id: string) => {
    const next = items.filter((i) => i.draft.id !== id);
    setItems(next);
    setSelectedId(next[0]?.draft.id ?? null);
  };

  const act = async (kind: "approve" | "reject", reason?: string) => {
    if (!current) return;
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/drafts/${current.draft.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setMessage({ ok: true, text: json.message });
      remove(current.draft.id);
      router.refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const checkRules = async () => {
    if (!current) return;
    setBusy("check");
    setMessage(null);
    try {
      const res = await fetch(`/api/drafts/${current.draft.id}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body, save: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Check failed");
      setGuard(json.guard);
      if (json.guard.pass) setEditing(false);
      setMessage({
        ok: json.guard.pass,
        text: json.guard.pass ? "Saved. Guards still pass." : "Saved, but guards now block this draft.",
      });
      router.refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (!current) {
    return (
      <Panel>
        <div className="px-6 py-16 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
            <Check size={18} />
          </div>
          <p className="mt-3 text-sm text-ink-200">Queue clear.</p>
          <p className="mt-1 text-xs text-ink-400">Nothing goes out without a person. New drafts land here.</p>
          {message && <p className="mt-3 text-xs text-ink-300">{message.text}</p>}
        </div>
      </Panel>
    );
  }

  const passed = guard?.checks.filter((c) => c.pass).length ?? 0;
  const total = guard?.checks.length ?? 0;
  const guardPass = Boolean(guard?.pass);
  const promptVersion = current.draft.prompt_version_id?.match(/v(\d+)$/)?.[1];

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <Panel className="h-fit">
        <PanelHeader title={`Queue · ${items.length}`} hint="Oldest first" />
        <div className="max-h-[70vh] divide-y divide-ink-700 overflow-y-auto">
          {items.map((i) => (
            <button
              key={i.draft.id}
              onClick={() => setSelectedId(i.draft.id)}
              className={cx(
                "flex w-full items-start gap-2 px-3 py-2.5 text-left transition",
                i.draft.id === current.draft.id ? "bg-ink-800" : "hover:bg-ink-800/50",
              )}
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-ink-700 text-[10px] font-semibold text-ink-200">
                {i.company.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-ink-100">{i.company.name}</div>
                <div className="truncate text-[10px] text-ink-400">{i.draft.subject}</div>
              </div>
              <span className="shrink-0 text-[9px] text-ink-500">{relTime(i.draft.created_at)}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel>
          <PanelHeader
            title="Draft"
            hint={`${current.contact.name} · ${current.contact.title} · ${current.contact.email}`}
            action={
              <div className="flex items-center gap-1.5">
                <Badge tone={current.score.verdict === "qualified" ? "green" : "amber"}>{current.score.total}/100</Badge>
                <Badge tone="neutral" className="whitespace-nowrap">
                  <FileText size={10} /> {promptVersion ? `prompt v${promptVersion}` : "custom prompt"}
                </Badge>
              </div>
            }
          />
          <div className="p-4">
            {editing ? (
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[13px] font-medium text-ink-100 focus:border-lime-400/50 focus:outline-none"
              />
            ) : (
              <div className="text-[13px] font-medium text-ink-100">{subject}</div>
            )}

            <div className="mt-3">
              {editing ? (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className="w-full resize-y rounded-lg border border-ink-600 bg-ink-900 p-3 font-sans text-[12.5px] leading-relaxed text-ink-200 focus:border-lime-400/50 focus:outline-none"
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-300">{body}</pre>
              )}
            </div>

            {!editing && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-700 pt-3">
                <span className="text-[10px] uppercase tracking-wide text-ink-400">Claims</span>
                {current.draft.claims.map((c) => (
                  <EvidenceChip
                    key={c.evidence_id + c.text.slice(0, 8)}
                    evidence={current.evidence.find((e) => e.id === c.evidence_id)}
                    label={current.evidence.find((e) => e.id === c.evidence_id)?.label ?? "source"}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => act("approve")}
                disabled={!guardPass || Boolean(busy) || editing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-3 py-1.5 text-[12px] font-medium text-ink-950 transition hover:bg-lime-500 disabled:cursor-not-allowed disabled:opacity-40"
                title={!guardPass ? "Guards must pass before sending" : undefined}
              >
                {busy === "approve" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Approve & send
              </button>
              {editing ? (
                <>
                  <button
                    onClick={checkRules}
                    disabled={Boolean(busy)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-lime-400/40 bg-lime-400/10 px-3 py-1.5 text-[12px] text-lime-300 hover:bg-lime-400/20 disabled:opacity-50"
                  >
                    {busy === "check" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                    Save & re-check rules
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setSubject(current.draft.subject);
                      setBody(current.draft.body);
                      setGuard(current.draft.guard);
                    }}
                    className="rounded-lg border border-ink-600 px-3 py-1.5 text-[12px] text-ink-300 hover:bg-ink-800"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-[12px] text-ink-300 hover:bg-ink-800"
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
              <div className="relative">
                <button
                  onClick={() => setRejecting((v) => !v)}
                  disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-[12px] text-ink-300 hover:bg-ink-800"
                >
                  <X size={13} /> Reject
                </button>
                {rejecting && (
                  <div className="absolute left-0 top-full z-40 mt-1 w-52 rounded-lg border border-ink-600 bg-ink-850 p-1 shadow-xl">
                    {REJECT_REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => act("reject", r)}
                        className="block w-full rounded px-2 py-1.5 text-left text-[11px] text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="ml-auto text-[10px] text-ink-500">
                {wordCount(body)} words · {fmtDateTime(current.draft.created_at)}
              </span>
            </div>

            {message && (
              <div
                className={cx(
                  "mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                  message.ok
                    ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"
                    : "border-rose-500/25 bg-rose-500/5 text-rose-300",
                )}
              >
                {message.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                {message.text}
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Guard layer"
            hint="Runs on every send, including your edits"
            action={
              <Badge tone={guardPass ? "green" : "red"}>
                {passed}/{total} passing
              </Badge>
            }
          />
          <div className="divide-y divide-ink-700">
            {guard?.checks.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5 px-4 py-2">
                <span
                  className={cx(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                    c.pass ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300",
                  )}
                >
                  {c.pass ? <Check size={10} /> : <X size={10} />}
                </span>
                <div className="min-w-0">
                  <div className="text-[12px] text-ink-200">{c.label}</div>
                  <div className="text-[10.5px] leading-relaxed text-ink-400">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="border-t border-ink-700 px-4 py-2 text-[10px] text-ink-500">
            A person can change the words, not the rules. Price, sourcing and opt-outs are enforced in code.
          </p>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Why this company" hint="Rubric + evidence" action={<VerdictBadge verdict={current.score.verdict} />} />
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-semibold tabular-nums text-ink-100">{current.score.total}</div>
              <div className="flex-1">
                <ScoreBar score={current.score} />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {current.score.reasons.map((r) => (
                <div key={r.label} className="rounded-lg border border-ink-700 bg-ink-900/50 p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] text-ink-200">{r.label}</span>
                    <span className="ml-auto text-[10px] text-ink-400">+{r.points}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-[10.5px] text-ink-400">{r.claim}</span>
                    <EvidenceChip evidence={current.evidence.find((e) => e.id === r.evidence_id)} />
                  </div>
                </div>
              ))}
            </div>
            {current.score.missing.length > 0 && (
              <p className="mt-2 text-[10.5px] text-amber-300">Gaps: {current.score.missing.join(" · ")}</p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Contact" />
          <div className="space-y-1 p-4 text-[12px]">
            <div className="text-ink-100">{current.contact.name}</div>
            <div className="text-ink-400">{current.contact.title}</div>
            <div className="text-ink-300">{current.contact.email}</div>
            <div className="pt-1 text-[10.5px] text-ink-500">
              {current.company.hq} · {current.company.headcount} staff · {current.company.channels}
            </div>
            <button
              onClick={() => router.push(`/companies/${current.company.id}`)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-lime-400 hover:underline"
            >
              Open company <ChevronRight size={11} />
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
