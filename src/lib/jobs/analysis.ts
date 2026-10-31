import { jobAnalysisSchema, type JobAnalysis } from "@/lib/schemas/job";
import { quoteAppearsIn } from "@/lib/evidence/text";

export interface RawJobAnalysis {
  is_job_posting: boolean;
  title: string | null;
  employer: string | null;
  industry: string | null;
  employment_type: string | null;
  location: string | null;
  seniority: string | null;
  deadline: string | null;
  summary: string | null;
  requirements: {
    text: string;
    category: JobAnalysis["requirements"][number]["category"];
    type: JobAnalysis["requirements"][number]["type"];
    keywords: string[];
    source_quote: string;
  }[];
  responsibilities: string[];
  ats_keywords: string[];
  domain_terms: string[];
  tools: string[];
  eligibility: string[];
  uncertain_fields: { field: string; reason: string }[];
}

const clip = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

const cleanList = (items: string[], maxItems: number, maxLen: number) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const t = item.trim().slice(0, maxLen);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
};

/**
 * Converts model output into the stored JobAnalysis:
 *  - assigns stable requirement ids,
 *  - verifies each source quote against the original text (unverifiable
 *    requirements are kept but flagged for the user to confirm),
 *  - drops an explicit deadline that is not a valid date or not in the source,
 *  - clamps lengths so the result always satisfies the strict schema.
 */
export function normalizeJobAnalysis(raw: RawJobAnalysis, sourceText: string): JobAnalysis {
  const uncertain = [...raw.uncertain_fields];

  const requirements = raw.requirements
    .filter((r) => r.text.trim())
    .slice(0, 80)
    .map((r, i) => {
      const quote = clip(r.source_quote, 800);
      const verified = quote ? quoteAppearsIn(quote, sourceText) : false;
      return {
        id: `r${i + 1}`,
        text: r.text.trim().slice(0, 600),
        category: r.category,
        type: r.type,
        keywords: cleanList(r.keywords, 15, 80),
        source_quote: quote,
        quote_verified: verified,
      };
    });

  const unverified = requirements.filter((r) => !r.quote_verified).length;
  if (unverified > 0) {
    uncertain.push({
      field: "requirements",
      reason: `${unverified} requirement(s) could not be matched to the original text. Please confirm them.`,
    });
  }

  let deadline = clip(raw.deadline, 10);
  if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)))) {
    uncertain.push({ field: "deadline", reason: `Unrecognised deadline value "${deadline}" was removed.` });
    deadline = null;
  }

  return jobAnalysisSchema.parse({
    is_job_posting: raw.is_job_posting,
    title: clip(raw.title, 300),
    employer: clip(raw.employer, 300),
    industry: clip(raw.industry, 200),
    employment_type: clip(raw.employment_type, 120),
    location: clip(raw.location, 300),
    seniority: clip(raw.seniority, 120),
    deadline,
    summary: clip(raw.summary, 2000),
    requirements,
    responsibilities: cleanList(raw.responsibilities, 40, 600),
    ats_keywords: cleanList(raw.ats_keywords, 60, 80),
    domain_terms: cleanList(raw.domain_terms, 40, 80),
    tools: cleanList(raw.tools, 60, 80),
    eligibility: cleanList(raw.eligibility, 20, 400),
    uncertain_fields: uncertain
      .slice(0, 30)
      .map((u) => ({ field: u.field.slice(0, 80), reason: u.reason.slice(0, 400) })),
  });
}

/** All job terms that generated resume content must not claim without evidence. */
export function jobWatchTerms(a: JobAnalysis): string[] {
  return [...a.ats_keywords, ...a.tools, ...a.requirements.flatMap((r) => r.keywords)];
}

/** Text sent to the AI for analysis, built from structured manual entry. */
export function composeManualJobText(input: {
  title: string;
  organization: string | null;
  description: string | null;
  responsibilities: string | null;
  required_skills: string | null;
  preferred_skills: string | null;
  education_requirements: string | null;
  experience_requirements: string | null;
  languages: string | null;
  location: string | null;
  employment_type: string | null;
  additional_requirements: string | null;
  deadline: string | null;
  source_url: string | null;
}): string {
  const parts: [string, string | null][] = [
    ["Job title", input.title],
    ["Organization", input.organization],
    ["Location", input.location],
    ["Employment type", input.employment_type],
    ["Application deadline", input.deadline],
    ["Description", input.description],
    ["Responsibilities", input.responsibilities],
    ["Required skills (mandatory)", input.required_skills],
    ["Preferred skills (nice to have)", input.preferred_skills],
    ["Education requirements", input.education_requirements],
    ["Experience requirements", input.experience_requirements],
    ["Language requirements", input.languages],
    ["Additional requirements", input.additional_requirements],
    ["Original advertisement URL", input.source_url],
  ];
  return parts
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}:\n${v!.trim()}`)
    .join("\n\n");
}
