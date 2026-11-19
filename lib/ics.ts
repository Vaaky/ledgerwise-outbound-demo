import type { CallRow, Company, Contact } from "./types";

function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z/, "Z");
}

export function buildIcs(call: CallRow, company: Company, contact: Contact, threadId: string | null): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ledgerwise//Outbound Demo//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${call.id}@ledgerwise.demo`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(call.slot_start)}`,
    `DTEND:${stamp(call.slot_end)}`,
    `SUMMARY:Ledgerwise intro call — ${company.name}`,
    `DESCRIPTION:15 minutes. ${contact.name} (${contact.title}) at ${company.name}.\\nAgenda: what you sell, where the books hurt, whether we are a fit.\\nThread: ${threadId ?? "n/a"}`,
    "LOCATION:Google Meet (link to follow)",
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Ledgerwise call in 15 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function googleCalendarUrl(call: CallRow, company: Company, contact: Contact): string {
  const dates = `${stamp(call.slot_start)}/${stamp(call.slot_end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Ledgerwise intro call — ${company.name}`,
    dates,
    details: `15 minutes with ${contact.name} (${contact.title}) at ${company.name}. Agenda: what you sell, where the books hurt, whether we are a fit.`,
    location: "Google Meet (link to follow)",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
