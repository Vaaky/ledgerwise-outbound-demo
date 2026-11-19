"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, Sparkles } from "lucide-react";

interface Found {
  companyId: string;
  name: string;
  domain: string;
  status: string;
  score?: number;
}

const DEFAULT_BRIEF =
  "US e-commerce brands on Shopify or Amazon, roughly $1M–$10M revenue and 5–50 employees. Prefer a founder, COO or finance lead as the contact. Strong timing signals: hiring finance/accounting/ops, recent funding, or expanding into Amazon, wholesale, retail or new countries.";

export function CompanySearch() {
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Found[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || (!brief.trim() && !target.trim())) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setResults([]);
    try {
      const res = await fetch("/api/research/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief, target }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setResults(json.results ?? []);
      setMessage(json.message ?? null);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-lime-400" />
        <h2 className="text-sm font-medium text-ink-100">Find companies with the research agent</h2>
        <span className="ml-auto text-[10px] text-ink-500">web search → crawl → score</span>
      </div>

      <form onSubmit={submit} className="mt-3 space-y-2">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="Describe the companies you want…"
          className="w-full resize-y rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-[11px] leading-relaxed text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Optional: a specific company or domain, e.g. allbirds.com"
              className="w-full rounded-lg border border-ink-600 bg-ink-900 py-2 pl-8 pr-3 text-xs text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
            />
          </div>
          <button
            disabled={busy || (!brief.trim() && !target.trim())}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-lime-400 px-3 py-2 text-xs font-medium text-ink-950 transition hover:bg-lime-500 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {busy ? "Searching the web…" : "Search the web"}
          </button>
        </div>
      </form>

      <p className="mt-2 text-[10px] leading-relaxed text-ink-500">
        The agent searches Tavily (if configured), DuckDuckGo or Bing, crawls candidate storefronts plus
        their about, careers and contact pages, then scores them against this brief. Missing contacts and
        out-of-band companies go to a human instead of being guessed. For reliable name search, add a free
        TAVILY_API_KEY.
      </p>

      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      {message && <p className="mt-2 text-[11px] text-ink-300">{message}</p>}

      {results.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border border-ink-700">
          {results.map((r) => (
            <Link
              key={r.companyId}
              href={`/companies/${r.companyId}`}
              className="flex items-center gap-3 border-b border-ink-700/70 px-3 py-2 last:border-b-0 hover:bg-ink-800/60"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-ink-100">{r.name}</div>
                <div className="truncate text-[10px] text-ink-400">{r.domain}</div>
              </div>
              {typeof r.score === "number" && (
                <span className="text-[10px] tabular-nums text-ink-300">{r.score}/100</span>
              )}
              <span className="rounded-full border border-ink-600 px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink-400">
                {r.status.replace(/_/g, " ")}
              </span>
              <ArrowRight size={12} className="text-ink-500" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
