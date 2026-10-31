import "server-only";
import type { ApiContext } from "@/server/http";
import { AppError, dbError } from "@/server/http";
import { runStructured } from "@/server/ai";
import { aiResumePlanSchema, aiSectionRewriteSchema } from "@/server/ai/schemas";
import { resumeSystemPrompt, sectionRewriteSystemPrompt, wrapUntrusted } from "@/server/ai/prompts";
import { buildEvidenceCatalog, serializeCandidateContext, serializeCatalog, type EvidenceRecord } from "@/lib/evidence/catalog";
import { applySectionRewrite, composeResume } from "@/lib/resume/compose";
import { resumeDocumentSchema, type ResumeDocument } from "@/lib/schemas/resume";
import type { JobAnalysis, MatchResult } from "@/lib/schemas/job";
import { loadSnapshot } from "@/server/profile/repository";
import { getOpportunityBundle } from "./opportunities";

const RESUME_COLUMNS =
  "id, opportunity_id, match_id, title, language, layout, content, current_version, created_at, updated_at";

function jobBrief(analysis: JobAnalysis): string {
  return [
    `Title: ${analysis.title ?? "(unknown)"}`,
    `Employer: ${analysis.employer ?? "(unknown)"}`,
    `Industry: ${analysis.industry ?? ""}`,
    `Seniority: ${analysis.seniority ?? ""}`,
    "Requirements:",
    ...analysis.requirements.map((r) => `- ${r.id} [${r.category}/${r.type}] ${r.text}`),
    `Responsibilities: ${analysis.responsibilities.join("; ")}`,
    `ATS keywords: ${analysis.ats_keywords.join(", ")}`,
    `Tools: ${analysis.tools.join(", ")}`,
  ].join("\n");
}

function matchBrief(match: MatchResult): string {
  return [
    ...match.requirements.map((m) => `${m.requirement_id}: ${m.status}${m.evidence_ids.length ? ` ← ${m.evidence_ids.join(", ")}` : ""}`),
    `Recommended records (most relevant first): ${match.recommended_evidence_ids.join(", ")}`,
    `Keywords the candidate can truthfully use: ${match.supported_keywords.join(", ")}`,
    `Keywords NOT supported by the records (do not claim): ${match.unsupported_keywords.join(", ")}`,
  ].join("\n");
}

async function generationContext(ctx: ApiContext, opportunityId: string) {
  const bundle = await getOpportunityBundle(ctx, opportunityId);
  if (!bundle.analysis?.approved_at) throw new AppError(409, "conflict", "Approve the job analysis first.");
  if (!bundle.match) throw new AppError(409, "conflict", "Run the profile match first.");
  const snapshot = await loadSnapshot(ctx.supabase, ctx.user.id);
  const records = buildEvidenceCatalog(snapshot);
  return { bundle, snapshot, records, analysis: bundle.analysis.analysis, match: bundle.match.result };
}

export async function generateResume(
  ctx: ApiContext,
  opts: { opportunityId: string; language: "en" | "ar"; length: "one_page" | "two_pages"; layout: "classic" | "compact" },
) {
  const { bundle, snapshot, records, analysis, match } = await generationContext(ctx, opts.opportunityId);
  if (records.length === 0) throw new AppError(409, "conflict", "Your profile has no records to build a resume from.");

  const input = [
    `Preferences: language=${opts.language}; length=${opts.length}.`,
    "Opportunity (reviewed by the candidate):",
    wrapUntrusted("job_posting", jobBrief(analysis)),
    "Evidence-based match results:",
    matchBrief(match),
    "Candidate context (goals; not citable evidence):",
    serializeCandidateContext(snapshot) || "(none)",
    "Candidate records (cite by id):",
    serializeCatalog(records),
  ].join("\n\n");

  const result = await runStructured(
    { supabase: ctx.supabase, userId: ctx.user.id },
    {
      operation: "resume_generation",
      system: resumeSystemPrompt(opts.language),
      input,
      schema: aiResumePlanSchema,
      maxTokens: 16000,
    },
  );

  const doc = composeResume({
    snapshot,
    records,
    plan: result.data,
    analysis,
    language: opts.language,
    layout: opts.layout,
    length: opts.length,
    model: result.model,
  });

  const title = [analysis.title, analysis.employer].filter(Boolean).join(" — ") || "Tailored resume";
  const { data, error } = await ctx.supabase
    .from("resumes")
    .insert({
      user_id: ctx.user.id,
      opportunity_id: opts.opportunityId,
      match_id: bundle.match!.id,
      title: title.slice(0, 300),
      language: opts.language,
      layout: opts.layout,
      content: doc,
      current_version: 1,
    })
    .select(RESUME_COLUMNS)
    .single();
  if (error) dbError(error, "insert resume");
  await ctx.supabase.from("resume_versions").insert({
    user_id: ctx.user.id,
    resume_id: data!.id,
    version: 1,
    content: doc,
    reason: "generated",
  });
  // Track the opportunity as "preparing" unless the user already set a status.
  await ctx.supabase
    .from("applications")
    .upsert(
      { user_id: ctx.user.id, opportunity_id: opts.opportunityId, resume_id: data!.id, status: "preparing" },
      { onConflict: "opportunity_id", ignoreDuplicates: true },
    );
  return data!;
}

export async function getResume(ctx: ApiContext, id: string) {
  const { data, error } = await ctx.supabase.from("resumes").select(RESUME_COLUMNS).eq("id", id).maybeSingle();
  if (error) dbError(error, "get resume");
  if (!data) throw new AppError(404, "not_found", "Resume not found.");
  return { ...data, content: resumeDocumentSchema.parse(data.content) as ResumeDocument };
}

