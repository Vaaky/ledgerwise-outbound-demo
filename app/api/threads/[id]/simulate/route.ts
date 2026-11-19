import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { respond } from "@/lib/agents";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Nothing to simulate." }, { status: 400 });
  const result = await respond(id, text);
  return NextResponse.json({ result });
}
