import "server-only";
import type { ApiContext } from "@/server/http";
import { AppError, dbError } from "@/server/http";
import { runStructured } from "@/server/ai";
import { aiJobAnalysisSchema, aiMatchSchema } from "@/server/ai/schemas";
import { JOB_ANALYSIS_SYSTEM, MATCH_SYSTEM, wrapUntrusted } from "@/server/ai/prompts";
import { fetchJobPage } from "@/server/jobs/fetch-url";
import { extractJobFromHtml } from "@/lib/jobs/html-extract";
import { composeManualJobText, normalizeJobAnalysis } from "@/lib/jobs/analysis";
import { jobAnalysisSchema, type JobAnalysis, type ManualJobInput, type MatchResult, type SourceType } from "@/lib/schemas/job";
import { buildEvidenceCatalog, serializeCandidateContext, serializeCatalog } from "@/lib/evidence/catalog";
import { validateMatch } from "@/lib/matching/match";
import { loadSnapshot } from "@/server/profile/repository";

const OPPORTUNITY_COLUMNS =
  "id, source_type, source_url, title, organization, location, employment_type, deadline, status, last_error, created_at, updated_at";

async function insertOpportunity(
  ctx: ApiContext,
  base: {
    source_type: SourceType;
    source_url: string | null;
    title: string | null;
    organization: string | null;
    location?: string | null;
    employment_type?: string | null;
    deadline?: string | null;
  },
  rawText: string,
  meta: Record<string, unknown>,
) {
  const { data: opp, error } = await ctx.supabase
    .from("job_opportunities")
    .insert({
      user_id: ctx.user.id,
      source_type: base.source_type,
      source_url: base.source_url,
      title: base.title?.slice(0, 300) ?? null,
      organization: base.organization?.slice(0, 300) ?? null,
      location: base.location?.slice(0, 300) ?? null,
      employment_type: base.employment_type?.slice(0, 120) ?? null,
      deadline: base.deadline ?? null,
    })
    .select(OPPORTUNITY_COLUMNS)
    .single();
  if (error) dbError(error, "insert opportunity");
  const { error: srcError } = await ctx.supabase.from("job_sources").insert({
    user_id: ctx.user.id,
    opportunity_id: opp!.id,
    source_type: base.source_type,
    source_url: base.source_url,
    raw_text: rawText.slice(0, 60000),
    extraction_meta: meta,
  });
  if (srcError) dbError(srcError, "insert job source");
  return opp!;
}

export async function createFromManual(ctx: ApiContext, input: ManualJobInput) {
  const text = composeManualJobText(input);
  return insertOpportunity(
    ctx,
    {
      source_type: "manual",
      source_url: input.source_url,
      title: input.title,
      organization: input.organization,
      location: input.location,
      employment_type: input.employment_type,
      deadline: input.deadline,
    },
    text,
    { method: "manual_entry" },
  );
}

export async function createFromText(
  ctx: ApiContext,
  input: { source_type: "image" | "qr"; text: string; meta: Record<string, unknown> },
) {
  return insertOpportunity(
    ctx,
    { source_type: input.source_type, source_url: null, title: null, organization: null },
    input.text,
    { method: input.source_type === "image" ? "ocr" : "qr_text", ...input.meta },
  );
}

export async function createFromUrl(ctx: ApiContext, url: string, via: "url" | "qr") {
  const outcome = await fetchJobPage(url);
  if (!outcome.ok) {
    const map: Record<typeof outcome.reason, [number, ConstructorParameters<typeof AppError>[1]]> = {
      rejected: [422, "url_invalid"],
      robots_disallowed: [422, "url_robots_disallowed"],
      blocked: [422, "url_blocked"],
      http_error: [422, "url_fetch_failed"],
      not_html: [422, "url_not_html"],
      too_large: [422, "url_too_large"],
      network: [422, "url_fetch_failed"],
      timeout: [422, "url_fetch_failed"],
    };
    const [status, code] = map[outcome.reason];
    throw new AppError(status, code, outcome.detail);
  }
  const extracted = extractJobFromHtml(outcome.body, outcome.contentType);
  if (extracted.text.replace(/\s+/g, " ").length < 200) {
    // Typical of pages that render content with JavaScript or hide it behind a login.
    throw new AppError(422, "url_no_content", "No job description could be extracted from this page.");
  }
  return insertOpportunity(
    ctx,
    {
      source_type: via,
      source_url: outcome.finalUrl,
      title: extracted.title,
      organization: extracted.organization,
      location: extracted.location,
      employment_type: extracted.employmentType,
      deadline: extracted.deadline,
    },
    extracted.text,
    { method: extracted.method, http_status: outcome.status, page_title: extracted.pageTitle, fetched_at: new Date().toISOString() },
  );
}

