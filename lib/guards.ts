import type { Claim, GuardCheck, GuardResult } from "./types";

export interface GuardInput {
  kind: "outreach" | "reply";
  subject?: string;
  body: string;
  claims: Claim[];
  evidenceIds: string[];
  suppressed: boolean;
  botQuestion?: boolean;
}

const CURRENCY = /(\$|£|€)\s?\d|\b\d[\d,.]*\s?(usd|dollars|k\b)/i;
const PRICE_WORDS = /\b(price|pricing|cost|costs|fee|fees|rate|rates|per month|monthly retainer|retainer)\b/i;
const SANCTIONED_PRICE =
  /pricing (depends|is discussed|is covered|comes up)[^.]*\.|we only quote after[^.]*\.|pricing is discussed on a call[^.]*\./i;
const OUTCOME_PROMISE = /\b(guarantee|guaranteed|double your|triple your|save you \$\d|risk[- ]free|no[- ]brainer)\b/i;
const BOT_EVASION = /\b(real (person|human)|definitely human|not a bot|i am human|i'm human)\b/i;
const IDENTIFICATION = /\b(ledgerwise|bookkeeping)\b/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[“”"'’]/g, "").trim();
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Factual-looking sentences (numbers, funding, hiring, revenue) must be backed by a claim. */
export function unsupportedSentences(body: string, claims: Claim[], strict = true): string[] {
  const claimText = claims.map((c) => norm(c.text)).join(" || ");
  const sentences = body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const factualWords = strict
    ? /\b(raised|funding|series [a-d]|hiring|employees|headcount|revenue|launched|expanded|wholesale|marketplace)\b/i
    : /\b(raised|funding|series [a-d]|hiring|employees|headcount|revenue|launched|expanded)\b/i;
  return sentences.filter((sentence) => {
    const looksFactual =
      /(\$|£|€)\s?\d|\b\d+(\.\d+)?\s?(m|k|million|billion|%|percent|employees|people|staff|customers|orders)\b/i.test(
        sentence,
      ) || factualWords.test(sentence);
    if (!looksFactual) return false;
    return !claimText.includes(norm(sentence));
  });
}

export function guardDraft(input: GuardInput): GuardResult {
  const checks: GuardCheck[] = [];
  const { body, claims, evidenceIds, kind } = input;
  const push = (id: string, label: string, pass: boolean, detail: string) =>
    checks.push({ id, label, pass, detail });

  // 1. No pricing.
  const priceHit = body.match(CURRENCY) || (kind === "reply" ? null : body.match(PRICE_WORDS));
  let pricePass = !priceHit;
  let priceDetail = pricePass
    ? "No currency, fee or price language."
    : `Blocked term: "${priceHit?.[0]}". Pricing is only discussed on a call.`;
  if (kind === "reply" && !CURRENCY.test(body) && PRICE_WORDS.test(body)) {
    const stripped = body.replace(new RegExp(SANCTIONED_PRICE.source, "gi"), "");
    if (!PRICE_WORDS.test(stripped)) {
      pricePass = true;
      priceDetail = "Mentions pricing only to defer it to a call.";
    }
  }
  push("price", "Never quote a price", pricePass, priceDetail);

  // 2. Every claim is bound to stored evidence.
  const badClaims = claims.filter((c) => !evidenceIds.includes(c.evidence_id));
  const unbound = unsupportedSentences(body, claims, kind !== "reply");
  const claimsPass = badClaims.length === 0 && unbound.length === 0;
  push(
    "claims",
    "Every fact has a source",
    claimsPass,
    claimsPass
      ? `${claims.length} claim${claims.length === 1 ? "" : "s"} bound to ${new Set(claims.map((c) => c.evidence_id)).size} evidence record(s).`
      : `${badClaims.length} claim(s) without evidence; unsourced: ${unbound.slice(0, 2).join(" / ") || "—"}`,
  );

  // 3. Suppression.
  push(
    "suppression",
    "Respect opt-outs",
    !input.suppressed,
    input.suppressed
      ? "Contact or domain is on the suppression list. Send is hard-blocked."
      : "Contact and domain are clear of the suppression list.",
  );

  // 4. Honest bot disclosure.
  if (kind === "reply") {
    const evasive = BOT_EVASION.test(body);
    const discloses = /(\bai\b|automated|assistant|bot\b)/i.test(body);
    const pass = !evasive && (!input.botQuestion || discloses);
    push(
      "disclosure",
      "Answer bot questions honestly",
      pass,
      pass
        ? input.botQuestion
          ? "Discloses that the sender is an AI assistant."
          : "No evasive human claims."
        : "Evades or denies being an AI assistant. Blocked.",
    );
  }

  // 5. Length.
  const wc = wordCount(body);
  const limit = kind === "outreach" ? 130 : 170;
  push("length", `Keep it under ${limit} words`, wc <= limit, `${wc} words.`);

  // 6. Identification / signature.
  if (kind === "outreach") {
    push(
      "signature",
      "Identify the sender",
      IDENTIFICATION.test(body),
      IDENTIFICATION.test(body)
        ? "Ledgerwise signature and opt-out line present."
        : "Missing sender identification.",
    );
  }

  // 7. No outcome promises.
  const promise = body.match(OUTCOME_PROMISE);
  push(
    "promise",
    "No outcome promises",
    !promise,
    promise ? `Blocked phrase: "${promise[0]}".` : "No guarantees or fabricated savings.",
  );

  return { pass: checks.every((c) => c.pass), checks };
}

export function guardSummary(result: GuardResult): string {
  const failed = result.checks.filter((c) => !c.pass);
  if (!failed.length) return "All guards passed";
  return `${failed.length} guard${failed.length === 1 ? "" : "s"} failed: ${failed
    .map((f) => f.label)
    .join(", ")}`;
}
