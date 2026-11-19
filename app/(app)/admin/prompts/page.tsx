import { sql } from "drizzle-orm";
import { rows } from "@/lib/db";
import { ensureDb } from "@/lib/db/bootstrap";
import type { PromptRow } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { PromptStudio } from "@/components/PromptStudio";

export default async function PromptsPage() {
  await ensureDb();
  const prompts = await rows<PromptRow>(
    sql`select * from prompts order by agent, block, version desc`,
  );
  return (
    <div>
      <PageHeader
        title="Prompt studio"
        subtitle="Draft, test against adversarial cases, publish, canary, roll back. Drafts never run; published versions are pinned to the drafts they produced."
      />
      <PromptStudio initialPrompts={prompts} />
    </div>
  );
}
