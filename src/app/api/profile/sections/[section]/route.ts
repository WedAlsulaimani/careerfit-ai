import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { createEntry, listEntries } from "@/server/profile/repository";
import { isSectionKey } from "@/lib/profile/sections";

const sectionParam = (section: string) => {
  if (!isSectionKey(section)) throw new AppError(404, "not_found", "Unknown section.");
  return section;
};

export const GET = authedRoute<{ section: string }>(async (_req, { supabase }, { section }) =>
  jsonOk({ entries: await listEntries(supabase, sectionParam(section)) }),
);

export const POST = authedRoute<{ section: string }>(async (req, { supabase, user }, { section }) => {
  const key = sectionParam(section);
  const body = await readJson(req, z.record(z.string(), z.unknown()));
  return jsonOk({ entry: await createEntry(supabase, user.id, key, body) }, { status: 201 });
});
