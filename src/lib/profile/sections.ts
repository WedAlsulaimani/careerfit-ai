import type { z } from "zod";
import {
  ACHIEVEMENT_KINDS,
  CERTIFICATION_KINDS,
  EXPERIENCE_KINDS,
  GPA_SCALES,
  LANGUAGE_LEVELS,
  PROFICIENCY_LEVELS,
  PROJECT_CATEGORIES,
  PUBLICATION_KINDS,
  PUBLICATION_STATUSES,
  achievementSchema,
  additionalSchema,
  certificationSchema,
  educationSchema,
  experienceSchema,
  languageSchema,
  projectSchema,
  publicationSchema,
  recommendationSchema,
  skillSchema,
} from "@/lib/schemas/profile";

/**
 * Declarative registry of every repeatable Master Career Profile section.
 * The same definition drives the onboarding wizard, the profile editor, the
 * generic CRUD API (server-side validation) and the evidence catalog the AI sees.
 */
export type FieldType =
  | "text"
  | "textarea"
  | "date"
  | "url"
  | "email"
  | "tel"
  | "number"
  | "checkbox"
  | "select"
  | "tags"
  | "lines";

export type EnumName =
  | "experienceKind"
  | "projectCategory"
  | "gpaScale"
  | "proficiency"
  | "publicationKind"
  | "publicationStatus"
  | "certificationKind"
  | "achievementKind"
  | "languageLevel";

export const ENUMS: Record<EnumName, readonly string[]> = {
  experienceKind: EXPERIENCE_KINDS,
  projectCategory: PROJECT_CATEGORIES,
  gpaScale: GPA_SCALES,
  proficiency: PROFICIENCY_LEVELS,
  publicationKind: PUBLICATION_KINDS,
  publicationStatus: PUBLICATION_STATUSES,
  certificationKind: CERTIFICATION_KINDS,
  achievementKind: ACHIEVEMENT_KINDS,
  languageLevel: LANGUAGE_LEVELS,
};

export interface FieldDef {
  name: string;
  type: FieldType;
  required?: boolean;
  options?: EnumName;
  /** Show only when another field has a truthy value / one of the values. */
  showIf?: { field: string; in?: string[]; truthy?: boolean; falsy?: boolean };
  full?: boolean;
}

export type SectionKey =
  | "education"
  | "experiences"
  | "projects"
  | "technical_skills"
  | "soft_skills"
  | "publications"
  | "certifications"
  | "achievements"
  | "recommendations"
  | "languages"
  | "additional_records";

export type TableName =
  | "education"
  | "experiences"
  | "projects"
  | "skills"
  | "publications"
  | "certifications"
  | "achievements"
  | "recommendations"
  | "languages"
  | "additional_records";

export interface SectionDef {
  key: SectionKey;
  table: TableName;
  /** Fixed column values for sections that share a table (skills.kind). */
  fixed?: Record<string, string>;
  schema: z.ZodType;
  fields: FieldDef[];
  /** Fields used to label an entry in lists. */
  titleField: string;
  subtitleFields: string[];
  /** Columns that order the list. */
  orderBy: { column: string; ascending: boolean }[];
  wizardStep: number;
  /** Private sections are never sent to the AI or included in resumes. */
  privateSection?: boolean;
}

