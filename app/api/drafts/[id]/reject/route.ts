import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { rows, run } from "@/lib/db";
import { insertRows, id as newId } from "@/lib/db/sql";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id: draftId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "No reason given");
  const draft = (await rows<any>(sql`select * from drafts where id = ${draftId}`))[0];
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  await run(
    sql`update drafts set status = 'rejected', rejection_reason = ${reason}, approved_by = ${user.name} where id = ${draftId}`,
  );
  await insertRows("audit", [
    {
      id: newId("aud"),
      actor: user.name,
      action: "draft.reject",
      object_type: "draft",
      object_id: draftId,
      before: "pending",
      after: `rejected: ${reason}`,
      ts: new Date().toISOString(),
    },
  ]);
  return NextResponse.json({ ok: true, message: "Rejected. The reason feeds the eval set." });
}
