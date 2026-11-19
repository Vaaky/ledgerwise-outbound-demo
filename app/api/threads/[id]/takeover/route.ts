import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { humanReply, takeOver } from "@/lib/agents";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  await takeOver(id, Boolean(body.on), user.name);
  return NextResponse.json({ ok: true, state: body.on ? "human" : "engaged" });
}
