import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { findCompanies } from "@/lib/agents";

export const maxDuration = 60;

export async function POST(req: Request) {
  await requireUser();
  await ensureDb();
  const body = await req.json().catch(() => ({}));
  const brief = String(body.brief ?? "").trim();
  const target = String(body.target ?? body.query ?? "").trim();
  const query = target || brief;
  const result = await findCompanies(query, brief);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
