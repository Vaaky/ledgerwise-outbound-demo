import { sql } from "drizzle-orm";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { llmMode } from "@/lib/llm";
import { Shell } from "@/components/Shell";

export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await ensureDb();

  const [pending, escalations, pausedRow] = await Promise.all([
    rows<any>(sql`select count(*)::int as n from drafts where status = 'pending'`),
    rows<any>(sql`select count(*)::int as n from threads where state in ('needs_human','human')`),
    rows<any>(sql`select value from settings where key = 'paused:outbound'`),
  ]);

  return (
    <Shell
      user={user}
      pendingReviews={pending[0]?.n ?? 0}
      escalations={escalations[0]?.n ?? 0}
      llmMode={llmMode()}
      paused={pausedRow[0]?.value === "1"}
    >
      {children}
    </Shell>
  );
}
