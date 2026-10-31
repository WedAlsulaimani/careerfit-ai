import type { EvidenceRecord } from "@/lib/evidence/catalog";
import { containsTerm, normalizeText } from "@/lib/evidence/text";
import type { JobAnalysis, MatchResult, RequirementMatch } from "@/lib/schemas/job";

export interface RawMatch {
  requirements: { requirement_id: string; status: "strong" | "partial" | "missing"; evidence_ids: string[]; reasoning: string }[];
  recommended_evidence_ids: string[];
  supported_keywords: string[];
  clarifying_questions: { evidence_id: string | null; question: string }[];
  improvement_recommendations: string[];
}

/** Requirement types that need an explicit record of the same kind. */
const STRICT_TYPES: Record<string, EvidenceRecord["kind"][]> = {
  certification: ["certification"],
  education: ["education"],
  language: ["language", "certification"],
};

/**
 * Validates the model's matching output against real profile records.
 *  - unknown evidence ids are removed,
 *  - "strong"/"partial" without any valid evidence becomes "missing",
 *  - certification / degree / language requirements need a record of that kind,
 *  - requirements the model skipped are reported as "missing (not assessed)",
 *  - keywords are only "supported" if they appear in the candidate's records.
 */
export function validateMatch(raw: RawMatch, analysis: JobAnalysis, records: EvidenceRecord[]): MatchResult {
  const index = new Map(records.map((r) => [r.id, r]));
  const byReq = new Map(raw.requirements.map((m) => [m.requirement_id, m]));

  const requirements: RequirementMatch[] = analysis.requirements.map((req) => {
    const m = byReq.get(req.id);
    if (!m) {
      return {
        requirement_id: req.id,
        status: "missing",
        evidence_ids: [],
        reasoning: "",
        adjusted: "not_assessed",
      };
    }
    const evidenceIds = [...new Set(m.evidence_ids)].filter((id) => index.has(id));
    let status = m.status;
    let adjusted: string | null = null;

    if (status !== "missing" && evidenceIds.length === 0) {
      status = "missing";
      adjusted = "no_valid_evidence";
    }

    const strictKinds = STRICT_TYPES[req.type];
    if (strictKinds && status === "strong") {
      const hasKind = evidenceIds.some((id) => strictKinds.includes(index.get(id)!.kind));
      if (!hasKind) {
        status = "partial";
        adjusted = "requires_explicit_record";
      }
    }

    return {
      requirement_id: req.id,
      status,
      evidence_ids: status === "missing" ? [] : evidenceIds,
      reasoning: m.reasoning.slice(0, 1200),
      adjusted,
    };
  });

  const allEvidenceText = records.map((r) => r.text).join("\n");
  const seen = new Set<string>();
  const jobKeywords = [...analysis.ats_keywords, ...analysis.tools].filter((k) => {
    const key = normalizeText(k);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // A keyword counts as supported only if it literally occurs in the profile
  // records; the model's own `supported_keywords` claim is not trusted.
  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const kw of jobKeywords) {
    if (containsTerm(allEvidenceText, kw)) supported.push(kw);
    else unsupported.push(kw);
  }

  const recommended = [...new Set(raw.recommended_evidence_ids)].filter((id) => index.has(id));

  const evidenceTitles: Record<string, string> = {};
  for (const r of requirements) for (const id of r.evidence_ids) evidenceTitles[id] = index.get(id)!.title;
  for (const id of recommended) evidenceTitles[id] = index.get(id)!.title;

  return {
    requirements,
    recommended_evidence_ids: recommended,
    supported_keywords: supported,
    unsupported_keywords: unsupported,
    clarifying_questions: raw.clarifying_questions
      .slice(0, 6)
      .map((q) => ({
        evidence_id: q.evidence_id && index.has(q.evidence_id) ? q.evidence_id : null,
        question: q.question.slice(0, 500),
      })),
    improvement_recommendations: raw.improvement_recommendations.slice(0, 6).map((s) => s.slice(0, 500)),
    score: computeScore(analysis, requirements),
    evidence_titles: evidenceTitles,
  };
}

/**
 * Internal heuristic — NOT an ATS score and NOT a hiring prediction.
 * Coverage = (strong + 0.5 × partial) / count, per category.
 * Overall = 70% mandatory coverage + 30% preferred coverage
 * (or 100% of whichever category exists). Contextual items are excluded.
 */
export function computeScore(analysis: JobAnalysis, matches: RequirementMatch[]): MatchResult["score"] {
  const byId = new Map(matches.map((m) => [m.requirement_id, m]));
  const coverage = (category: "mandatory" | "preferred") => {
    const reqs = analysis.requirements.filter((r) => r.category === category);
    if (reqs.length === 0) return { value: null as number | null, count: 0 };
    let points = 0;
    for (const r of reqs) {
      const status = byId.get(r.id)?.status ?? "missing";
      points += status === "strong" ? 1 : status === "partial" ? 0.5 : 0;
    }
    return { value: Math.round((points / reqs.length) * 1000) / 10, count: reqs.length };
  };
  const mandatory = coverage("mandatory");
  const preferred = coverage("preferred");
  let overall = 0;
  if (mandatory.value !== null && preferred.value !== null) overall = mandatory.value * 0.7 + preferred.value * 0.3;
  else overall = mandatory.value ?? preferred.value ?? 0;
  return {
    overall: Math.round(overall * 10) / 10,
    mandatory_coverage: mandatory.value,
    preferred_coverage: preferred.value,
    mandatory_count: mandatory.count,
    preferred_count: preferred.count,
    method: "heuristic_v1",
  };
}
