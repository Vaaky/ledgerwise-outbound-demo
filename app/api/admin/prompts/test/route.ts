import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { runPromptTests } from "@/lib/prompt-tests";

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const agent = String(body.agent ?? "comms");
  const block = String(body.block ?? "write");
  const text = String(body.body ?? "");
  return NextResponse.json({ scorecard: runPromptTests(agent, block, text) });
}
