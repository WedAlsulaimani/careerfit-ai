import { z } from "zod";
import { authedRoute, jsonOk, readJson } from "@/server/http";
import { getPersonal, updatePersonal } from "@/server/profile/repository";

export const GET = authedRoute(async (_req, { supabase, user }) => jsonOk({ personal: await getPersonal(supabase, user.id) }));

export const PUT = authedRoute(async (req, { supabase, user }) => {
  const body = await readJson(req, z.record(z.string(), z.unknown()));
  return jsonOk({ personal: await updatePersonal(supabase, user.id, body) });
});
