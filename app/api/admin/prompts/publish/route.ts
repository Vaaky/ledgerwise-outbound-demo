import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireAdmin } from "@/lib/session";
import { rows, run } from "@/lib/db";
import { insertRows, id } from "@/lib/db/sql";
import { runPromptTests } from "@/lib/prompt-tests";

export async function POST(req: Request) {
  const user = await requireAdmin();
  await ensureDb();
  const body = await req.json().catch(() => ({}));
  const promptId = String(body.id ?? "");
  const current = (await rows<any>(sql`select * from prompts where id = ${promptId}`))[0];
  if (!current) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });

  // Publishing requires a passing scorecard. The rules cannot be bypassed by a prompt edit.
  const card = runPromptTests(current.agent, current.block, current.body);
  if (!card.pass) {
    return NextResponse.json(
      { error: "Test bench has failing cases. Fix them before publishing.", scorecard: card },
      { status: 400 },
    );
  }

  const ts = new Date().toISOString();
  await run(
    sql`update prompts set status = 'archived' where agent = ${current.agent} and block = ${current.block} and status = 'published'`,
  );
  await run(
    sql`update prompts set status = 'published', published_at = ${ts}, published_by = ${user.name}, scorecard = ${JSON.stringify(card)} where id = ${promptId}`,
  );
  await insertRows("audit", [
    {
      id: id("aud"),
      actor: user.name,
      action: "prompt.publish",
      object_type: "prompt",
      object_id: promptId,
      before: current.status,
      after: "published",
      ts,
    },
  ]);

  return NextResponse.json({
    ok: true,
    prompts: await rows(sql`select * from prompts order by agent, block, version desc`),
  });
}
