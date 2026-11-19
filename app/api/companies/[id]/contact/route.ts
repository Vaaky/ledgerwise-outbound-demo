import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db/bootstrap";
import { requireUser } from "@/lib/session";
import { addContact } from "@/lib/agents";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await ensureDb();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const title = String(body.title ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (!name || !title || !email) {
    return NextResponse.json({ error: "Name, title and email are required." }, { status: 400 });
  }
  await addContact(id, { name, title, email }, user.name);
  return NextResponse.json({ ok: true });
}