export async function getOpportunityBundle(ctx: ApiContext, id: string) {
  const [{ data: opp, error }, { data: source }, { data: analyses }, { data: match }, { data: application }] = await Promise.all([
    ctx.supabase.from("job_opportunities").select(OPPORTUNITY_COLUMNS).eq("id", id).maybeSingle(),
    ctx.supabase
      .from("job_sources")
      .select("id, source_type, source_url, raw_text, extraction_meta, created_at")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase
      .from("job_analyses")
      .select("id, version, analysis, model, user_edited, approved_at, created_at")
      .eq("opportunity_id", id)
      .order("version", { ascending: false })
      .limit(1),
    ctx.supabase
      .from("match_assessments")
      .select("id, analysis_id, result, heuristic_score, model, created_at")
      .eq("opportunity_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.supabase.from("applications").select("id, status, applied_on, notes, resume_id").eq("opportunity_id", id).maybeSingle(),
  ]);
  if (error) dbError(error, "get opportunity");
  if (!opp) throw new AppError(404, "not_found", "Opportunity not found.");
  const analysis = analyses?.[0] ?? null;
  return {
    opportunity: opp,
    source,
    analysis: analysis
      ? { ...analysis, analysis: jobAnalysisSchema.parse(analysis.analysis) as JobAnalysis }
      : null,
    match: match ? { ...match, result: match.result as MatchResult } : null,
    application,
  };
}

async function nextAnalysisVersion(ctx: ApiContext, opportunityId: string) {
  const { data } = await ctx.supabase
    .from("job_analyses")
    .select("version")
    .eq("opportunity_id", opportunityId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.version as number | undefined) ?? 0) + 1;
}

export async function analyzeOpportunity(ctx: ApiContext, opportunityId: string) {
  const bundle = await getOpportunityBundle(ctx, opportunityId);
  if (!bundle.source?.raw_text) throw new AppError(409, "conflict", "This opportunity has no source text.");
  const sourceText = bundle.source.raw_text as string;

  const result = await runStructured(
    { supabase: ctx.supabase, userId: ctx.user.id },
    {
      operation: "job_analysis",
      system: JOB_ANALYSIS_SYSTEM,
      input: `Analyse the following opportunity advertisement.\n\n${wrapUntrusted("job_posting", sourceText)}`,
      schema: aiJobAnalysisSchema,
      maxTokens: 16000,
    },
  );

  const analysis = normalizeJobAnalysis(result.data, sourceText);
  if (!analysis.is_job_posting) {
    await ctx.supabase
      .from("job_opportunities")
      .update({ status: "failed", last_error: "not_a_job_posting" })
      .eq("id", opportunityId);
    throw new AppError(422, "not_a_job_posting", "The provided content does not look like a job or opportunity advertisement.");
  }

  const version = await nextAnalysisVersion(ctx, opportunityId);
  const { data, error } = await ctx.supabase
    .from("job_analyses")
    .insert({ user_id: ctx.user.id, opportunity_id: opportunityId, version, analysis, model: result.model })
    .select("id, version, analysis, model, user_edited, approved_at, created_at")
    .single();
  if (error) dbError(error, "insert analysis");

  await ctx.supabase
    .from("job_opportunities")
    .update({
      status: "analyzed",
      last_error: null,
      title: analysis.title ?? bundle.opportunity.title,
      organization: analysis.employer ?? bundle.opportunity.organization,
      location: analysis.location ?? bundle.opportunity.location,
      employment_type: analysis.employment_type ?? bundle.opportunity.employment_type,
      deadline: analysis.deadline ?? bundle.opportunity.deadline,
    })
    .eq("id", opportunityId);
  return data;
}

