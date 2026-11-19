"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FlaskConical,
  Loader2,
  Lock,
  Rocket,
  Save,
  X,
} from "lucide-react";
import type { PromptRow } from "@/lib/types";
import type { Scorecard } from "@/lib/prompt-tests";
import { Badge, Panel, PanelHeader, cx } from "./ui";

const BLOCK_LABEL: Record<string, string> = {
  identity: "Identity",
  task: "Task",
  write: "First email",
  reply: "Reply handling",
  booking: "Booking",
  style: "Style & tone",
};

const AGENT_LABEL: Record<string, string> = {
  orchestrator: "Orchestrator",
  research: "Research",
  qualifier: "Qualifier",
  comms: "Comms",
};

export function PromptStudio({ initialPrompts }: { initialPrompts: PromptRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialPrompts);
  const preferred = useMemo(
    () => initialPrompts.find((p) => p.status === "published" && p.agent === "comms" && p.block === "write") ?? initialPrompts[0],
    [initialPrompts],
  );
  const [selectedId, setSelectedId] = useState(preferred?.id ?? null);
  const [body, setBody] = useState(preferred?.body ?? "");
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const current = items.find((p) => p.id === selectedId) ?? items[0];
  const history = current
    ? items
        .filter((p) => p.agent === current.agent && p.block === current.block)
        .sort((a, b) => b.version - a.version)
    : [];

  useEffect(() => {
    if (!current) return;
    setBody(current.body);
    setScorecard(current.scorecard ? (JSON.parse(current.scorecard) as Scorecard) : null);
    setMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const post = async (path: string, payload: any) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json;
  };

  const save = async () => {
    if (!current) return;
    setBusy("save");
    setMessage(null);
    try {
      const json = await post("/api/admin/prompts/save", { id: current.id, body });
      setItems(json.prompts);
      setSelectedId(json.id);
      setMessage({ ok: true, text: "Saved as a draft. The published version keeps running." });
      router.refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    if (!current) return;
    setBusy("test");
    setMessage(null);
    try {
      const json = await post("/api/admin/prompts/test", { agent: current.agent, block: current.block, body });
      setScorecard(json.scorecard);
      setMessage({
        ok: json.scorecard.pass,
        text: json.scorecard.pass
          ? "All guard cases pass and required clauses are present."
          : "Failing cases — publishing is blocked until they pass.",
      });
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const publish = async (id: string) => {
    setBusy(`publish:${id}`);
    setMessage(null);
    try {
      const json = await post("/api/admin/prompts/publish", { id });
      setItems(json.prompts);
      setMessage({ ok: true, text: "Published. New runs use this version; every draft records it." });
      router.refresh();
    } catch (e: any) {
      setMessage({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (!current) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
      <Panel className="h-fit">
        <PanelHeader title="Prompt blocks" hint="One per job" />
        <div className="max-h-[70vh] divide-y divide-ink-700 overflow-y-auto">
          {["research", "qualifier", "comms", "orchestrator"].map((agent) => {
            const blocks = items.filter((p) => p.agent === agent);
            if (!blocks.length) return null;
            return (
              <div key={agent} className="py-1">
                <div className="px-3 py-1 text-[9.5px] uppercase tracking-wider text-ink-500">{AGENT_LABEL[agent]}</div>
                {[...new Set(blocks.map((b) => b.block))].map((block) => {
                  const published = blocks.find((b) => b.block === block && b.status === "published");
                  const draft = blocks.find((b) => b.block === block && b.status === "draft");
                  const chosen = blocks.find((b) => b.id === selectedId && b.block === block) ?? draft ?? published;
                  if (!chosen) return null;
                  return (
                    <button
                      key={block}
                      onClick={() => setSelectedId(chosen.id)}
                      className={cx(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition",
                        chosen.id === current.id ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-800/50",
                      )}
                    >
                      <span className="flex-1 truncate">{BLOCK_LABEL[block] ?? block}</span>
                      {draft && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="draft exists" />}
                      <span className="text-[9px] text-ink-500">v{published?.version ?? chosen.version}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="border-t border-ink-700 px-3 py-2 text-[9.5px] leading-relaxed text-ink-500">
          <Lock size={10} className="mr-1 inline" />
          Rules are a separate, locked layer. Editing a prompt cannot relax them.
        </div>
      </Panel>

      <div className="min-w-0 space-y-3">
        <Panel>
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink-100">
                  {AGENT_LABEL[current.agent]} · {BLOCK_LABEL[current.block] ?? current.block}
                </span>
                <Badge tone={current.status === "published" ? "green" : current.status === "draft" ? "amber" : "neutral"}>
                  {current.status}
                </Badge>
                <span className="text-[10px] text-ink-500">v{current.version}</span>
              </div>
              <div className="text-[10px] text-ink-500">
                {current.published_at
                  ? `published ${new Date(current.published_at).toLocaleString()} by ${current.published_by}`
                  : "draft — not running anywhere"}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                onClick={save}
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-[11px] text-ink-200 hover:bg-ink-800 disabled:opacity-50"
              >
                {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Save draft
              </button>
              <button
                onClick={test}
                disabled={Boolean(busy)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-lime-400/40 bg-lime-400/10 px-2.5 py-1.5 text-[11px] text-lime-300 hover:bg-lime-400/20 disabled:opacity-50"
              >
                {busy === "test" ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                Test bench
              </button>
              {current.status !== "published" && (
                <button
                  onClick={() => publish(current.id)}
                  disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-2.5 py-1.5 text-[11px] font-medium text-ink-950 hover:bg-lime-500 disabled:opacity-50"
                >
                  {busy === `publish:${current.id}` ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
                  Publish
                </button>
              )}
            </div>
          </div>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={18}
            spellCheck={false}
            className="w-full resize-y bg-ink-900/40 p-4 font-mono text-[11.5px] leading-relaxed text-ink-200 focus:outline-none"
          />

          {message && (
            <div
              className={cx(
                "mx-4 mb-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                message.ok
                  ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-300"
                  : "border-rose-500/25 bg-rose-500/5 text-rose-300",
              )}
            >
              {message.ok ? <Check size={12} /> : <AlertTriangle size={12} />}
              {message.text}
            </div>
          )}
        </Panel>

        {scorecard && (
          <Panel>
            <PanelHeader
              title="Test bench"
              hint="7 adversarial guard cases + clause lint, run before publish"
              action={<Badge tone={scorecard.pass ? "green" : "red"}>{scorecard.pass ? "passing" : "failing"}</Badge>}
            />
            <div className="divide-y divide-ink-700">
              {scorecard.cases.map((c) => (
                <div key={c.id} className="flex items-start gap-2 px-4 py-1.5">
                  <span
                    className={cx(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      c.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300",
                    )}
                  >
                    {c.ok ? <Check size={10} /> : <X size={10} />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] text-ink-200">
                      {c.name} <span className="text-ink-500">· expected {c.expected}</span>
                    </div>
                    <div className="text-[10px] text-ink-400">{c.detail}</div>
                  </div>
                </div>
              ))}
              {!scorecard.lint.ok && (
                <div className="px-4 py-2 text-[10.5px] text-amber-300">
                  Missing required clauses: {scorecard.lint.missing.join(", ")}
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="space-y-3">
        <Panel>
          <PanelHeader title="Version history" hint="Publish any version to roll back" />
          <div className="divide-y divide-ink-700">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-2 px-3 py-2">
                <button onClick={() => setSelectedId(h.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] text-ink-200">v{h.version}</span>
                    <Badge tone={h.status === "published" ? "green" : h.status === "draft" ? "amber" : "neutral"}>
                      {h.status}
                    </Badge>
                  </div>
                  <div className="text-[9.5px] text-ink-500">
                    {h.published_at ? new Date(h.published_at).toLocaleDateString() : "never published"}
                  </div>
                </button>
                {h.status !== "published" && (
                  <button
                    onClick={() => publish(h.id)}
                    disabled={Boolean(busy)}
                    className="rounded border border-ink-600 px-1.5 py-0.5 text-[9.5px] text-ink-300 hover:bg-ink-800"
                  >
                    Publish
                  </button>
                )}
                <ChevronRight size={11} className="text-ink-600" />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Guardrails always on" />
          <ul className="space-y-1.5 p-3 text-[10.5px] leading-relaxed text-ink-400">
            <li>· No price, fee or currency in any outbound draft.</li>
            <li>· Every factual sentence must map to an evidence id.</li>
            <li>· Suppressed contacts are blocked at the send function.</li>
            <li>· Bot questions must be answered honestly.</li>
            <li>· Low confidence routes to a human, never to a guess.</li>
          </ul>
          <a href="/admin/rules" className="block border-t border-ink-700 px-3 py-2 text-[10.5px] text-lime-400 hover:underline">
            Open the rules layer →
          </a>
        </Panel>
      </div>
    </div>
  );
}
