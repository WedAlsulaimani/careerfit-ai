import "server-only";
import { z } from "zod";
import { REQUIREMENT_CATEGORIES, REQUIREMENT_TYPES, MATCH_STATUSES } from "@/lib/schemas/job";
import { RESUME_SECTION_TYPES } from "@/lib/schemas/resume";

/**
 * Model-facing output schemas. They are deliberately free of length/number
 * constraints (structured outputs support a JSON Schema subset); every result
 * is re-validated and semantically checked by application code afterwards.
 */

export const aiJobAnalysisSchema = z.object({
  is_job_posting: z.boolean().describe("False if the text is not a job, internship, program or research opportunity."),
  title: z.string().nullable(),
  employer: z.string().nullable(),
  industry: z.string().nullable(),
  employment_type: z.string().nullable(),
  location: z.string().nullable(),
  seniority: z.string().nullable().describe("Only if explicitly stated."),
  deadline: z.string().nullable().describe("YYYY-MM-DD only if an explicit date is stated."),
  summary: z.string().nullable(),
  requirements: z.array(
    z.object({
      text: z.string(),
      category: z.enum(REQUIREMENT_CATEGORIES),
      type: z.enum(REQUIREMENT_TYPES),
      keywords: z.array(z.string()),
      source_quote: z.string().describe("Verbatim excerpt from the posting that states this requirement."),
    }),
  ),
  responsibilities: z.array(z.string()),
  ats_keywords: z.array(z.string()),
  domain_terms: z.array(z.string()),
  tools: z.array(z.string()),
  eligibility: z.array(z.string()),
  uncertain_fields: z.array(z.object({ field: z.string(), reason: z.string() })),
});
export type AIJobAnalysis = z.infer<typeof aiJobAnalysisSchema>;

export const aiMatchSchema = z.object({
  requirements: z.array(
    z.object({
      requirement_id: z.string(),
      status: z.enum(MATCH_STATUSES),
      evidence_ids: z.array(z.string()),
      reasoning: z.string(),
    }),
  ),
  recommended_evidence_ids: z.array(z.string()),
  supported_keywords: z.array(z.string()),
  clarifying_questions: z.array(z.object({ evidence_id: z.string().nullable(), question: z.string() })),
  improvement_recommendations: z.array(z.string()),
});
export type AIMatch = z.infer<typeof aiMatchSchema>;

const aiBullet = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()),
});

export const aiResumePlanSchema = z.object({
  summary: z
    .object({ text: z.string(), evidence_ids: z.array(z.string()) })
    .nullable(),
  sections: z.array(
    z.object({
      type: z.enum(RESUME_SECTION_TYPES.filter((t) => t !== "summary" && t !== "custom") as [string, ...string[]]),
      items: z.array(
        z.object({
          evidence_id: z.string(),
          bullets: z.array(aiBullet),
        }),
      ),
    }),
  ),
  skill_groups: z.array(z.object({ label: z.string(), skill_ids: z.array(z.string()) })),
  notes_for_user: z.array(z.string()),
});
export type AIResumePlan = z.infer<typeof aiResumePlanSchema>;

export const aiSectionRewriteSchema = z.object({
  summary: z.object({ text: z.string(), evidence_ids: z.array(z.string()) }).nullable(),
  items: z.array(z.object({ evidence_id: z.string(), bullets: z.array(aiBullet) })),
});
export type AISectionRewrite = z.infer<typeof aiSectionRewriteSchema>;
