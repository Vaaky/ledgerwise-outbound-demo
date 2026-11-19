"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bot,
  CalendarCheck2,
  Check,
  Download,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import type { ThreadView } from "@/lib/queries";
import type { CallRow } from "@/lib/types";
import { fmtDateTime, relTime } from "@/lib/format";
import { Badge, Panel, StatusBadge, cx } from "./ui";

const SIMULATIONS = [
  "How much does this cost per month?",
  "Are you a bot?",
  "Sounds good — Thursday at 2pm works.",
  "We already have a bookkeeper in-house.",
  "Not interested, take me off your list.",
  "Can you send more information?",
];

const CLASS_TONE: Record<string, "green" | "amber" | "red" | "blue" | "violet" | "neutral"> = {
  interested: "green",
  booking: "green",
  price: "amber",
  objection: "amber",
  bot: "blue",
  opt_out: "red",
  complaint: "red",
  referral: "violet",
  other: "neutral",
};

export function InboxClient({
  threads,
  calls,
  initialId,
}: {
  threads: ThreadView[];
  calls: CallRow[];
  initialId: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(threads);
  const [selectedId, setSelectedId] = useState(initialId ?? threads[0]?.thread.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [reply, setReply] = useState("");
  const [custom, setCustom] = useState("");

  const signature = threads.map((t) => `${t.thread.id}:${t.thread.state}:${t.messages.length}`).join(",");
  useEffect(() => {
    setItems(threads);
    if (!threads.find((t) => t.thread.id === selectedId)) setSelectedId(threads[0]?.thread.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const current = items.find((t) => t.thread.id === selectedId) ?? items[0];
  const call = current ? calls.find((c) => c.thread_id === current.thread.id) : undefined;

  const mutate = async (path: string, body: any, label: string, okText: (json: any) => string) => {
    setBusy(label);
    setResult(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult({ ok: true, text: okText(json) });
      setReply("");
      router.refresh();
    } catch (e: any) {
      setResult({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const simulate = (text: string) =>
    mutate(`/api/threads/${current.thread.id}/simulate`, { text }, "simulate", (json) => {
      const r = json.result;
      if (r.action === "suppressed") return `Classified as opt-out → contact suppressed permanently. ${r.reason ?? ""}`;
      if (r.action === "escalated") return `Escalated to a human: ${r.reason}`;
      if (r.action === "booked") return "Agent booked the call and sent a confirmation.";
      if (r.action === "silent") return "Agent stayed silent — thread is owned by a human.";
      return `Agent replied (${r.label}).`;
    });

  const takeover = (on: boolean) =>
    mutate(`/api/threads/${current.thread.id}/takeover`, { on }, "takeover", () =>
      on ? "You own this thread. The agent is muted." : "Handed back to the agent.",
    );

  const sendReply = () =>
    mutate(`/api/threads/${current.thread.id}/reply`, { body: reply }, "reply", () => "Reply sent as you.");

  if (!current) {
    return <Panel><div className="px-6 py-16 text-center text-sm text-ink-400">No conversations yet.</div></Panel>;
  }

  const human = current.thread.state === "human";
  const optedOut = current.thread.state === "opted_out";

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="h-fit">
        <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
          <span className="text-[12px] font-medium text-ink-100">Conversations · {items.length}</span>
          <span className="text-[10px] text-ink-400">agent + human</span>
        </div>
        <div className="max-h-[72vh] divide-y divide-ink-700 overflow-y-auto">
          {items.map((t) => {
            const last = t.messages.at(-1);
            return (
              <button
                key={t.thread.id}
                onClick={() => {
                  setSelectedId(t.thread.id);
                  setResult(null);
                }}
                className={cx(
                  "block w-full px-3 py-2.5 text-left transition",
                  t.thread.id === current.thread.id ? "bg-ink-800" : "hover:bg-ink-800/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12px] text-ink-100">{t.company.name}</span>
                  <span className="ml-auto shrink-0">
                    <StatusBadge status={t.thread.state} />
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] text-ink-400">
                  {last?.direction === "in" ? "↩ " : "→ "}
                  {last?.body.replace(/^Subject:.*\n\n/, "").slice(0, 64)}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="min-w-0 space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink-100">{current.company.name}</span>
                <StatusBadge status={current.thread.state} />
                {current.thread.handoff_reason && <Badge tone="amber">{current.thread.handoff_reason}</Badge>}
              </div>
              <div className="text-[11px] text-ink-400">
                {current.contact.name} · {current.contact.title} · {current.contact.email}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => takeover(!human)}
                disabled={Boolean(busy) || optedOut}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] transition disabled:opacity-40",
                  human
                    ? "border border-ink-600 text-ink-300 hover:bg-ink-800"
                    : "bg-lime-400 font-medium text-ink-950 hover:bg-lime-500",
                )}
              >
                {busy === "takeover" ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeftRight size={12} />}
                {human ? "Hand back to agent" : "Take over"}
              </button>
            </div>
          </div>

          {optedOut && (
            <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/5 px-4 py-2 text-[11px] text-rose-300">
              <ShieldAlert size={13} />
              Suppressed at the data layer. The agent cannot contact this person again, and neither can a campaign.
            </div>
          )}

          <div className="max-h-[52vh] space-y-3 overflow-y-auto p-4">
            {current.messages.map((m) => {
              const out = m.direction === "out";
              return (
                <div key={m.id} className={cx("flex gap-2", out ? "justify-end" : "justify-start")}>
                  {!out && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-700 text-ink-300">
                      <User size={12} />
                    </div>
                  )}
                  <div className={cx("max-w-[78%]", out && "text-right")}>
                    <div
                      className={cx(
                        "whitespace-pre-wrap rounded-xl border px-3 py-2 text-left text-[12px] leading-relaxed",
                        out
                          ? "border-lime-400/20 bg-lime-400/[0.06] text-ink-200"
                          : "border-ink-600 bg-ink-900 text-ink-200",
                      )}
                    >
                      {m.body}
                    </div>
                    <div className={cx("mt-1 flex items-center gap-1.5 text-[9.5px] text-ink-500", out && "justify-end")}>
                      <span>{m.sent_by}</span>
                      <span>·</span>
                      <span>{relTime(m.created_at)}</span>
                      {m.classification && (
                        <Badge tone={CLASS_TONE[m.classification] ?? "neutral"}>{m.classification.replace(/_/g, " ")}</Badge>
                      )}
                    </div>
                  </div>
                  {out && (
                    <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lime-400/15 text-lime-300">
                      {m.sent_by.includes("agent") ? <Bot size={12} /> : <User size={12} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {result && (
            <div
              className={cx(
                "mx-4 mb-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                result.ok
                  ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"
                  : "border-rose-500/25 bg-rose-500/5 text-rose-300",
              )}
            >
              {result.ok ? <Check size={12} /> : <ShieldAlert size={12} />}
              {result.text}
            </div>
          )}

          {call && (
            <div className="mx-4 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <CalendarCheck2 size={14} className="text-emerald-300" />
              <span className="text-[12px] text-ink-200">{fmtDateTime(call.slot_start)} ET</span>
              <Badge tone="green">{call.status}</Badge>
              <a
                href={`/api/calls/${call.id}/ics`}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-lime-400 hover:underline"
              >
                <Download size={11} /> .ics
              </a>
            </div>
          )}

          {human && !optedOut && (
            <div className="border-t border-ink-700 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder="You own this thread. Write as yourself — the agent stays silent."
                  className="flex-1 resize-y rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[12px] text-ink-100 placeholder:text-ink-500 focus:border-lime-400/50 focus:outline-none"
                />
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-3 py-2 text-[11px] font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-40"
                >
                  {busy === "reply" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Send
                </button>
              </div>
            </div>
          )}
        </Panel>

        {!optedOut && !human && (
          <Panel>
            <div className="flex items-center gap-2 border-b border-ink-700 px-4 py-2.5">
              <Sparkles size={13} className="text-lime-400" />
              <span className="text-[12px] font-medium text-ink-100">Simulate an inbound reply</span>
              <span className="ml-auto text-[10px] text-ink-500">no inbound mailbox wired in the demo</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-3">
              {SIMULATIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => simulate(s)}
                  disabled={Boolean(busy)}
                  className="rounded-full border border-ink-600 px-2.5 py-1 text-[10.5px] text-ink-300 transition hover:border-lime-400/40 hover:text-lime-300 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="px-3 pb-3 text-[10px] leading-relaxed text-ink-500">
              The agent classifies, applies policy, runs the guard layer, and either replies, books, suppresses, or
              escalates. Try the buttons, or type your own reply below.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = custom.trim();
                if (!text) return;
                setCustom("");
                simulate(text);
              }}
              className="flex gap-2 border-t border-ink-700 p-3"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Type a custom prospect reply…"
                disabled={Boolean(busy)}
                className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-[11px] text-ink-100 placeholder:text-ink-500 focus:border-lime-400/50 focus:outline-none disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={!custom.trim() || Boolean(busy)}
                className="rounded-lg border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-[11px] font-medium text-lime-300 transition hover:bg-lime-400/15 disabled:opacity-40"
              >
                {busy === "simulate" ? <Loader2 size={12} className="animate-spin" /> : "Send"}
              </button>
            </form>
          </Panel>
        )}
      </div>
    </div>
  );
}
