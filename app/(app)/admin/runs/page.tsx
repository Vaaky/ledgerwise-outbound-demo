import Link from "next/link";
import { sql } from "drizzle-orm";
import { Check, X } from "lucide-react";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import { relTime } from "@/lib/format";
import { Badge, PageHeader, Panel } from "@/components/ui";

export default async function RunsPage() {
  await ensureDb();
  const runs = await rows<any>(sql`select * from runs order by created_at desc limit 60`);
  return (
    <div>
      <PageHeader
        title="Runs"
        subtitle="A readable trace per job: what was read, what the agent produced, which guard decided, and what a human approved."
      />
      <Panel className="divide-y divide-ink-700">
        {runs.map((r) => {
          const steps = JSON.parse(r.steps || "[]") as any[];
          return (
            <details key={r.id} className="group px-4 py-2.5">
              <summary className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{r.kind}</Badge>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-200">{r.label}</span>
                <span className="text-[10px] text-ink-500">{r.tokens} tokens</span>
                <span className="text-[10px] text-ink-500">{relTime(r.created_at)}</span>
              </summary>
              <div className="mt-2 space-y-1 border-l border-ink-700 pl-3">
                {steps.map((s, i) => (
                  <div key={i} className="text-[11px] text-ink-400">
                    <span className={s.ok ? "text-emerald-400" : "text-amber-300"}>
                      {s.ok ? <Check size={10} className="inline" /> : <X size={10} className="inline" />}
                    </span>{" "}
                    {s.text}
                    {s.tool && <span className="ml-1 font-mono text-[9.5px] text-ink-500">[{s.tool}]</span>}
                  </div>
                ))}
                {r.company_id && (
                  <Link href={`/companies/${r.company_id}`} className="text-[10px] text-lime-400 hover:underline">
                    open company →
                  </Link>
                )}
              </div>
            </details>
          );
        })}
        {runs.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-400">No runs yet.</p>}
      </Panel>
    </div>
  );
}
