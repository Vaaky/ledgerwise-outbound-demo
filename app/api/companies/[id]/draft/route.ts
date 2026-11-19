import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { draftEmail } from "@/lib/agents";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id } = await params;
  const res = await draftEmail(id, { actor: user.name });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ draft: res.draft, message: "Draft written and queued for review." });
}
