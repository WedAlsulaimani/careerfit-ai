import type { EvidenceRecord } from "./catalog";
import { containsTerm, extractNumbers, normalizeText } from "./text";

/**
 * Anti-hallucination checks for generated statements. A statement is checked
 * against the records it cites:
 *  - every cited id must exist,
 *  - every number must appear in the cited records,
 *  - every job keyword / known skill it mentions must appear in the cited records,
 *  - certification / licence claims require a certification record or explicit text.
 */
export interface ClaimCheck {
  validRefs: string[];
  invalidRefs: string[];
  flags: string[];
  /** True when the statement should not be used without user review. */
  needsReview: boolean;
  /** True when the statement has no valid evidence at all and must be rejected. */
  rejected: boolean;
}

const CERT_CLAIM = /\b(certified|certificate|certification|licensed|licence|license|accredited)\b|شهاده|معتمد|مرخص|رخصه/;

export interface ClaimContext {
  index: Map<string, EvidenceRecord>;
  /** Job terms (keywords, tools) that must not be claimed without support. */
  watchTerms: string[];
}

export function checkClaim(text: string, refs: string[], ctx: ClaimContext): ClaimCheck {
  const validRefs = [...new Set(refs)].filter((r) => ctx.index.has(r));
  const invalidRefs = refs.filter((r) => !ctx.index.has(r));
  const flags: string[] = [];

  if (validRefs.length === 0) {
    return { validRefs, invalidRefs, flags: ["no_evidence"], needsReview: true, rejected: true };
  }

  const evidence = validRefs.map((r) => ctx.index.get(r)!);
  const evidenceText = evidence.map((e) => e.text).join("\n");
  const normEvidence = normalizeText(evidenceText);
  const evidenceNumbers = new Set(extractNumbers(evidenceText));

  for (const n of extractNumbers(text)) {
    if (!evidenceNumbers.has(n) && !normEvidence.includes(n)) flags.push(`unsupported_number:${n}`);
  }

  for (const term of ctx.watchTerms) {
    if (term.length < 2) continue;
    if (containsTerm(text, term) && !containsTerm(evidenceText, term)) {
      flags.push(`unsupported_term:${term}`);
    }
  }

  if (CERT_CLAIM.test(normalizeText(text))) {
    const hasCertRecord = evidence.some((e) => e.kind === "certification");
    if (!hasCertRecord && !CERT_CLAIM.test(normEvidence)) flags.push("unsupported_certification_claim");
  }

  if (invalidRefs.length) flags.push(`unknown_reference:${invalidRefs.length}`);

  return { validRefs, invalidRefs, flags, needsReview: flags.length > 0, rejected: false };
}

/** Builds the list of terms that generated text may not mention without support. */
export function buildWatchTerms(jobTerms: string[], records: EvidenceRecord[]): string[] {
  const set = new Map<string, string>();
  for (const t of jobTerms) {
    const key = normalizeText(t);
    if (key.length >= 2 && key.length <= 60) set.set(key, t.trim());
  }
  // Skills recorded by the user are also watch terms: they are fine when the
  // cited record mentions them, and flagged when attached to unrelated records.
  for (const r of records) {
    if (r.kind === "skill") {
      const key = normalizeText(r.title);
      if (key.length >= 2 && key.length <= 60) set.set(key, r.title.trim());
    }
  }
  return [...set.values()];
}
