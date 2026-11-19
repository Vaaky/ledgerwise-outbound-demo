"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";
import { cx } from "./ui";

export function PauseToggle({
  agentKey,
  paused,
  compact = false,
}: {
  agentKey: string;
  paused: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: agentKey, paused: !paused }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] transition disabled:opacity-50",
        paused
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15"
          : "border-ink-600 text-ink-300 hover:bg-ink-800",
        compact && "px-1.5",
      )}
      title={paused ? "Resume agent" : "Pause agent"}
    >
      {busy ? (
        <Loader2 size={11} className="animate-spin" />
      ) : paused ? (
        <Play size={11} />
      ) : (
        <Pause size={11} />
      )}
      {compact ? null : paused ? "Resume" : "Pause"}
    </button>
  );
}
