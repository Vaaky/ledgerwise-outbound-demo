/**
 * Guard regression tests. Run with: npm run test:guards
 * These are the five Ledgerwise rules, expressed as executable checks.
 */
import { guardDraft } from "../lib/guards";
import { computeScore } from "../lib/rubric";
import type { Company, Contact, Evidence } from "../lib/types";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  if (pass) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const goodBody = `Hi Dana,

Saw Northwind Supply is hiring a staff accountant — usually the point where the monthly close starts to slip. Selling through Shopify and Amazon means multiple payout reports to reconcile every month.

We run the monthly close for e-commerce brands your size. Worth 15 minutes next week?

Maya Chen
Ledgerwise · monthly bookkeeping for e-commerce brands
Not relevant? Reply "stop" and I won't follow up.`;

const goodClaims = [
  {
    text: "Saw Northwind Supply is hiring a staff accountant — usually the point where the monthly close starts to slip.",
    evidence_id: "e1",
  },
  {
    text: "Selling through Shopify and Amazon means multiple payout reports to reconcile every month.",
    evidence_id: "e2",
  },
];

const base = {
  kind: "outreach" as const,
  body: goodBody,
  claims: goodClaims,
  evidenceIds: ["e1", "e2"],
  suppressed: false,
};

console.log("\nRule 1 — never quote a price");
check("clean email passes", guardDraft(base).pass);
check(
  "dollar amount is blocked",
  !guardDraft({ ...base, body: `${goodBody}\n\nOur fee is $1,500 per month.` }).pass,
);
check(
  "fee wording without a number is blocked in outreach",
  !guardDraft({ ...base, body: `${goodBody}\n\nHappy to talk about our monthly fee.` }).pass,
);
check(
  "reply defers pricing without a number",
  guardDraft({
    kind: "reply",
    body: "Pricing depends on your channels and volume, so we only quote after a short call. I have Thursday at 2pm ET open.",
    claims: [],
    evidenceIds: [],
    suppressed: false,
  }).pass,
);
check(
  "reply that quotes a number is blocked",
  !guardDraft({
    kind: "reply",
    body: "It's $1,500 per month for your size.",
    claims: [],
    evidenceIds: [],
    suppressed: false,
  }).pass,
);

console.log("\nRule 2 — every fact has a source");
check(
  "unsourced funding claim is blocked",
  !guardDraft({ ...base, body: `${goodBody}\n\nYou raised a $6M Series A last quarter.` }).pass,
);
check(
  "claim pointing at an unknown evidence id is blocked",
  !guardDraft({ ...base, claims: [{ text: "Saw Northwind Supply is hiring a staff accountant — usually the point where the monthly close starts to slip.", evidence_id: "missing" }] }).pass,
);

console.log("\nRule 3 — opt-outs are absolute");
check("suppressed contact cannot be sent to", !guardDraft({ ...base, suppressed: true }).pass);

console.log("\nRule 4 — honest bot disclosure");
check(
  "honest disclosure passes",
  guardDraft({
    kind: "reply",
    body: "Yes — I'm an AI assistant working with the Ledgerwise team. A person reviews every first email.",
    claims: [],
    evidenceIds: [],
    suppressed: false,
    botQuestion: true,
  }).pass,
);
check(
  "bot evasion is blocked",
  !guardDraft({
    kind: "reply",
    body: "No, I'm a real person.",
    claims: [],
    evidenceIds: [],
    suppressed: false,
    botQuestion: true,
  }).pass,
);

console.log("\nRule 5 — no invented outcomes");
check(
  "guarantee is blocked",
  !guardDraft({ ...base, body: `${goodBody}\n\nWe guarantee 20 hours saved every month.` }).pass,
);

console.log("\nRubric — hard gates override arithmetic");
const company: Company = {
  id: "c1",
  name: "Foundry & Flint",
  domain: "foundryandflint.com",
  hq: "Detroit, MI",
  revenue_band: "$12.4M",
  revenue_note: "",
  headcount: 64,
  channels: "Shopify, Amazon, Retail",
  status: "researching",
  created_at: new Date().toISOString(),
};
const evidence: Evidence[] = [
  { id: "e1", company_id: "c1", field: "revenue", label: "Revenue", value: "$12.4M", source_url: "https://x.co", source_type: "estimate", quote: "estimate", retrieved_at: new Date().toISOString(), confidence: 0.6, status: "estimated" },
  { id: "e2", company_id: "c1", field: "headcount", label: "Headcount", value: "64", source_url: "https://x.co", source_type: "social", quote: "64", retrieved_at: new Date().toISOString(), confidence: 0.6, status: "estimated" },
  { id: "e3", company_id: "c1", field: "geo", label: "Geo", value: "United States", source_url: "https://x.co", source_type: "site", quote: "US", retrieved_at: new Date().toISOString(), confidence: 0.9, status: "verified" },
  { id: "e4", company_id: "c1", field: "ecommerce", label: "Ecom", value: "Shopify", source_url: "https://x.co", source_type: "storefront", quote: "shopify", retrieved_at: new Date().toISOString(), confidence: 0.9, status: "verified" },
];
const contact: Contact = { id: "p1", company_id: "c1", name: "Wes Harmon", title: "CFO", role_class: "Finance", email: "wes@x.co", evidence_id: "e3" };
const scored = computeScore(company, evidence, contact);
check("out-of-band revenue is rejected even with a contact", scored.verdict === "rejected", scored.verdict);
check(
  "no revenue point awarded outside the band",
  !scored.reasons.some((r) => r.label.includes("Revenue")),
  JSON.stringify(scored.reasons.map((r) => r.label)),
);

console.log(`\n${failures === 0 ? "All guard tests passed." : `${failures} guard test(s) failed.`}\n`);
process.exit(failures === 0 ? 0 : 1);