/** Saves the user-reviewed analysis as a new version; optionally approves it. */
export async function saveReviewedAnalysis(ctx: ApiContext, opportunityId: string, analysis: JobAnalysis, approve: boolean) {
  const bundle = await getOpportunityBundle(ctx, opportunityId);
  const version = await nextAnalysisVersion(ctx, opportunityId);
  const { data, error } = await ctx.supabase
    .from("job_analyses")
    .insert({
      user_id: ctx.user.id,
      opportunity_id: opportunityId,
      version,
      analysis,
      model: bundle.analysis?.model ?? null,
      user_edited: true,
      approved_at: approve ? new Date().toISOString() : null,
    })
    .select("id, version, analysis, model, user_edited, approved_at, created_at")
    .single();
  if (error) dbError(error, "save analysis");
  await ctx.supabase
    .from("job_opportunities")
    .update({
      status: approve ? "approved" : "analyzed",
      title: analysis.title,
      organization: analysis.employer,
      location: analysis.location,
      employment_type: analysis.employment_type,
      deadline: analysis.deadline,
    })
    .eq("id", opportunityId);
  return data;
}

export async function matchOpportunity(ctx: ApiContext, opportunityId: string) {
  const bundle = await getOpportunityBundle(ctx, opportunityId);
  if (!bundle.analysis?.approved_at) {
    throw new AppError(409, "conflict", "Review and approve the job analysis before matching.");
  }
  const analysis = bundle.analysis.analysis;
  const snapshot = await loadSnapshot(ctx.supabase, ctx.user.id);
  const records = buildEvidenceCatalog(snapshot);
  if (records.length === 0) {
    throw new AppError(409, "conflict", "Add some profile information before matching.");
  }

  const requirementsText = analysis.requirements
    .map((r) => `${r.id} [${r.category}/${r.type}] ${r.text}${r.keywords.length ? ` (keywords: ${r.keywords.join(", ")})` : ""}`)
    .join("\n");

  const input = [
    "Job requirements (already reviewed by the candidate):",
    wrapUntrusted("job_posting", `${analysis.title ?? ""} — ${analysis.employer ?? ""}\n${requirementsText}\nATS keywords: ${analysis.ats_keywords.join(", ")}`),
    "Candidate context (goals; not citable evidence):",
    serializeCandidateContext(snapshot) || "(none)",
    "Candidate records (cite by id):",
    serializeCatalog(records),
  ].join("\n\n");

  const result = await runStructured(
    { supabase: ctx.supabase, userId: ctx.user.id },
    { operation: "matching", system: MATCH_SYSTEM, input, schema: aiMatchSchema, maxTokens: 16000 },
  );

  const validated = validateMatch(result.data, analysis, records);
  const { data, error } = await ctx.supabase
    .from("match_assessments")
    .insert({
      user_id: ctx.user.id,
      opportunity_id: opportunityId,
      analysis_id: bundle.analysis.id,
      result: validated,
      heuristic_score: validated.score.overall,
      model: result.model,
    })
    .select("id, analysis_id, result, heuristic_score, model, created_at")
    .single();
  if (error) dbError(error, "insert match");
  await ctx.supabase.from("job_opportunities").update({ status: "matched" }).eq("id", opportunityId);
  return data;
}

export async function listOpportunities(ctx: ApiContext) {
  const { data, error } = await ctx.supabase
    .from("job_opportunities")
    .select(OPPORTUNITY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) dbError(error, "list opportunities");
  return data ?? [];
}

export async function deleteOpportunity(ctx: ApiContext, id: string) {
  const { data, error } = await ctx.supabase.from("job_opportunities").delete().eq("id", id).select("id");
  if (error) dbError(error, "delete opportunity");
  if (!data?.length) throw new AppError(404, "not_found", "Opportunity not found.");
}
