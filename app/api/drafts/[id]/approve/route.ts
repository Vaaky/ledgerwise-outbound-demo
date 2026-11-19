import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { sendDraft } from "@/lib/agents";
import { rows } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id } = await params;
  const res = await sendDraft(id, user.name);
  if (!res.ok) {
    return NextResponse.json({ ok: false, guard: res.guard, error: res.error }, { status: 400 });
  }
  await rows(sql`select 1`);
  return NextResponse.json({
    ok: true,
    guard: res.guard,
    simulated: res.simulated,
    message: res.simulated ? "Approved. Send simulated (no email provider key)." : "Approved and sent.",
  });
}
