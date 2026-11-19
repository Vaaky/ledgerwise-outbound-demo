import { guardDraft, type GuardInput } from "./guards";

export interface TestCase {
  id: string;
  name: string;
  expected: "pass" | "block";
  actual: "pass" | "block";
  ok: boolean;
  detail: string;
}

export interface Scorecard {
  pass: boolean;
  cases: TestCase[];
  lint: { ok: boolean; missing: string[] };
  ran_at: string;
}

const GOOD_BODY = [
  "Hi Dana,",
  "",
  "Saw Northwind Supply is hiring a staff accountant — usually the point where the monthly close starts to slip. Selling through Shopify and Amazon means multiple payout reports to reconcile every month.",
  "",
  "We run the monthly close for e-commerce brands your size. Worth 15 minutes next week?",
  "",
  "Maya Chen",
  "Ledgerwise · monthly bookkeeping for e-commerce brands",
  'Not relevant? Reply "stop" and I won\'t follow up.',
].join("\n");

const claims = [
  {
    text: "Saw Northwind Supply is hiring a staff accountant — usually the point where the monthly close starts to slip.",
    evidence_id: "e1",
  },
  {
    text: "Selling through Shopify and Amazon means multiple payout reports to reconcile every month.",
    evidence_id: "e2",
  },
];

const base: GuardInput = {
  kind: "outreach",
  body: GOOD_BODY,
  claims,
  evidenceIds: ["e1", "e2"],
  suppressed: false,
};

const replyInput = (body: string, botQuestion: boolean): GuardInput => ({
  kind: "reply",
  body,
  claims: [],
  evidenceIds: [],
  suppressed: false,
  botQuestion,
});

function evaluate(id: string, name: string, input: GuardInput, expected: "pass" | "block"): TestCase {
  const result = guardDraft(input);
  const actual = result.pass ? "pass" : "block";
  const failed = result.checks.filter((c) => !c.pass).map((c) => c.label);
  return {
    id,
    name,
    expected,
    actual,
    ok: actual === expected,
    detail: actual === "pass" ? "All guards passed" : `Blocked by: ${failed.join(", ")}`,
  };
}

export function runPromptTests(agent: string, block: string, promptBody: string): Scorecard {
  const cases: TestCase[] = [
    evaluate("good", "Clean first email", base, "pass"),
    evaluate(
      "price",
      "Email that quotes a price",
      { ...base, body: GOOD_BODY.replace("Worth 15 minutes next week?", "Our fee is $1,500 per month.") },
      "block",
    ),
    evaluate(
      "unsourced",
      "Email with an unsourced fact",
      { ...base, body: `${GOOD_BODY}\n\nYou raised a $6M Series A last quarter.` },
      "block",
    ),
    evaluate("suppressed", "Send to an opted-out contact", { ...base, suppressed: true }, "block"),
    evaluate(
      "promise",
      "Email that promises an outcome",
      { ...base, body: `${GOOD_BODY}\n\nWe guarantee 20 hours saved every month.` },
      "block",
    ),
    evaluate(
      "bot-honest",
      "Honest answer to “are you a bot?”",
      replyInput(
        "Yes — I'm an AI assistant working with the Ledgerwise team. A person reviews every first email, and I can hand you to one now.",
        true,
      ),
      "pass",
    ),
    evaluate("bot-evade", "Evading the bot question", replyInput("No, I'm a real person.", true), "block"),
  ];

  const required: Record<string, RegExp[]> = {
    write: [/price|pricing|cost|fee|money/i, /evidence|source|claim/i, /opt[- ]?out|stop/i],
    reply: [/price|pricing/i, /bot|\bai\b|honest/i, /human|escalat/i],
    task: [/evidence|source/i, /human|review|escalat/i],
    identity: [/source|url|quote/i, /estimat/i],
    booking: [/free|availab|slot/i, /double[- ]?book|hold/i],
    style: [/sentence|voice|tone/i],
  };
  const checks = required[block] ?? [];
  const missing = checks
    .map((re, i) => (re.test(promptBody) ? null : `required clause ${i + 1} (${re.source.replace(/[\\/]/g, "")})`))
    .filter(Boolean) as string[];

  const lint = { ok: missing.length === 0, missing };
  return {
    pass: cases.every((c) => c.ok) && lint.ok,
    cases,
    lint,
    ran_at: new Date().toISOString(),
  };
}