export async function listResumes(ctx: ApiContext) {
  const { data, error } = await ctx.supabase
    .from("resumes")
    .select("id, opportunity_id, title, language, layout, current_version, created_at, updated_at, job_opportunities(title, organization)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) dbError(error, "list resumes");
  return data ?? [];
}

/** Saves user edits as a new version, guarded against concurrent overwrites. */
export async function saveResume(
  ctx: ApiContext,
  id: string,
  input: { title: string; content: ResumeDocument; baseVersion: number },
  reason: "manual_save" | "section_regenerated" | "restored" = "manual_save",
) {
  const current = await getResume(ctx, id);
  if (current.current_version !== input.baseVersion) {
    throw new AppError(409, "conflict", "This resume was changed elsewhere. Reload to see the latest version.", {
      currentVersion: current.current_version,
    });
  }
  const nextVersion = current.current_version + 1;
  const { data, error } = await ctx.supabase
    .from("resumes")
    .update({
      title: input.title,
      content: input.content,
      language: input.content.language,
      layout: input.content.layout,
      current_version: nextVersion,
    })
    .eq("id", id)
    .eq("current_version", input.baseVersion)
    .select(RESUME_COLUMNS)
    .maybeSingle();
  if (error) dbError(error, "save resume");
  if (!data) throw new AppError(409, "conflict", "This resume was changed elsewhere. Reload to see the latest version.");
  const { error: vError } = await ctx.supabase.from("resume_versions").insert({
    user_id: ctx.user.id,
    resume_id: id,
    version: nextVersion,
    content: input.content,
    reason,
  });
  if (vError) dbError(vError, "insert resume version");
  return { ...data, content: input.content };
}

export async function listVersions(ctx: ApiContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("resume_versions")
    .select("id, version, reason, created_at")
    .eq("resume_id", id)
    .order("version", { ascending: false })
    .limit(50);
  if (error) dbError(error, "list versions");
  return data ?? [];
}

export async function restoreVersion(ctx: ApiContext, id: string, version: number) {
  const current = await getResume(ctx, id);
  const { data, error } = await ctx.supabase
    .from("resume_versions")
    .select("content")
    .eq("resume_id", id)
    .eq("version", version)
    .maybeSingle();
  if (error) dbError(error, "get version");
  if (!data) throw new AppError(404, "not_found", "Version not found.");
  const content = resumeDocumentSchema.parse(data.content);
  return saveResume(ctx, id, { title: current.title, content, baseVersion: current.current_version }, "restored");
}

export async function duplicateResume(ctx: ApiContext, id: string) {
  const current = await getResume(ctx, id);
  const { data, error } = await ctx.supabase
    .from("resumes")
    .insert({
      user_id: ctx.user.id,
      opportunity_id: current.opportunity_id,
      match_id: current.match_id,
      title: `${current.title.slice(0, 290)} (copy)`,
      language: current.language,
      layout: current.layout,
      content: current.content,
      current_version: 1,
    })
    .select(RESUME_COLUMNS)
    .single();
  if (error) dbError(error, "duplicate resume");
  await ctx.supabase.from("resume_versions").insert({
    user_id: ctx.user.id,
    resume_id: data!.id,
    version: 1,
    content: current.content,
    reason: "duplicated",
  });
  return data!;
}

export async function deleteResume(ctx: ApiContext, id: string) {
  const { data, error } = await ctx.supabase.from("resumes").delete().eq("id", id).select("id");
  if (error) dbError(error, "delete resume");
  if (!data?.length) throw new AppError(404, "not_found", "Resume not found.");
}

/**
 * Regenerates ONE section and returns it as a suggestion. Nothing is saved:
 * the editor shows the suggestion next to the current text and the user
 * decides whether to apply it, so approved content is never overwritten silently.
 */
export async function suggestSectionRewrite(ctx: ApiContext, resumeId: string, sectionId: string, content: ResumeDocument) {
  const resume = await getResume(ctx, resumeId);
  if (!resume.opportunity_id) throw new AppError(409, "conflict", "This resume is not linked to an opportunity.");
  const { analysis, records, snapshot } = await generationContext(ctx, resume.opportunity_id);
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) throw new AppError(404, "not_found", "Section not found.");
  if (section.type === "skills" || section.type === "languages" || section.type === "custom") {
    throw new AppError(422, "validation", "This section is built directly from your profile and cannot be regenerated.");
  }

  const refs = new Set<string>(section.type === "summary" ? records.map((r) => r.id) : section.items.map((i) => i.sourceRef).filter((x): x is string => !!x));
  const subset: EvidenceRecord[] = records.filter((r) => refs.has(r.id));
  if (subset.length === 0) throw new AppError(422, "validation", "This section has no profile records to rewrite.");

  const current =
    section.type === "summary"
      ? `Current summary:\n${section.text}`
      : section.items
          .map((i) => `[${i.sourceRef}] ${i.title}\n${i.bullets.map((b) => `- ${b.text}`).join("\n")}`)
          .join("\n\n");

  const result = await runStructured(
    { supabase: ctx.supabase, userId: ctx.user.id },
    {
      operation: "section_rewrite",
      system: sectionRewriteSystemPrompt(content.language),
      input: [
        `Section to rewrite: ${section.type} (heading "${section.heading}")`,
        "Opportunity:",
        wrapUntrusted("job_posting", jobBrief(analysis)),
        "Candidate context (goals; not citable evidence):",
        serializeCandidateContext(snapshot) || "(none)",
        "Current section content (written for the candidate; may contain user edits):",
        current,
        "Records for this section (cite by id):",
        serializeCatalog(subset),
      ].join("\n\n"),
      schema: aiSectionRewriteSchema,
      maxTokens: 8000,
    },
  );

  return applySectionRewrite(content, sectionId, result.data, records, analysis);
}
