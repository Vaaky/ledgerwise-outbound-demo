"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

export function CompanyActions({
  companyId,
  canDraft,
  hasDraft,
  draftPending,
}: {
  companyId: string;
  canDraft: boolean;
  hasDraft: boolean;
  draftPending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const call = async (path: string, body?: any) => {
    setBusy(path);
    setMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setMessage(json.message ?? "Done");
      router.refresh();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => call(`/api/companies/${companyId}/qualify`)}
          disabled={Boolean(busy)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-[11px] text-ink-200 transition hover:border-ink-500 hover:bg-ink-800 disabled:opacity-50"
        >
          {busy?.includes("qualify") ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Re-score
        </button>
        {canDraft && (
          <button
            onClick={() => call(`/api/companies/${companyId}/draft`)}
            disabled={Boolean(busy)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-2.5 py-1.5 text-[11px] font-medium text-ink-950 transition hover:bg-lime-500 disabled:opacity-50"
          >
            {busy?.includes("draft") ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {hasDraft ? "Write another draft" : "Write first email"}
          </button>
        )}
      </div>
      {draftPending && (
        <a href="/review" className="block text-[11px] text-lime-400 hover:underline">
          Draft is waiting in Review →
        </a>
      )}
      {message && <p className="text-[11px] text-ink-300">{message}</p>}
    </div>
  );
}

export function AddContactForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/companies/${companyId}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          title: fd.get("title"),
          email: fd.get("email"),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save contact");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[11px] leading-relaxed text-amber-300">
        Research could not source a decision-maker. A person has to add one — the agent is not allowed to guess.
      </p>
      <input
        name="name"
        required
        placeholder="Full name"
        className="w-full rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
      />
      <input
        name="title"
        required
        placeholder="Title (COO, Founder, Controller)"
        className="w-full rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
      />
      <input
        name="email"
        required
        type="email"
        placeholder="Work email"
        className="w-full rounded-lg border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-100 placeholder:text-ink-400 focus:border-lime-400/50 focus:outline-none"
      />
      <button
        disabled={busy}
        className="w-full rounded-lg bg-lime-400 px-3 py-1.5 text-[11px] font-medium text-ink-950 transition hover:bg-lime-500 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Add contact and re-score"}
      </button>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </form>
  );
}
