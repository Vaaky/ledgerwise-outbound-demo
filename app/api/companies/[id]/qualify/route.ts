import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { qualifyCompany } from "@/lib/agents";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureDb();
  const { id } = await params;
  const score = await qualifyCompany(id, "human:reviewer");
  return NextResponse.json({ score, message: `Scored ${score.total}/100 (${score.verdict}).` });
}
