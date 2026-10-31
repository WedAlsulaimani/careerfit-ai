import { z } from "zod";
import { bool, optBool, optDate, optEnum, optText, optUrl, reqText, strList } from "./common";

// ---------------------------------------------------------------------------
// Enumerations (kept in sync with CHECK constraints in the SQL migration)
// ---------------------------------------------------------------------------
export const EXPERIENCE_KINDS = [
  "full_time",
  "part_time",
  "internship",
  "freelance",
  "research_assistant",
  "teaching_assistant",
  "volunteer",
  "club_leadership",
  "student_org",
  "community_service",
  "other",
] as const;

export const PROJECT_CATEGORIES = [
  "university",
  "capstone",
  "personal",
  "research",
  "industry",
  "open_source",
  "hackathon",
  "collaborative",
  "other",
] as const;

export const GPA_SCALES = ["4.0", "5.0", "percentage", "custom"] as const;
export const PROFICIENCY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const PUBLICATION_KINDS = [
  "journal",
  "conference",
  "poster",
  "presentation",
  "thesis",
  "collaboration",
  "participation",
  "other",
] as const;
export const PUBLICATION_STATUSES = [
  "published",
  "accepted",
  "under_review",
  "in_preparation",
  "presented",
  "not_published",
] as const;
export const CERTIFICATION_KINDS = [
  "certification",
  "course",
  "workshop",
  "training",
  "language_test",
  "standardized_exam",
] as const;
export const ACHIEVEMENT_KINDS = [
  "award",
  "competition",
  "scholarship",
  "academic_excellence",
  "volunteer",
  "leadership",
  "patent_application",
  "patent_granted",
  "innovation",
  "hackathon",
  "entrepreneurship",
  "other",
] as const;
export const LANGUAGE_LEVELS = ["native", "fluent", "advanced", "intermediate", "basic"] as const;
export const WORK_ARRANGEMENTS = ["onsite", "remote", "hybrid"] as const;

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------
export const otherLinkSchema = z.object({
  label: reqText(60),
  url: z.string().trim().max(500).refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === "https:" || p === "http:";
    } catch {
      return false;
    }
  }, "invalid_url"),
});

export const personalSchema = z.object({
  full_name_en: optText(200),
  full_name_ar: optText(200),
  headline: optText(200),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email().max(320).nullable(),
  ),
  phone_country_code: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .regex(/^\+?\d{1,4}$/, "invalid_phone_code")
      .nullable(),
  ),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .regex(/^[\d\s()-]{4,20}$/, "invalid_phone")
      .nullable(),
  ),
  city: optText(120),
  country: optText(120),
  linkedin_url: optUrl,
  portfolio_url: optUrl,
  github_url: optUrl,
  other_links: z.array(otherLinkSchema).max(10).default([]),
  date_of_birth: optDate,
  nationality: optText(120),
  summary: optText(4000),
  include_dob_in_resume: bool,
  include_nationality_in_resume: bool,
});
export type PersonalInput = z.infer<typeof personalSchema>;

export const goalsSchema = z.object({
  target_titles: strList(20, 120, true),
  industries: strList(20, 120, true),
  specializations: strList(20, 120, true),
  interests: strList(20, 120, true),
  work_arrangements: z.array(z.enum(WORK_ARRANGEMENTS)).max(3).default([]),
  preferred_locations: strList(20, 120, true),
  willing_to_relocate: optBool,
  objective: optText(2000),
});
export type GoalsInput = z.infer<typeof goalsSchema>;

// ---------------------------------------------------------------------------
// Repeatable sections
// ---------------------------------------------------------------------------
const dateOrder = <T extends { start_date: string | null; end_date: string | null }>(v: T) =>
  !v.start_date || !v.end_date || v.end_date >= v.start_date;
const dateOrderIssue = { message: "end_before_start", path: ["end_date"] };

