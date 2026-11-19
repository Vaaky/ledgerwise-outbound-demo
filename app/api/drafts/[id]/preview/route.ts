import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { getEvidence } from "@/lib/agents";
import { guardDraft } from "@/lib/guards";
import { rows, run } from "@/lib/db";
import type { Claim } from "@/lib/types";

const parse = (v: unknown): Claim[] => {
  if (typeof v !== "string") return (v as Claim[]) ?? [];
  try {
    return JSON.parse(v) as Claim[];
  } catch {
    return [];
  }
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await ensureDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").slice(0, 200);
  const text = String(body.body ?? "");
  const draft = (await rows<any>(sql`select * from drafts where id = ${id}`))[0];
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const evidence = await getEvidence(draft.company_id);
  const guard = guardDraft({
    kind: "outreach",
    subject,
    body: text,
    claims: parse(draft.claims),
    evidenceIds: evidence.map((e) => e.id),
    suppressed: false,
  });

  const save = body.save !== false;
  if (save) {
    await run(
      sql`update drafts set subject = ${subject}, body = ${text}, guard = ${JSON.stringify(guard)}, edited = 1 where id = ${id}`,
    );
  }
  return NextResponse.json({ guard, saved: save });
}
