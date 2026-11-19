import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireAdmin } from "@/lib/session";
import { pauseAgent } from "@/lib/agents";

export async function POST(req: Request) {
  const user = await requireAdmin();
  await ensureDb();
  const body = await req.json().catch(() => ({}));
  const key = String(body.key ?? "");
  if (!key) return NextResponse.json({ error: "Missing agent key" }, { status: 400 });
  await pauseAgent(key, Boolean(body.paused), user.name);
  return NextResponse.json({ ok: true });
}
