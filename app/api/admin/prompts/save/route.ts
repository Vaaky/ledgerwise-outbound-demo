import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireAdmin } from "@/lib/session";
import { rows, run } from "@/lib/db";
import { insertRows, id } from "@/lib/db/sql";
import type { PromptRow } from "@/lib/types";

async function allPrompts() {
  return rows<PromptRow>(sql`select * from prompts order by agent, block, version desc`);
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  await ensureDb();
  const body = await req.json().catch(() => ({}));
  const promptId = String(body.id ?? "");
  const text = String(body.body ?? "");
  const current = (await rows<any>(sql`select * from prompts where id = ${promptId}`))[0];
  if (!current) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  if (!text.trim()) return NextResponse.json({ error: "Prompt is empty." }, { status: 400 });

  let nextId = promptId;
  if (current.status === "draft") {
    await run(sql`update prompts set body = ${text} where id = ${promptId}`);
  } else {
    const max = (
      await rows<any>(
        sql`select max(version)::int as v from prompts where agent = ${current.agent} and block = ${current.block}`,
      )
    )[0]?.v ?? 0;
    nextId = id("prm");
    await insertRows("prompts", [
      {
        id: nextId,
        agent: current.agent,
        block: current.block,
        version: (max || current.version) + 1,
        body: text,
        status: "draft",
        parent_id: current.id,
        published_at: null,
        published_by: null,
        scorecard: null,
      },
    ]);
    await insertRows("audit", [
      {
        id: id("aud"),
        actor: user.name,
        action: "prompt.draft",
        object_type: "prompt",
        object_id: nextId,
        before: current.id,
        after: "draft",
        ts: new Date().toISOString(),
      },
    ]);
  }

  return NextResponse.json({ id: nextId, prompts: await allPrompts() });
}
