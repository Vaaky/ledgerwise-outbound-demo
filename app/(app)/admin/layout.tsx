import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { ensureDb } from "@/lib/db/bootstrap";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/prompts", label: "Prompts" },
  { href: "/admin/rules", label: "Rules & guardrails" },
  { href: "/admin/runs", label: "Runs" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  await ensureDb();
  return (
    <div className="animate-in">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">Admin console</div>
      <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-md px-2.5 py-1 text-[11px] text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
          >
            {t.label}
          </Link>
        ))}
        <span className="ml-auto px-2 text-[10px] text-ink-500">owner-only · every change audited</span>
      </div>
      {children}
    </div>
  );
}