export const SECTIONS: Record<SectionKey, SectionDef> = {
  education: {
    key: "education",
    table: "education",
    schema: educationSchema,
    titleField: "institution",
    subtitleFields: ["degree_type", "major"],
    orderBy: [
      { column: "end_date", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 3,
    fields: [
      { name: "institution", type: "text", required: true, full: true },
      { name: "degree_type", type: "text" },
      { name: "major", type: "text" },
      { name: "minor", type: "text" },
      { name: "start_date", type: "date" },
      { name: "end_date", type: "date" },
      { name: "is_expected", type: "checkbox" },
      { name: "gpa", type: "number" },
      { name: "gpa_scale", type: "select", options: "gpaScale" },
      { name: "gpa_scale_custom", type: "text", showIf: { field: "gpa_scale", in: ["custom"] } },
      { name: "honors", type: "text", full: true },
      { name: "coursework", type: "tags", full: true },
      { name: "thesis", type: "textarea", full: true },
      { name: "distinctions", type: "textarea", full: true },
    ],
  },
  experiences: {
    key: "experiences",
    table: "experiences",
    schema: experienceSchema,
    titleField: "title",
    subtitleFields: ["organization", "kind"],
    orderBy: [
      { column: "is_current", ascending: false },
      { column: "start_date", ascending: false },
    ],
    wizardStep: 4,
    fields: [
      { name: "kind", type: "select", options: "experienceKind", required: true },
      { name: "title", type: "text", required: true },
      { name: "organization", type: "text", required: true },
      { name: "location", type: "text" },
      { name: "start_date", type: "date" },
      { name: "is_current", type: "checkbox" },
      { name: "end_date", type: "date", showIf: { field: "is_current", falsy: true } },
      { name: "responsibilities", type: "lines", full: true },
      { name: "achievements", type: "lines", full: true },
      { name: "quantifiable_results", type: "lines", full: true },
      { name: "tools", type: "tags", full: true },
      { name: "evidence_urls", type: "lines", full: true },
    ],
  },
  projects: {
    key: "projects",
    table: "projects",
    schema: projectSchema,
    titleField: "title",
    subtitleFields: ["category"],
    orderBy: [
      { column: "end_date", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 5,
    fields: [
      { name: "title", type: "text", required: true },
      { name: "category", type: "select", options: "projectCategory", required: true },
      { name: "description", type: "textarea", full: true },
      { name: "problem", type: "textarea", full: true },
      { name: "contribution", type: "textarea", full: true },
      { name: "tools", type: "tags", full: true },
      { name: "methods", type: "tags", full: true },
      { name: "outcomes", type: "lines", full: true },
      { name: "start_date", type: "date" },
      { name: "end_date", type: "date" },
      { name: "github_url", type: "url" },
      { name: "demo_url", type: "url" },
      { name: "docs_url", type: "url" },
    ],
  },
  technical_skills: {
    key: "technical_skills",
    table: "skills",
    fixed: { kind: "technical" },
    schema: skillSchema,
    titleField: "name",
    subtitleFields: ["category", "proficiency"],
    orderBy: [
      { column: "sort_order", ascending: true },
      { column: "created_at", ascending: true },
    ],
    wizardStep: 6,
    fields: [
      { name: "name", type: "text", required: true },
      { name: "category", type: "text" },
      { name: "proficiency", type: "select", options: "proficiency" },
      { name: "evidence", type: "textarea", full: true },
    ],
  },
  soft_skills: {
    key: "soft_skills",
    table: "skills",
    fixed: { kind: "soft" },
    schema: skillSchema,
    titleField: "name",
    subtitleFields: ["category"],
    orderBy: [
      { column: "sort_order", ascending: true },
      { column: "created_at", ascending: true },
    ],
    wizardStep: 7,
    fields: [
      { name: "name", type: "text", required: true },
      { name: "evidence", type: "textarea", full: true },
    ],
  },
  publications: {
    key: "publications",
    table: "publications",
    schema: publicationSchema,
    titleField: "title",
    subtitleFields: ["status", "venue"],
    orderBy: [
      { column: "year", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 8,
    fields: [
      { name: "kind", type: "select", options: "publicationKind", required: true },
      { name: "status", type: "select", options: "publicationStatus", required: true },
      { name: "title", type: "text", required: true, full: true },
      { name: "authors", type: "text", full: true },
      { name: "contribution", type: "textarea", full: true },
      { name: "venue", type: "text" },
      { name: "year", type: "number" },
      { name: "reference_url", type: "url", full: true },
      { name: "description", type: "textarea", full: true },
    ],
  },
  certifications: {
    key: "certifications",
    table: "certifications",
    schema: certificationSchema,
    titleField: "name",
    subtitleFields: ["issuer", "kind"],
    orderBy: [
      { column: "completion_date", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 9,
    fields: [
      { name: "kind", type: "select", options: "certificationKind", required: true },
      { name: "name", type: "text", required: true },
      { name: "issuer", type: "text" },
      { name: "score", type: "text" },
      { name: "score_scale", type: "text" },
      { name: "completion_date", type: "date" },
      { name: "expiration_date", type: "date" },
      { name: "verification_url", type: "url", full: true },
    ],
  },
  achievements: {
    key: "achievements",
    table: "achievements",
    schema: achievementSchema,
    titleField: "title",
    subtitleFields: ["kind", "issuer"],
    orderBy: [
      { column: "achieved_on", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 10,
    fields: [
      { name: "kind", type: "select", options: "achievementKind", required: true },
      { name: "title", type: "text", required: true },
      { name: "issuer", type: "text" },
      { name: "achieved_on", type: "date" },
      { name: "description", type: "textarea", full: true },
      { name: "url", type: "url", full: true },
    ],
  },
  recommendations: {
    key: "recommendations",
    table: "recommendations",
    schema: recommendationSchema,
    titleField: "recommender_name",
    subtitleFields: ["recommender_position", "organization"],
    orderBy: [{ column: "created_at", ascending: false }],
    wizardStep: 11,
    privateSection: true,
    fields: [
      { name: "recommender_name", type: "text", required: true },
      { name: "recommender_position", type: "text" },
      { name: "organization", type: "text" },
      { name: "field", type: "text" },
      { name: "contact_consent", type: "checkbox", full: true },
      { name: "contact_email", type: "email", showIf: { field: "contact_consent", truthy: true } },
      { name: "contact_phone", type: "tel", showIf: { field: "contact_consent", truthy: true } },
      { name: "notes", type: "textarea", full: true },
    ],
  },
  languages: {
    key: "languages",
    table: "languages",
    schema: languageSchema,
    titleField: "language",
    subtitleFields: ["proficiency"],
    orderBy: [
      { column: "sort_order", ascending: true },
      { column: "created_at", ascending: true },
    ],
    wizardStep: 12,
    fields: [
      { name: "language", type: "text", required: true },
      { name: "proficiency", type: "select", options: "languageLevel" },
      { name: "certification", type: "text" },
      { name: "notes", type: "textarea", full: true },
    ],
  },
  additional_records: {
    key: "additional_records",
    table: "additional_records",
    schema: additionalSchema,
    titleField: "title",
    subtitleFields: ["kind"],
    orderBy: [
      { column: "occurred_on", ascending: false },
      { column: "created_at", ascending: false },
    ],
    wizardStep: 13,
    fields: [
      { name: "kind", type: "text", required: true },
      { name: "title", type: "text", required: true },
      { name: "description", type: "textarea", full: true },
      { name: "tags", type: "tags", full: true },
      { name: "occurred_on", type: "date" },
      { name: "url", type: "url" },
    ],
  },
};

export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

export const isSectionKey = (v: string): v is SectionKey => v in SECTIONS;

/** Wizard: 1 personal, 2 goals, 3..13 repeatable sections, 14 review. */
export const WIZARD_STEPS: ({ kind: "personal" } | { kind: "goals" } | { kind: "section"; key: SectionKey } | { kind: "review" })[] = [
  { kind: "personal" },
  { kind: "goals" },
  ...[...SECTION_KEYS].sort((a, b) => SECTIONS[a].wizardStep - SECTIONS[b].wizardStep).map(
    (key) => ({ kind: "section" as const, key }),
  ),
  { kind: "review" },
];

/** Form default values for an empty entry. */
export function emptyEntry(section: SectionDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of section.fields) {
    if (f.type === "checkbox") out[f.name] = false;
    else if (f.type === "tags" || f.type === "lines") out[f.name] = "";
    else if (f.type === "select") out[f.name] = f.required ? ENUMS[f.options!][0] : "";
    else out[f.name] = "";
  }
  return out;
}

/** Convert a stored row into form values (arrays become text). */
export function rowToForm(section: SectionDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of section.fields) {
    const v = row[f.name];
    if (f.type === "tags") out[f.name] = Array.isArray(v) ? v.join(", ") : "";
    else if (f.type === "lines") out[f.name] = Array.isArray(v) ? v.join("\n") : "";
    else if (f.type === "checkbox") out[f.name] = Boolean(v);
    else out[f.name] = v === null || v === undefined ? "" : String(v);
  }
  return out;
}

/** Fields that may be returned to the client / sent to the AI for a section. */
export function sectionColumns(section: SectionDef): string[] {
  return ["id", "created_at", "updated_at", ...section.fields.map((f) => f.name)];
}
