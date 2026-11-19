import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { researchDomain } from "@/lib/agents";

export const maxDuration = 60;

export async function POST(req: Request) {
  await requireUser();
  await ensureDb();
  const body = await req.json().catch(() => ({}));
  const result = await researchDomain(String(body.domain ?? ""));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ companyId: result.companyId });
}