export const educationSchema = z
  .object({
    institution: reqText(200),
    degree_type: optText(120),
    major: optText(200),
    minor: optText(200),
    start_date: optDate,
    end_date: optDate,
    is_expected: bool,
    gpa: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
      z.number().min(0).max(1000).nullable(),
    ),
    gpa_scale: optEnum(GPA_SCALES),
    gpa_scale_custom: optText(40),
    honors: optText(500),
    coursework: strList(60, 120, true),
    thesis: optText(2000),
    distinctions: optText(1000),
  })
  .refine(dateOrder, dateOrderIssue)
  .refine((v) => v.gpa === null || v.gpa_scale !== null, {
    message: "gpa_scale_required",
    path: ["gpa_scale"],
  })
  .refine(
    (v) =>
      v.gpa === null ||
      (v.gpa_scale === "4.0" && v.gpa <= 4) ||
      (v.gpa_scale === "5.0" && v.gpa <= 5) ||
      (v.gpa_scale === "percentage" && v.gpa <= 100) ||
      v.gpa_scale === "custom",
    { message: "gpa_exceeds_scale", path: ["gpa"] },
  );

export const experienceSchema = z
  .object({
    kind: z.enum(EXPERIENCE_KINDS),
    title: reqText(200),
    organization: reqText(200),
    location: optText(200),
    start_date: optDate,
    end_date: optDate,
    is_current: bool,
    responsibilities: strList(30, 500),
    achievements: strList(30, 500),
    quantifiable_results: strList(20, 300),
    tools: strList(40, 80, true),
    evidence_urls: strList(10, 500).refine(
      (urls) => urls.every((u) => /^https?:\/\//i.test(u)),
      "invalid_url",
    ),
  })
  .refine(dateOrder, dateOrderIssue)
  .transform((v) => (v.is_current ? { ...v, end_date: null } : v));

export const projectSchema = z
  .object({
    title: reqText(200),
    category: z.enum(PROJECT_CATEGORIES),
    description: optText(4000),
    problem: optText(2000),
    contribution: optText(2000),
    tools: strList(40, 80, true),
    methods: strList(30, 200, true),
    outcomes: strList(20, 500),
    start_date: optDate,
    end_date: optDate,
    github_url: optUrl,
    demo_url: optUrl,
    docs_url: optUrl,
  })
  .refine(dateOrder, dateOrderIssue);

export const skillSchema = z.object({
  name: reqText(120),
  category: optText(120),
  proficiency: optEnum(PROFICIENCY_LEVELS),
  evidence: optText(1000),
});

export const publicationSchema = z.object({
  kind: z.enum(PUBLICATION_KINDS),
  title: reqText(400),
  authors: optText(1000),
  contribution: optText(2000),
  status: z.enum(PUBLICATION_STATUSES),
  venue: optText(300),
  year: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1950).max(2100).nullable(),
  ),
  reference_url: optUrl,
  description: optText(2000),
});

export const certificationSchema = z.object({
  kind: z.enum(CERTIFICATION_KINDS),
  name: reqText(200),
  issuer: optText(200),
  score: optText(40),
  score_scale: optText(40),
  completion_date: optDate,
  expiration_date: optDate,
  verification_url: optUrl,
});

export const achievementSchema = z.object({
  kind: z.enum(ACHIEVEMENT_KINDS),
  title: reqText(300),
  issuer: optText(200),
  achieved_on: optDate,
  description: optText(2000),
  url: optUrl,
});

export const recommendationSchema = z.object({
  recommender_name: reqText(200),
  recommender_position: optText(200),
  organization: optText(200),
  contact_email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.email().max(320).nullable(),
  ),
  contact_phone: optText(40),
  contact_consent: bool,
  field: optText(200),
  notes: optText(2000),
});

export const languageSchema = z.object({
  language: reqText(80),
  proficiency: optEnum(LANGUAGE_LEVELS),
  certification: optText(200),
  notes: optText(1000),
});

export const additionalSchema = z.object({
  kind: reqText(80),
  title: reqText(300),
  description: optText(4000),
  tags: strList(20, 60, true),
  occurred_on: optDate,
  url: optUrl,
});
