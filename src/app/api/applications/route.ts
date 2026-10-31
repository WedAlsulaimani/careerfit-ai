import { authedRoute, dbError, jsonOk } from "@/server/http";

export const GET = authedRoute(async (_req, { supabase }) => {
  const { data, error } = await supabase
    .from("applications")
    .select("id, opportunity_id, resume_id, status, applied_on, notes, updated_at, job_opportunities(title, organization, source_url, deadline)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) dbError(error, "list applications");
  return jsonOk({ applications: data ?? [] });
});
