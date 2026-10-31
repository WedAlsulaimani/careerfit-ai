import "server-only";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileSnapshot, Row } from "@/lib/evidence/catalog";
import { SECTIONS, sectionColumns, type SectionDef, type SectionKey } from "@/lib/profile/sections";
import { goalsSchema, personalSchema } from "@/lib/schemas/profile";
import { AppError, dbError } from "@/server/http";

/** Repository for the Master Career Profile. All queries run as the user (RLS enforced). */

const PERSONAL_COLUMNS =
  "full_name_en, full_name_ar, headline, email, phone_country_code, phone, city, country, linkedin_url, portfolio_url, github_url, other_links, date_of_birth, nationality, summary, include_dob_in_resume, include_nationality_in_resume, preferred_locale, onboarding_step, onboarding_completed_at, ai_consent_at, updated_at";
const GOALS_COLUMNS =
  "target_titles, industries, specializations, interests, work_arrangements, preferred_locations, willing_to_relocate, objective, updated_at";

export async function getPersonal(supabase: SupabaseServerClient, userId: string) {
  const { data, error } = await supabase.from("profiles").select(PERSONAL_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) dbError(error, "getPersonal");
  return data as Record<string, unknown> | null;
}

export async function updatePersonal(supabase: SupabaseServerClient, userId: string, input: unknown) {
  const values = personalSchema.parse(input);
  const { data, error } = await supabase
    .from("profiles")
    .update(values)
    .eq("user_id", userId)
    .select(PERSONAL_COLUMNS)
    .single();
  if (error) dbError(error, "updatePersonal");
  return data as Record<string, unknown>;
}

export async function updateProfileFlags(
  supabase: SupabaseServerClient,
  userId: string,
  flags: Partial<{
    onboarding_step: number;
    onboarding_completed_at: string | null;
    ai_consent_at: string | null;
    preferred_locale: "en" | "ar";
  }>,
) {
  const { error } = await supabase.from("profiles").update(flags).eq("user_id", userId);
  if (error) dbError(error, "updateProfileFlags");
}

export async function getGoals(supabase: SupabaseServerClient, userId: string) {
  const { data, error } = await supabase.from("career_goals").select(GOALS_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) dbError(error, "getGoals");
  return data as Record<string, unknown> | null;
}

export async function updateGoals(supabase: SupabaseServerClient, userId: string, input: unknown) {
  const values = goalsSchema.parse(input);
  const { data, error } = await supabase
    .from("career_goals")
    .update(values)
    .eq("user_id", userId)
    .select(GOALS_COLUMNS)
    .single();
  if (error) dbError(error, "updateGoals");
  return data as Record<string, unknown>;
}

function attachmentColumn(section: SectionDef): string | null {
  if (section.table === "education") return "transcript_attachment_id";
  if (section.table === "certifications" || section.table === "recommendations") return "attachment_id";
  return null;
}

function selectFor(section: SectionDef) {
  const cols = sectionColumns(section);
  const att = attachmentColumn(section);
  return [...cols, ...(att ? [att] : [])].join(", ");
}

function scoped(supabase: SupabaseServerClient, section: SectionDef) {
  return supabase.from(section.table);
}

export async function listEntries(supabase: SupabaseServerClient, key: SectionKey): Promise<Row[]> {
  const section = SECTIONS[key];
  let q = scoped(supabase, section).select(selectFor(section));
  for (const [col, val] of Object.entries(section.fixed ?? {})) q = q.eq(col, val);
  for (const o of section.orderBy) q = q.order(o.column, { ascending: o.ascending, nullsFirst: false });
  const { data, error } = await q.limit(500);
  if (error) dbError(error, `list ${key}`);
  return (data ?? []) as unknown as Row[];
}

export async function createEntry(supabase: SupabaseServerClient, userId: string, key: SectionKey, input: unknown) {
  const section = SECTIONS[key];
  const values = section.schema.parse(input) as Record<string, unknown>;
  const { data, error } = await scoped(supabase, section)
    .insert({ ...values, ...(section.fixed ?? {}), user_id: userId })
    .select(selectFor(section))
    .single();
  if (error) dbError(error, `create ${key}`);
  return data as unknown as Row;
}

export async function updateEntry(supabase: SupabaseServerClient, key: SectionKey, id: string, input: unknown) {
  const section = SECTIONS[key];
  const values = section.schema.parse(input) as Record<string, unknown>;
  let q = scoped(supabase, section).update(values).eq("id", id);
  for (const [col, val] of Object.entries(section.fixed ?? {})) q = q.eq(col, val);
  const { data, error } = await q.select(selectFor(section)).maybeSingle();
  if (error) dbError(error, `update ${key}`);
  if (!data) throw new AppError(404, "not_found", "Entry not found.");
  return data as unknown as Row;
}

