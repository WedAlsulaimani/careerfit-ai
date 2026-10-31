import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { deleteEntry, updateEntry } from "@/server/profile/repository";
import { isSectionKey } from "@/lib/profile/sections";

const parse = (section: string, id: string) => {
  if (!isSectionKey(section) || !z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return section;
};

export const PATCH = authedRoute<{ section: string; id: string }>(async (req, { supabase }, { section, id }) => {
  const key = parse(section, id);
  const body = await readJson(req, z.record(z.string(), z.unknown()));
  return jsonOk({ entry: await updateEntry(supabase, key, id, body) });
});

export const DELETE = authedRoute<{ section: string; id: string }>(async (_req, { supabase }, { section, id }) => {
  await deleteEntry(supabase, parse(section, id), id);
  return jsonOk({ ok: true });
});
