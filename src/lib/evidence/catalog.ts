/**
 * Evidence catalog: flattens the Master Career Profile into addressable
 * records ("<table>:<uuid>"). The AI may only cite these ids, and every
 * generated statement is validated against the text of the records it cites.
 */

export interface Row {
  id: string;
  [key: string]: unknown;
}

export interface ProfileSnapshot {
  personal: Record<string, unknown> | null;
  goals: Record<string, unknown> | null;
  education: Row[];
  experiences: Row[];
  projects: Row[];
  skills: Row[];
  publications: Row[];
  certifications: Row[];
  achievements: Row[];
  languages: Row[];
  additional_records: Row[];
}

export type EvidenceKind =
  | "education"
  | "experience"
  | "project"
  | "skill"
  | "publication"
  | "certification"
  | "achievement"
  | "language"
  | "additional";

export interface EvidenceRecord {
  id: string;
  table: keyof Omit<ProfileSnapshot, "personal" | "goals">;
  kind: EvidenceKind;
  /** Sub-type (experience kind, project category, skill kind…). */
  subtype: string | null;
  title: string;
  /** Full factual text used for validation. */
  text: string;
  row: Row;
}

const s = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function lines(parts: [string, unknown][]): string {
  const out: string[] = [];
  for (const [label, value] of parts) {
    if (Array.isArray(value)) {
      const items = arr(value);
      if (items.length) out.push(`${label}: ${items.join("; ")}`);
    } else if (typeof value === "boolean") {
      if (value) out.push(label);
    } else {
      const v = s(value).trim();
      if (v) out.push(`${label}: ${v}`);
    }
  }
  return out.join("\n");
}

