import { z } from "zod";
import { authedRoute, jsonOk, readJson } from "@/server/http";
import { getGoals, updateGoals } from "@/server/profile/repository";

export const GET = authedRoute(async (_req, { supabase, user }) => jsonOk({ goals: await getGoals(supabase, user.id) }));

export const PUT = authedRoute(async (req, { supabase, user }) => {
  const body = await readJson(req, z.record(z.string(), z.unknown()));
  return jsonOk({ goals: await updateGoals(supabase, user.id, body) });
});
