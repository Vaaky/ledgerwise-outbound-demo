import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { humanReply } from "@/lib/agents";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Reply is empty." }, { status: 400 });
  await humanReply(id, text, user.name);
  return NextResponse.json({ ok: true });
}
