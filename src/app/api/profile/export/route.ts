import { NextResponse } from "next/server";
import { authedRoute, dbError } from "@/server/http";
import { getGoals, getPersonal, listEntries } from "@/server/profile/repository";
import { SECTION_KEYS } from "@/lib/profile/sections";

/** Exports everything the user has stored, as JSON (data portability). */
export const GET = authedRoute(async (_req, { supabase, user }) => {
  const sections: Record<string, unknown> = {};
  for (const key of SECTION_KEYS) sections[key] = await listEntries(supabase, key);

  const tables = ["job_opportunities", "job_sources", "job_analyses", "match_assessments", "resumes", "resume_versions", "applications", "attachments"] as const;
  const other: Record<string, unknown> = {};
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(5000);
    if (error) dbError(error, `export ${t}`);
    other[t] = data;
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      personal: await getPersonal(supabase, user.id),
      career_goals: await getGoals(supabase, user.id),
      profile_sections: sections,
      ...other,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="careerfit-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
});
