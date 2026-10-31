import { z } from "zod";
import { isSafeHttpUrl } from "./common";

export const RESUME_SECTION_TYPES = [
  "summary",
  "education",
  "skills",
  "experience",
  "internships",
  "research",
  "projects",
  "leadership",
  "volunteer",
  "certifications",
  "publications",
  "awards",
  "languages",
  "additional",
  "custom",
] as const;
export type ResumeSectionType = (typeof RESUME_SECTION_TYPES)[number];

export const RESUME_LAYOUTS = ["classic", "compact"] as const;
export type ResumeLayout = (typeof RESUME_LAYOUTS)[number];

export const BULLET_STATUSES = ["verified", "needs_review", "user_edited"] as const;

const linkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().max(500).refine(isSafeHttpUrl, "invalid_url"),
});

export const bulletSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1).max(600),
  evidenceRefs: z.array(z.string().max(80)).max(10).default([]),
  status: z.enum(BULLET_STATUSES).default("verified"),
  flags: z.array(z.string().max(200)).max(10).default([]),
  visible: z.boolean().default(true),
});
export type ResumeBullet = z.infer<typeof bulletSchema>;

export const itemSchema = z.object({
  id: z.string().min(1).max(40),
  sourceRef: z.string().max(80).nullable().default(null),
  title: z.string().trim().max(300).default(""),
  subtitle: z.string().trim().max(300).default(""),
  meta: z.string().trim().max(120).default(""),
  location: z.string().trim().max(200).default(""),
  /** Factual detail lines taken from the profile (GPA, coursework, score…). */
  details: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  /** Inline comma-separated content (skills groups, languages). */
  inline: z.string().trim().max(1200).default(""),
  bullets: z.array(bulletSchema).max(12).default([]),
  links: z.array(linkSchema).max(4).default([]),
  visible: z.boolean().default(true),
});
export type ResumeItem = z.infer<typeof itemSchema>;

export const sectionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(RESUME_SECTION_TYPES),
  heading: z.string().trim().min(1).max(80),
  visible: z.boolean().default(true),
  /** Summary sections use text; all others use items. */
  text: z.string().trim().max(1500).default(""),
  textEvidenceRefs: z.array(z.string().max(80)).max(20).default([]),
  textFlags: z.array(z.string().max(200)).max(10).default([]),
  items: z.array(itemSchema).max(40).default([]),
});
export type ResumeSection = z.infer<typeof sectionSchema>;

export const resumeHeaderSchema = z.object({
  name: z.string().trim().max(200).default(""),
  headline: z.string().trim().max(200).default(""),
  email: z.string().trim().max(320).default(""),
  phone: z.string().trim().max(40).default(""),
  location: z.string().trim().max(200).default(""),
  links: z.array(linkSchema).max(8).default([]),
  /** Optional personal details, present only when the user opted in. */
  extras: z
    .array(z.object({ label: z.string().max(60), value: z.string().max(120) }))
    .max(4)
    .default([]),
});

export const resumeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  language: z.enum(["en", "ar"]),
  layout: z.enum(RESUME_LAYOUTS),
  header: resumeHeaderSchema,
  sections: z.array(sectionSchema).max(20),
  meta: z
    .object({
      generatedAt: z.string().max(40).nullable().default(null),
      model: z.string().max(120).nullable().default(null),
      targetTitle: z.string().max(300).nullable().default(null),
      targetOrganization: z.string().max(300).nullable().default(null),
      lengthPreference: z.enum(["one_page", "two_pages"]).default("one_page"),
      notes: z.array(z.string().max(400)).max(20).default([]),
    })
    .default({
      generatedAt: null,
      model: null,
      targetTitle: null,
      targetOrganization: null,
      lengthPreference: "one_page",
      notes: [],
    }),
});
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;

export const generateResumeSchema = z.object({
  opportunityId: z.uuid(),
  language: z.enum(["en", "ar"]),
  length: z.enum(["one_page", "two_pages"]).default("one_page"),
  layout: z.enum(RESUME_LAYOUTS).default("classic"),
});

export const saveResumeSchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: resumeDocumentSchema,
  /** Optimistic concurrency guard: the version the editor started from. */
  baseVersion: z.number().int().min(1),
});
