import type { EvidenceRecord, ProfileSnapshot, Row } from "@/lib/evidence/catalog";
import { buildWatchTerms, checkClaim, type ClaimContext } from "@/lib/evidence/validate";
import type { JobAnalysis } from "@/lib/schemas/job";
import {
  resumeDocumentSchema,
  type ResumeBullet,
  type ResumeDocument,
  type ResumeItem,
  type ResumeLayout,
  type ResumeSection,
  type ResumeSectionType,
} from "@/lib/schemas/resume";
import { jobWatchTerms } from "@/lib/jobs/analysis";
import { ENUM_LABELS, RESUME_TERMS, SECTION_HEADINGS, formatMonth, formatRange } from "./labels";

type Lang = "en" | "ar";

export interface PlanBullet {
  text: string;
  evidence_ids: string[];
}
export interface ResumePlan {
  summary: { text: string; evidence_ids: string[] } | null;
  sections: { type: string; items: { evidence_id: string; bullets: PlanBullet[] }[] }[];
  skill_groups: { label: string; skill_ids: string[] }[];
  notes_for_user: string[];
}

/** Which resume sections a record may appear in (prevents mislabelling, e.g. projects as jobs). */
export function allowedSections(record: EvidenceRecord): ResumeSectionType[] {
  switch (record.kind) {
    case "education":
      return ["education"];
    case "experience":
      switch (record.subtype) {
        case "internship":
          return ["internships", "experience"];
        case "research_assistant":
          return ["research", "experience"];
        case "volunteer":
        case "community_service":
          return ["volunteer"];
        case "club_leadership":
        case "student_org":
          return ["leadership"];
        default:
          return ["experience"];
      }
    case "project":
      return record.subtype === "research" ? ["projects", "research"] : ["projects"];
    case "publication":
      return ["publications", "research"];
    case "certification":
      return ["certifications"];
    case "achievement":
      return ["awards"];
    case "language":
      return ["languages"];
    case "additional":
      return ["additional"];
    default:
      return [];
  }
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Factual parts of an item, copied from the record — never from the model. */
export function factualItem(record: EvidenceRecord, lang: Lang): Omit<ResumeItem, "bullets"> {
  const r: Row = record.row;
  const t = RESUME_TERMS[lang];
  const base = {
    id: newId("i"),
    sourceRef: record.id,
    title: "",
    subtitle: "",
    meta: "",
    location: "",
    details: [] as string[],
    inline: "",
    links: [] as { label: string; url: string }[],
    visible: true,
  };
  switch (record.kind) {
    case "education": {
      const degree = [s(r.degree_type), s(r.major)].filter(Boolean).join(", ");
      const details: string[] = [];
      if (r.gpa !== null && r.gpa !== undefined && s(r.gpa)) {
        // GPA is shown exactly as recorded with its own scale — never converted.
        const scale = s(r.gpa_scale) === "custom" ? s(r.gpa_scale_custom) : s(r.gpa_scale);
        details.push(scale === "percentage" ? `${t.gpa}: ${s(r.gpa)}%` : `${t.gpa}: ${s(r.gpa)}${scale ? ` / ${scale}` : ""}`);
      }
      if (s(r.minor)) details.push(`${t.minor}: ${s(r.minor)}`);
      if (s(r.honors)) details.push(`${t.honors}: ${s(r.honors)}`);
      const coursework = arr(r.coursework);
      if (coursework.length) details.push(`${t.coursework}: ${coursework.join(", ")}`);
      return {
        ...base,
        title: s(r.institution),
        subtitle: degree,
        meta: formatRange(s(r.start_date), s(r.end_date), lang, { expected: Boolean(r.is_expected) }),
        details,
      };
    }
    case "experience":
      return {
        ...base,
        title: s(r.title),
        subtitle: s(r.organization),
        meta: formatRange(s(r.start_date), s(r.end_date), lang, { current: Boolean(r.is_current) }),
        location: s(r.location),
      };
    case "project": {
      const links: { label: string; url: string }[] = [];
      if (s(r.github_url)) links.push({ label: t.github, url: s(r.github_url) });
      if (s(r.demo_url)) links.push({ label: t.demo, url: s(r.demo_url) });
      if (s(r.docs_url)) links.push({ label: t.docs, url: s(r.docs_url) });
      const tools = arr(r.tools);
      return {
        ...base,
        title: s(r.title),
        subtitle: tools.slice(0, 8).join(", "),
        meta: formatRange(s(r.start_date), s(r.end_date), lang),
        links,
      };
    }
    case "publication": {
      const status = ENUM_LABELS[lang][s(r.status)] ?? s(r.status);
      const details = s(r.authors) ? [`${t.authors}: ${s(r.authors)}`] : [];
      const links = s(r.reference_url) ? [{ label: "DOI / URL", url: s(r.reference_url) }] : [];
      return {
        ...base,
        title: s(r.title),
        // Publication status is always shown so unpublished work is never presented as published.
        subtitle: [s(r.venue), status].filter(Boolean).join(" — "),
        meta: s(r.year),
        details,
        links,
      };
    }
    case "certification": {
      const details: string[] = [];
      if (s(r.score)) details.push(`${t.score}: ${s(r.score)}${s(r.score_scale) ? ` / ${s(r.score_scale)}` : ""}`);
      if (s(r.expiration_date)) details.push(`${t.expires}: ${formatMonth(s(r.expiration_date), lang)}`);
      const links = s(r.verification_url) ? [{ label: "Verify", url: s(r.verification_url) }] : [];
      return {
        ...base,
        title: s(r.name),
        subtitle: s(r.issuer),
        meta: formatMonth(s(r.completion_date), lang),
        details,
        links,
      };
    }
    case "achievement": {
      const kindLabel = ENUM_LABELS[lang][s(r.kind)];
      return {
        ...base,
        title: s(r.title),
        // Preserve patent application vs granted patent distinction.
        subtitle: [kindLabel, s(r.issuer)].filter(Boolean).join(" — "),
        meta: formatMonth(s(r.achieved_on), lang),
        links: s(r.url) ? [{ label: "Link", url: s(r.url) }] : [],
      };
    }
    case "additional":
      return {
        ...base,
        title: s(r.title),
        subtitle: s(r.kind),
        meta: formatMonth(s(r.occurred_on), lang),
        links: s(r.url) ? [{ label: "Link", url: s(r.url) }] : [],
      };
    default:
      return { ...base, title: record.title };
  }
}

function makeBullets(planBullets: PlanBullet[], defaultRef: string, ctx: ClaimContext, notes: string[]): ResumeBullet[] {
  const out: ResumeBullet[] = [];
  for (const b of planBullets.slice(0, 12)) {
    const text = b.text.trim().replace(/^[-•*]\s*/, "").slice(0, 600);
    if (!text) continue;
    const refs = b.evidence_ids.length ? b.evidence_ids : [defaultRef];
    const check = checkClaim(text, refs, ctx);
    if (check.rejected) {
      notes.push(`Removed a statement with no supporting record: "${text.slice(0, 80)}…"`);
      continue;
    }
    out.push({
      id: newId("b"),
      text,
      evidenceRefs: check.validRefs,
      status: check.needsReview ? "needs_review" : "verified",
      flags: check.flags,
      // Statements with unverified numbers/terms are hidden until the user approves them.
      visible: !check.needsReview,
    });
  }
  return out;
}

export interface ComposeInput {
  snapshot: ProfileSnapshot;
  records: EvidenceRecord[];
  plan: ResumePlan;
  analysis: JobAnalysis;
  language: Lang;
  layout: ResumeLayout;
  length: "one_page" | "two_pages";
  model: string | null;
}

/**
 * Builds the ResumeDocument. Facts (names, organisations, dates, GPA, scores,
 * links, publication status) come from the database; the plan only selects
 * records and supplies validated wording.
 */
export function composeResume(input: ComposeInput): ResumeDocument {
  const { snapshot, records, plan, analysis, language: lang } = input;
  const index = new Map(records.map((r) => [r.id, r]));
  const ctx: ClaimContext = { index, watchTerms: buildWatchTerms(jobWatchTerms(analysis), records) };
  const notes: string[] = [];
  const sections: ResumeSection[] = [];
  const used = new Set<string>();

  // Summary
  if (plan.summary?.text.trim()) {
    const text = plan.summary.text.trim().slice(0, 1500);
    const check = checkClaim(text, plan.summary.evidence_ids, ctx);
    if (check.rejected) {
      notes.push("The generated summary had no supporting records and was not included.");
    } else {
      sections.push({
        id: newId("s"),
        type: "summary",
        heading: SECTION_HEADINGS[lang].summary,
        visible: true,
        text,
        textEvidenceRefs: check.validRefs,
        textFlags: check.flags,
        items: [],
      });
    }
  }

  for (const planSection of plan.sections) {
    const type = planSection.type as ResumeSectionType;
    if (type === "skills" || type === "summary" || type === "custom") continue;
    const items: ResumeItem[] = [];
    for (const planItem of planSection.items) {
      const record = index.get(planItem.evidence_id);
      if (!record) {
        notes.push("A section item referenced a record that does not exist and was skipped.");
        continue;
      }
      if (!allowedSections(record).includes(type)) {
        notes.push(`"${record.title}" cannot appear under "${SECTION_HEADINGS.en[type]}" and was skipped.`);
        continue;
      }
      if (used.has(record.id)) continue;
      used.add(record.id);
      if (record.kind === "language") continue; // languages are rendered inline below
      items.push({ ...factualItem(record, lang), bullets: makeBullets(planItem.bullets, record.id, ctx, notes) });
    }
    if (type === "languages") continue;
    if (items.length) {
      const existing = sections.find((sec) => sec.type === type);
      if (existing) existing.items.push(...items);
      else
        sections.push({
          id: newId("s"),
          type,
          heading: SECTION_HEADINGS[lang][type],
          visible: true,
          text: "",
          textEvidenceRefs: [],
          textFlags: [],
          items,
        });
    }
  }

  // Skills: only ids of real skill records; names are copied from the records.
  const skillItems: ResumeItem[] = [];
  const usedSkills = new Set<string>();
  for (const group of plan.skill_groups.slice(0, 6)) {
    const names = group.skill_ids
      .map((id) => index.get(id))
      .filter((r): r is EvidenceRecord => !!r && r.kind === "skill" && !usedSkills.has(r.id))
      .map((r) => {
        usedSkills.add(r.id);
        return r.title;
      });
    if (!names.length) continue;
    skillItems.push({
      id: newId("i"),
      sourceRef: null,
      title: group.label.trim().slice(0, 80) || RESUME_TERMS[lang].otherSkills,
      subtitle: "",
      meta: "",
      location: "",
      details: [],
      inline: names.join(", "),
      bullets: [],
      links: [],
      visible: true,
    });
  }
  if (skillItems.length) {
    const firstExperienceIdx = sections.findIndex((x) => x.type !== "summary" && x.type !== "education");
    const skillSection: ResumeSection = {
      id: newId("s"),
      type: "skills",
      heading: SECTION_HEADINGS[lang].skills,
      visible: true,
      text: "",
      textEvidenceRefs: [],
      textFlags: [],
      items: skillItems,
    };
    if (firstExperienceIdx === -1) sections.push(skillSection);
    else sections.splice(firstExperienceIdx, 0, skillSection);
  }

  // Languages: all language records, inline, with proficiency labels.
  const languageRecords = records.filter((r) => r.kind === "language");
  const plannedLanguages = plan.sections.some((x) => x.type === "languages");
  if (languageRecords.length && (plannedLanguages || analysis.requirements.some((r) => r.type === "language"))) {
    const text = languageRecords
      .map((r) => {
        const level = ENUM_LABELS[lang][s(r.row.proficiency)];
        const cert = s(r.row.certification);
        const extra = [level, cert].filter(Boolean).join(", ");
        return extra ? `${r.title} (${extra})` : r.title;
      })
      .join(" · ");
    sections.push({
      id: newId("s"),
      type: "languages",
      heading: SECTION_HEADINGS[lang].languages,
      visible: true,
      text: "",
      textEvidenceRefs: [],
      textFlags: [],
      items: [
        {
          id: newId("i"),
          sourceRef: null,
          title: "",
          subtitle: "",
          meta: "",
          location: "",
          details: [],
          inline: text,
          bullets: [],
          links: [],
          visible: true,
        },
      ],
    });
  }

  const doc = {
    schemaVersion: 1 as const,
    language: lang,
    layout: input.layout,
    header: buildHeader(snapshot, lang),
    sections,
    meta: {
      generatedAt: new Date().toISOString(),
      model: input.model,
      targetTitle: analysis.title,
      targetOrganization: analysis.employer,
      lengthPreference: input.length,
      notes: [...notes, ...plan.notes_for_user.map((n) => n.slice(0, 400))].slice(0, 20),
    },
  };
  return resumeDocumentSchema.parse(doc);
}

export function buildHeader(snapshot: ProfileSnapshot, lang: Lang): ResumeDocument["header"] {
  const p = snapshot.personal ?? {};
  const t = RESUME_TERMS[lang];
  const links: { label: string; url: string }[] = [];
  if (s(p.linkedin_url)) links.push({ label: t.linkedin, url: s(p.linkedin_url) });
  if (s(p.github_url)) links.push({ label: t.github, url: s(p.github_url) });
  if (s(p.portfolio_url)) links.push({ label: t.portfolio, url: s(p.portfolio_url) });
  if (Array.isArray(p.other_links)) {
    for (const l of p.other_links as { label?: string; url?: string }[]) {
      if (l?.label && l?.url && links.length < 8) links.push({ label: l.label, url: l.url });
    }
  }
  // Sensitive fields appear only after explicit opt-in.
  const extras: { label: string; value: string }[] = [];
  if (p.include_dob_in_resume && s(p.date_of_birth)) extras.push({ label: t.dob, value: s(p.date_of_birth) });
  if (p.include_nationality_in_resume && s(p.nationality)) extras.push({ label: t.nationality, value: s(p.nationality) });

  const name = lang === "ar" && s(p.full_name_ar) ? s(p.full_name_ar) : s(p.full_name_en) || s(p.full_name_ar);
  const phone = [s(p.phone_country_code), s(p.phone)].filter(Boolean).join(" ");
  return {
    name,
    headline: s(p.headline),
    email: s(p.email),
    phone: phone ? (phone.startsWith("+") || !s(p.phone_country_code) ? phone : `+${phone}`) : "",
    location: [s(p.city), s(p.country)].filter(Boolean).join(", "),
    links,
    extras,
  };
}

/** Applies a regenerated section to a document without touching other sections. */
export function applySectionRewrite(
  doc: ResumeDocument,
  sectionId: string,
  rewrite: { summary: { text: string; evidence_ids: string[] } | null; items: { evidence_id: string; bullets: PlanBullet[] }[] },
  records: EvidenceRecord[],
  analysis: JobAnalysis,
): { section: ResumeSection; notes: string[] } {
  const index = new Map(records.map((r) => [r.id, r]));
  const ctx: ClaimContext = { index, watchTerms: buildWatchTerms(jobWatchTerms(analysis), records) };
  const notes: string[] = [];
  const current = doc.sections.find((x) => x.id === sectionId);
  if (!current) throw new Error("section_not_found");

  if (current.type === "summary") {
    if (!rewrite.summary?.text.trim()) return { section: current, notes: ["No summary was suggested."] };
    const text = rewrite.summary.text.trim().slice(0, 1500);
    const check = checkClaim(text, rewrite.summary.evidence_ids, ctx);
    if (check.rejected) return { section: current, notes: ["The suggested summary had no supporting records."] };
    return {
      section: { ...current, text, textEvidenceRefs: check.validRefs, textFlags: check.flags },
      notes,
    };
  }

  const byRef = new Map(rewrite.items.map((i) => [i.evidence_id, i]));
  const items = current.items.map((item) => {
    const suggestion = item.sourceRef ? byRef.get(item.sourceRef) : undefined;
    if (!suggestion || !item.sourceRef) return item;
    return { ...item, bullets: makeBullets(suggestion.bullets, item.sourceRef, ctx, notes) };
  });
  return { section: { ...current, items }, notes };
}