export function buildEvidenceCatalog(p: ProfileSnapshot): EvidenceRecord[] {
  const out: EvidenceRecord[] = [];

  for (const r of p.education) {
    out.push({
      id: `education:${r.id}`,
      table: "education",
      kind: "education",
      subtype: s(r.degree_type) || null,
      title: [s(r.degree_type), s(r.major), s(r.institution)].filter(Boolean).join(" — "),
      text: lines([
        ["Institution", r.institution],
        ["Degree", r.degree_type],
        ["Major", r.major],
        ["Minor", r.minor],
        ["Start", r.start_date],
        [r.is_expected ? "Expected graduation" : "Graduation", r.end_date],
        ["GPA", r.gpa !== null && r.gpa !== undefined ? `${s(r.gpa)} (scale: ${s(r.gpa_scale_custom) || s(r.gpa_scale)})` : ""],
        ["Honors", r.honors],
        ["Relevant coursework", r.coursework],
        ["Thesis / graduation research", r.thesis],
        ["Distinctions", r.distinctions],
      ]),
      row: r,
    });
  }

  for (const r of p.experiences) {
    out.push({
      id: `experiences:${r.id}`,
      table: "experiences",
      kind: "experience",
      subtype: s(r.kind),
      title: `${s(r.title)} — ${s(r.organization)}`,
      text: lines([
        ["Type", r.kind],
        ["Position", r.title],
        ["Organization", r.organization],
        ["Location", r.location],
        ["Start", r.start_date],
        ["End", r.is_current ? "present (current position)" : r.end_date],
        ["Responsibilities", r.responsibilities],
        ["Achievements", r.achievements],
        ["Quantified results (user-provided)", r.quantifiable_results],
        ["Tools and technologies", r.tools],
      ]),
      row: r,
    });
  }

  for (const r of p.projects) {
    out.push({
      id: `projects:${r.id}`,
      table: "projects",
      kind: "project",
      subtype: s(r.category),
      title: s(r.title),
      text: lines([
        ["Project", r.title],
        ["Category", r.category],
        ["Description", r.description],
        ["Problem addressed", r.problem],
        ["Candidate's contribution", r.contribution],
        ["Tools and technologies", r.tools],
        ["Methods", r.methods],
        ["Outcomes", r.outcomes],
        ["Start", r.start_date],
        ["End", r.end_date],
      ]),
      row: r,
    });
  }

  for (const r of p.skills) {
    out.push({
      id: `skills:${r.id}`,
      table: "skills",
      kind: "skill",
      subtype: s(r.kind),
      title: s(r.name),
      text: lines([
        ["Skill", r.name],
        ["Kind", r.kind],
        ["Category", r.category],
        ["Proficiency (self-reported)", r.proficiency],
        ["Evidence / context", r.evidence],
      ]),
      row: r,
    });
  }

  for (const r of p.publications) {
    out.push({
      id: `publications:${r.id}`,
      table: "publications",
      kind: "publication",
      subtype: s(r.status),
      title: s(r.title),
      text: lines([
        ["Title", r.title],
        ["Type", r.kind],
        ["Status (must be preserved exactly)", r.status],
        ["Authors", r.authors],
        ["Candidate's contribution", r.contribution],
        ["Venue", r.venue],
        ["Year", r.year],
        ["Description", r.description],
      ]),
      row: r,
    });
  }

  for (const r of p.certifications) {
    out.push({
      id: `certifications:${r.id}`,
      table: "certifications",
      kind: "certification",
      subtype: s(r.kind),
      title: s(r.name),
      text: lines([
        ["Name", r.name],
        ["Type", r.kind],
        ["Issuer", r.issuer],
        ["Score", r.score ? `${s(r.score)}${r.score_scale ? ` / ${s(r.score_scale)}` : ""}` : ""],
        ["Completed", r.completion_date],
        ["Expires", r.expiration_date],
      ]),
      row: r,
    });
  }

  for (const r of p.achievements) {
    out.push({
      id: `achievements:${r.id}`,
      table: "achievements",
      kind: "achievement",
      subtype: s(r.kind),
      title: s(r.title),
      text: lines([
        ["Title", r.title],
        ["Type (must be preserved exactly)", r.kind],
        ["Issuer", r.issuer],
        ["Date", r.achieved_on],
        ["Description", r.description],
      ]),
      row: r,
    });
  }

  for (const r of p.languages) {
    out.push({
      id: `languages:${r.id}`,
      table: "languages",
      kind: "language",
      subtype: s(r.proficiency) || null,
      title: s(r.language),
      text: lines([
        ["Language", r.language],
        ["Proficiency", r.proficiency],
        ["Certification / test", r.certification],
        ["Notes", r.notes],
      ]),
      row: r,
    });
  }

  for (const r of p.additional_records) {
    out.push({
      id: `additional_records:${r.id}`,
      table: "additional_records",
      kind: "additional",
      subtype: s(r.kind),
      title: s(r.title),
      text: lines([
        ["Type", r.kind],
        ["Title", r.title],
        ["Description", r.description],
        ["Tags", r.tags],
        ["Date", r.occurred_on],
      ]),
      row: r,
    });
  }

  return out;
}

/** Compact, model-facing serialisation of the catalog. */
export function serializeCatalog(records: EvidenceRecord[]): string {
  return records
    .map((r) => `[${r.id}] ${r.kind.toUpperCase()}${r.subtype ? ` (${r.subtype})` : ""}\n${r.text}`)
    .join("\n\n");
}

/** Goals and headline give the model useful context without being citable evidence. */
export function serializeCandidateContext(p: ProfileSnapshot): string {
  const g = p.goals ?? {};
  return lines([
    ["Professional headline", p.personal?.headline],
    ["Candidate-written summary", p.personal?.summary],
    ["Target job titles", g.target_titles],
    ["Preferred industries", g.industries],
    ["Specialisations", g.specializations],
    ["Career objective", g.objective],
  ]);
}

export function catalogIndex(records: EvidenceRecord[]): Map<string, EvidenceRecord> {
  return new Map(records.map((r) => [r.id, r]));
}
