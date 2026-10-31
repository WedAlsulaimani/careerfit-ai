import { z } from "zod";
import { AppError, authedRoute, jsonOk } from "@/server/http";
import { duplicateEntry } from "@/server/profile/repository";
import { isSectionKey } from "@/lib/profile/sections";

export const POST = authedRoute<{ section: string; id: string }>(async (_req, { supabase, user }, { section, id }) => {
  if (!isSectionKey(section) || !z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return jsonOk({ entry: await duplicateEntry(supabase, user.id, section, id) }, { status: 201 });
});
