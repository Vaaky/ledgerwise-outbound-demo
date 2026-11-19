import type { Company, Contact, Evidence, Reason } from "./types";

export interface ScoreResult {
  fit: number;
  intent: number;
  total: number;
  verdict: "qualified" | "needs_review" | "rejected";
  reasons: Reason[];
  missing: string[];
  confidence: number;
}

export function revenueInBand(value: string): boolean {
  const m = value.match(/\$?\s*([\d.]+)\s*([MmKk])/);
  if (!m) return false;
  const n = parseFloat(m[1]) * (m[2].toLowerCase() === "m" ? 1 : 0.001);
  return n >= 0.8 && n <= 11;
}

export function headcountInBand(value: string, fallback: number): boolean {
  const n = Number(value.replace(/[^\d]/g, "")) || fallback;
  return n >= 5 && n <= 50;
}

/**
 * Code-owned rubric. Prompts can explain a score, but they cannot change the
 * math. Every awarded point points at an evidence row, and hard gates override
 * the total.
 */
export function computeScore(
  company: Company,
  evidence: Evidence[],
  contact: Contact | null,
): ScoreResult {
  const by = (field: string) => evidence.find((e) => e.field === field);
  const reasons: Reason[] = [];
  const missing: string[] = [];
  let fit = 0;
  let intent = 0;

  const award = (
    ev: Evidence | undefined,
    dimension: "fit" | "intent",
    label: string,
    points: number,
    claim: string,
  ) => {
    if (!ev) return;
    if (dimension === "fit") fit += points;
    else intent += points;
    reasons.push({ dimension, label, points, claim, evidence_id: ev.id });
  };

  // Fit — 60 points.
  const rev = by("revenue");
  if (!rev) {
    missing.push("Revenue band (no source)");
  } else if (revenueInBand(rev.value)) {
    award(rev, "fit", "Revenue in the $1–10M band", 20, rev.value);
  } else {
    missing.push(`Revenue outside $1–10M (${rev.value})`);
  }

  const hc = by("headcount");
  if (!hc) {
    missing.push("Headcount (no source)");
  } else if (headcountInBand(hc.value, company.headcount)) {
    award(hc, "fit", "5–50 employees", 10, `${hc.value} employees`);
  } else {
    missing.push(`Headcount outside 5–50 (${hc.value})`);
  }

  const geo = by("geo");
  const isUS = Boolean(geo && /united states|\bus\b/i.test(geo.value));
  if (!geo) missing.push("US location (no source)");
  else if (isUS) award(geo, "fit", "US-based", 10, "US headquarters");
  else missing.push(`Not US-based (${geo.value})`);

  const ecom = by("ecommerce");
  if (ecom) award(ecom, "fit", "Sells online", 10, ecom.value);
  else missing.push("Online storefront (no source)");

  const complexity = by("complexity");
  if (complexity) award(complexity, "fit", "Multi-channel bookkeeping need", 10, complexity.value);

  // Intent — 40 points, freshness-limited in research.
  const hiring = by("trigger_hiring");
  const funding = by("trigger_funding");
  const expansion = by("trigger_expansion");
  if (hiring) award(hiring, "intent", "Hiring finance / ops", 15, hiring.value);
  if (funding) award(funding, "intent", "Recently raised", 15, funding.value);
  if (expansion) award(expansion, "intent", "Expanding channels", 10, expansion.value);
  if (!hiring && !funding && !expansion) missing.push("A reason to reach out now");
  if (!contact) missing.push("A named founder / COO / finance contact");

  const total = fit + intent;
  let verdict: ScoreResult["verdict"] = total >= 65 ? "qualified" : total >= 45 ? "needs_review" : "rejected";

  // Hard gates override the arithmetic.
  if (!contact || !(hiring || funding || expansion)) verdict = "needs_review";
  if (geo && !isUS) verdict = "rejected";
  if (rev && !revenueInBand(rev.value)) verdict = "rejected";
  if (hc && !headcountInBand(hc.value, company.headcount)) verdict = "rejected";

  const confidences = evidence.map((e) => e.confidence);
  const avg = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const estimatedPenalty = evidence.some((e) => e.status === "estimated") ? 0.12 : 0;
  const confidence = Math.max(0, Math.min(0.99, Number((avg - estimatedPenalty).toFixed(2))));

  return { fit, intent, total, verdict, reasons, missing, confidence };
}
