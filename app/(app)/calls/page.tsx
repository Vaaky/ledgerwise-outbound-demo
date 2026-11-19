import Link from "next/link";
import { CalendarCheck2, Download, ExternalLink, Video } from "lucide-react";
import { getCalls } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { googleCalendarUrl } from "@/lib/ics";

export default async function CallsPage() {
  const calls = await getCalls();
  const upcoming = calls.filter((c) => new Date(c.call.slot_start).getTime() >= Date.now() - 86400000);
  const past = calls.filter((c) => new Date(c.call.slot_start).getTime() < Date.now() - 86400000);

  return (
    <div className="animate-in">
      <PageHeader
        title="Calls"
        subtitle="Real free slots, held, then booked. Every call here was created from a conversation, not a spreadsheet."
        action={
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <Video size={13} />
            Google Meet link attached on confirmation
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-medium text-ink-100">Upcoming · {upcoming.length}</h2>
            <Badge tone="green">calendar synced</Badge>
          </div>
          {upcoming.length === 0 && <Empty title="No upcoming calls." hint="Simulate “Thursday at 2pm works” in Inbox." />}
          <div className="divide-y divide-ink-700">
            {upcoming.map(({ call, company, contact }) => (
              <div key={call.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                    <CalendarCheck2 size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/companies/${company.id}`} className="text-[13px] font-medium text-ink-100 hover:text-lime-300">
                        {company.name}
                      </Link>
                      <StatusBadge status={call.status} />
                    </div>
                    <div className="text-[11px] text-ink-400">
                      {fmtDateTime(call.slot_start)} ET · 15 min · {contact?.name} ({contact?.title})
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {contact && (
                      <a
                        href={googleCalendarUrl(call, company, contact)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-ink-600 px-2 py-1 text-[10.5px] text-ink-300 hover:bg-ink-800"
                      >
                        <ExternalLink size={10} /> Add to Google
                      </a>
                    )}
                    <a
                      href={`/api/calls/${call.id}/ics`}
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-600 px-2 py-1 text-[10.5px] text-ink-300 hover:bg-ink-800"
                    >
                      <Download size={10} /> .ics
                    </a>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-10 text-[10px] text-ink-500">
                  <Badge tone="violet">booked from thread</Badge>
                  <span>agenda: what you sell · where the books hurt · fit</span>
                  {call.thread_id && (
                    <Link href={`/inbox?thread=${call.thread_id}`} className="text-lime-400 hover:underline">
                      open thread
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-medium text-ink-100">How booking works</h2>
          </div>
          <ol className="space-y-3 p-4 text-[11.5px] leading-relaxed text-ink-300">
            {[
              "Agent reads free/busy on the connected calendar for the next 10 business days.",
              "It offers 2–3 real slots in the prospect's timezone and holds the chosen one for 30 minutes.",
              "On confirmation it creates the event with the company, contact, thread link and a 3-line agenda.",
              "If the slot was taken in the meantime, it re-offers instead of double-booking.",
              "No booking without a confirmed Ledgerwise attendee.",
            ].map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[9px] text-ink-300">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
          <p className="border-t border-ink-700 px-4 py-2 text-[10px] text-ink-500">
            Demo uses a calendar provider abstraction with real .ics generation. Swapping in Google Calendar OAuth is
            one adapter.
          </p>
        </Panel>
      </div>

      {past.length > 0 && (
        <Panel className="mt-4">
          <div className="border-b border-ink-700 px-4 py-3">
            <h2 className="text-sm font-medium text-ink-100">Past</h2>
          </div>
          <div className="divide-y divide-ink-700">
            {past.map(({ call, company }) => (
              <div key={call.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-[12px] text-ink-200">{company.name}</span>
                <span className="text-[11px] text-ink-400">{fmtDateTime(call.slot_start)} ET</span>
                <span className="ml-auto">
                  <StatusBadge status={call.status} />
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
