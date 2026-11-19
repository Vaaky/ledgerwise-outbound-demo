import { getReviewQueue } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ReviewClient } from "@/components/ReviewClient";

export default async function ReviewPage() {
  const items = await getReviewQueue();
  return (
    <div className="animate-in">
      <PageHeader
        title="Review"
        subtitle="Every first email waits here. Approve, edit, or reject — and see the exact source behind every claim."
      />
      <ReviewClient initialItems={items} />
    </div>
  );
}
