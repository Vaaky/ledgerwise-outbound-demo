import { getCalls, getThreadViews } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { InboxClient } from "@/components/InboxClient";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const [threads, calls, params] = await Promise.all([getThreadViews(), getCalls(), searchParams]);
  return (
    <div className="animate-in">
      <PageHeader
        title="Inbox"
        subtitle="The agent answers questions, handles objections and books calls. Take over any thread with one click."
      />
      <InboxClient threads={threads} calls={calls.map((c) => c.call)} initialId={params.thread ?? null} />
    </div>
  );
}