export async function deleteEntry(supabase: SupabaseServerClient, key: SectionKey, id: string) {
  const section = SECTIONS[key];
  let q = scoped(supabase, section).delete().eq("id", id);
  for (const [col, val] of Object.entries(section.fixed ?? {})) q = q.eq(col, val);
  const { data, error } = await q.select("id");
  if (error) dbError(error, `delete ${key}`);
  if (!data?.length) throw new AppError(404, "not_found", "Entry not found.");
}

export async function duplicateEntry(supabase: SupabaseServerClient, userId: string, key: SectionKey, id: string) {
  const section = SECTIONS[key];
  const { data, error } = await scoped(supabase, section).select(selectFor(section)).eq("id", id).maybeSingle();
  if (error) dbError(error, `read ${key}`);
  if (!data) throw new AppError(404, "not_found", "Entry not found.");
  const copy: Record<string, unknown> = {};
  for (const f of section.fields) copy[f.name] = (data as unknown as Record<string, unknown>)[f.name];
  const titleField = section.titleField;
  if (typeof copy[titleField] === "string") {
    copy[titleField] = `${String(copy[titleField]).slice(0, 190)} (copy)`;
  }
  const { data: created, error: insertError } = await scoped(supabase, section)
    .insert({ ...copy, ...(section.fixed ?? {}), user_id: userId })
    .select(selectFor(section))
    .single();
  if (insertError) dbError(insertError, `duplicate ${key}`);
  return created as unknown as Row;
}

export async function setEntryAttachment(
  supabase: SupabaseServerClient,
  key: SectionKey,
  id: string,
  attachmentId: string | null,
) {
  const section = SECTIONS[key];
  const col = attachmentColumn(section);
  if (!col) throw new AppError(422, "validation", "This section does not support attachments.");
  const { data, error } = await scoped(supabase, section)
    .update({ [col]: attachmentId })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) dbError(error, `attach ${key}`);
  if (!data) throw new AppError(404, "not_found", "Entry not found.");
}

/** Everything the AI may use. Recommendations (private) are deliberately excluded. */
export async function loadSnapshot(supabase: SupabaseServerClient, userId: string): Promise<ProfileSnapshot> {
  const [personal, goals, education, experiences, projects, technical, soft, publications, certifications, achievements, languages, additional] =
    await Promise.all([
      getPersonal(supabase, userId),
      getGoals(supabase, userId),
      listEntries(supabase, "education"),
      listEntries(supabase, "experiences"),
      listEntries(supabase, "projects"),
      listEntries(supabase, "technical_skills"),
      listEntries(supabase, "soft_skills"),
      listEntries(supabase, "publications"),
      listEntries(supabase, "certifications"),
      listEntries(supabase, "achievements"),
      listEntries(supabase, "languages"),
      listEntries(supabase, "additional_records"),
    ]);
  return {
    personal,
    goals,
    education,
    experiences,
    projects,
    skills: [...technical.map((s) => ({ ...s, kind: "technical" })), ...soft.map((s) => ({ ...s, kind: "soft" }))],
    publications,
    certifications,
    achievements,
    languages,
    additional_records: additional,
  };
}

/** Per-section counts and last update, for the completion dashboard. */
export async function profileCompletion(supabase: SupabaseServerClient, userId: string) {
  const personal = await getPersonal(supabase, userId);
  const goals = await getGoals(supabase, userId);
  const counts = await Promise.all(
    (Object.keys(SECTIONS) as SectionKey[]).map(async (key) => {
      const section = SECTIONS[key];
      let q = supabase.from(section.table).select("updated_at", { count: "exact" });
      for (const [col, val] of Object.entries(section.fixed ?? {})) q = q.eq(col, val);
      const { data, count, error } = await q.order("updated_at", { ascending: false }).limit(1);
      if (error) dbError(error, `count ${key}`);
      return { key, count: count ?? 0, lastUpdated: (data?.[0] as { updated_at?: string } | undefined)?.updated_at ?? null };
    }),
  );
  const personalDone = Boolean(personal?.full_name_en || personal?.full_name_ar) && Boolean(personal?.email);
  const goalsDone = Array.isArray(goals?.target_titles) && (goals!.target_titles as unknown[]).length > 0;
  // Core sections weigh more because resumes depend on them.
  const weights: Partial<Record<SectionKey, number>> = {
    education: 15,
    experiences: 15,
    projects: 15,
    technical_skills: 15,
    soft_skills: 4,
    languages: 4,
    certifications: 4,
    achievements: 4,
    publications: 2,
    recommendations: 1,
    additional_records: 1,
  };
  let score = (personalDone ? 15 : 0) + (goalsDone ? 5 : 0);
  for (const c of counts) if (c.count > 0) score += weights[c.key] ?? 0;
  return {
    percent: Math.min(100, score),
    personalDone,
    goalsDone,
    sections: counts,
    onboardingStep: (personal?.onboarding_step as number | undefined) ?? 1,
    onboardingCompletedAt: (personal?.onboarding_completed_at as string | null | undefined) ?? null,
    aiConsentAt: (personal?.ai_consent_at as string | null | undefined) ?? null,
  };
}
