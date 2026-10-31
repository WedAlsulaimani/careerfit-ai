import { z } from "zod";
import { isSafeHttpUrl, optDate, optText, reqText } from "./common";

export const REQUIREMENT_CATEGORIES = ["mandatory", "preferred", "contextual"] as const;
export const REQUIREMENT_TYPES = [
  "education",
  "technical_skill",
  "soft_skill",
  "experience",
  "certification",
  "language",
  "tool",
  "eligibility",
  "responsibility",
  "other",
] as const;

export const SOURCE_TYPES = ["url", "image", "qr", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------
export const manualJobSchema = z.object({
  title: reqText(300),
  organization: optText(300),
  description: optText(20000),
  responsibilities: optText(8000),
  required_skills: optText(4000),
  preferred_skills: optText(4000),
  education_requirements: optText(2000),
  experience_requirements: optText(2000),
  languages: optText(1000),
  location: optText(300),
  employment_type: optText(120),
  additional_requirements: optText(4000),
  deadline: optDate,
  source_url: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(2048).refine(isSafeHttpUrl, "invalid_url").nullable(),
  ),
});
export type ManualJobInput = z.infer<typeof manualJobSchema>;

export const textIntakeSchema = z.object({
  source_type: z.enum(["image", "qr"]),
  text: z.string().trim().min(40, "text_too_short").max(60000),
  meta: z
    .object({
      ocr_confidence: z.number().min(0).max(100).optional(),
      low_confidence_words: z.array(z.string().max(100)).max(200).optional(),
      ocr_languages: z.array(z.string().max(10)).max(4).optional(),
    })
    .default({}),
});

export const urlIntakeSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  via: z.enum(["url", "qr"]).default("url"),
});

// ---------------------------------------------------------------------------
// Job analysis (stored, user-editable). The AI output schema lives in
// src/server/ai/schemas.ts and is converted into this shape after validation.
// ---------------------------------------------------------------------------
export const requirementSchema = z.object({
  id: z.string().regex(/^r\d{1,3}$/),
  text: reqText(600),
  category: z.enum(REQUIREMENT_CATEGORIES),
  type: z.enum(REQUIREMENT_TYPES),
  keywords: z.array(z.string().trim().min(1).max(80)).max(15).default([]),
  source_quote: z.string().max(800).nullable().default(null),
  /** false when the quote could not be located in the source text. */
  quote_verified: z.boolean().default(false),
});
export type Requirement = z.infer<typeof requirementSchema>;

const strArr = (max: number, len = 200) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);

export const jobAnalysisSchema = z.object({
  is_job_posting: z.boolean(),
  title: optText(300),
  employer: optText(300),
  industry: optText(200),
  employment_type: optText(120),
  location: optText(300),
  seniority: optText(120),
  deadline: optDate,
  summary: optText(2000),
  requirements: z.array(requirementSchema).max(80),
  responsibilities: strArr(40, 600),
  ats_keywords: strArr(60, 80),
  domain_terms: strArr(40, 80),
  tools: strArr(60, 80),
  eligibility: strArr(20, 400),
  uncertain_fields: z
    .array(z.object({ field: z.string().max(80), reason: z.string().max(400) }))
    .max(30)
    .default([]),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

// ---------------------------------------------------------------------------
// Match result (stored)
// ---------------------------------------------------------------------------
export const MATCH_STATUSES = ["strong", "partial", "missing"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const requirementMatchSchema = z.object({
  requirement_id: z.string(),
  status: z.enum(MATCH_STATUSES),
  evidence_ids: z.array(z.string()),
  reasoning: z.string().max(1200),
  /** Set when the validator changed what the model returned. */
  adjusted: z.string().nullable().default(null),
});
export type RequirementMatch = z.infer<typeof requirementMatchSchema>;

export const matchResultSchema = z.object({
  requirements: z.array(requirementMatchSchema),
  recommended_evidence_ids: z.array(z.string()),
  supported_keywords: z.array(z.string()),
  unsupported_keywords: z.array(z.string()),
  clarifying_questions: z.array(z.object({ evidence_id: z.string().nullable(), question: z.string() })),
  improvement_recommendations: z.array(z.string()),
  score: z.object({
    overall: z.number(),
    mandatory_coverage: z.number().nullable(),
    preferred_coverage: z.number().nullable(),
    mandatory_count: z.number(),
    preferred_count: z.number(),
    method: z.literal("heuristic_v1"),
  }),
  evidence_titles: z.record(z.string(), z.string()),
});
export type MatchResult = z.infer<typeof matchResultSchema>;
