import { sql } from "drizzle-orm";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import { getCompany, getContact } from "@/lib/agents";
import { buildIcs } from "@/lib/ics";
import type { CallRow } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await params;
  const call = (await rows<CallRow>(sql`select * from calls where id = ${id}`))[0];
  if (!call) return new Response("Not found", { status: 404 });
  const company = await getCompany(call.company_id);
  const contact = await getContact(call.company_id);
  if (!company || !contact) return new Response("Not found", { status: 404 });
  const ics = buildIcs(call, company, contact, call.thread_id);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="ledgerwise-${company.name.toLowerCase().replace(/\s+/g, "-")}.ics"`,
    },
  });
}
