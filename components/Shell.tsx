"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarCheck2,
  LogOut,
  MailCheck,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { User } from "@/lib/types";
import { cx } from "./ui";

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/review", label: "Review", icon: MailCheck, badge: "reviews" as const },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare, badge: "escalations" as const },
  { href: "/calls", label: "Calls", icon: CalendarCheck2 },
  { href: "/stats", label: "Statistics", icon: BarChart3 },
];

export function Shell({
  user,
  pendingReviews,
  escalations,
  llmMode,
  paused,
  children,
}: {
  user: User;
  pendingReviews: number;
  escalations: number;
  llmMode: "live" | "mock";
  paused: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const item = (href: string, label: string, Icon: typeof Sun, badge?: number, admin = false) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        className={cx(
          "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition",
          active
            ? "bg-ink-800 text-ink-100"
            : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100",
        )}
      >
        <Icon size={15} className={cx(active ? "text-lime-400" : "text-ink-400 group-hover:text-ink-300")} />
        <span className="flex-1">{label}</span>
        {badge ? (
          <span className="rounded-full bg-lime-400/15 px-1.5 text-[10px] font-semibold text-lime-300">
            {badge}
          </span>
        ) : admin ? (
          <ShieldCheck size={12} className="text-ink-400" />
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900 md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400 text-[13px] font-bold text-ink-950">
            L
          </div>
          <div>
            <div className="text-[13px] font-semibold leading-tight text-ink-100">Ledgerwise</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-400">Outbound agent</div>
          </div>
        </div>

        <div className="px-2">
          <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-ink-400">Workspace</div>
          {NAV.map((n) =>
            item(n.href, n.label, n.icon, n.badge === "reviews" ? pendingReviews : n.badge === "escalations" ? escalations : undefined),
          )}
        </div>

        {user.role === "admin" && (
          <div className="mt-4 px-2">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-ink-400">Admin</div>
            {item("/admin", "Control room", Settings2, undefined, true)}
          </div>
        )}

        <div className="mt-auto border-t border-ink-700 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-700 text-[10px] font-semibold text-ink-200">
              {user.name
                .split(" ")
                .map((p) => p[0])
                .join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-ink-200">{user.name}</div>
              <div className="text-[10px] capitalize text-ink-400">{user.role}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-md p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-ink-700 bg-ink-950/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-lime-400 text-[11px] font-bold text-ink-950">
              L
            </div>
          </div>
          <div className="hidden text-[11px] text-ink-400 md:block">
            Demo workspace <span className="mx-1 text-ink-600">·</span> synthetic company corpus, real pipeline
          </div>
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto md:hidden">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "rounded-md p-1.5",
                    active ? "bg-ink-800 text-lime-400" : "text-ink-400",
                  )}
                  title={n.label}
                >
                  <Icon size={16} />
                </Link>
              );
            })}
            {user.role === "admin" && (
              <Link href="/admin" className="rounded-md p-1.5 text-ink-400" title="Admin">
                <Settings2 size={16} />
              </Link>
            )}
            <button onClick={logout} className="rounded-md p-1.5 text-ink-400" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {paused && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                Outbound paused
              </span>
            )}
            <span
              className={cx(
                "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:inline-flex",
                llmMode === "live"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-ink-600 bg-ink-800 text-ink-300",
              )}
              title={
                llmMode === "live"
                  ? "Generating with a live model; guards still enforce every rule"
                  : "Deterministic mock model — no API key needed"
              }
            >
              <span className={cx("h-1.5 w-1.5 rounded-full", llmMode === "live" ? "bg-emerald-400" : "bg-ink-400")} />
              {llmMode === "live" ? "Live model" : "Mock model"}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
