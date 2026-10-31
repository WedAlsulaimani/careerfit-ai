import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { setEntryAttachment } from "@/server/profile/repository";
import { isSectionKey } from "@/lib/profile/sections";

/** Links (or unlinks) a previously uploaded private attachment to an entry. */
export const PUT = authedRoute<{ section: string; id: string }>(async (req, { supabase }, { section, id }) => {
  if (!isSectionKey(section) || !z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  const { attachmentId } = await readJson(req, z.object({ attachmentId: z.uuid().nullable() }));
  await setEntryAttachment(supabase, section, id, attachmentId);
  return jsonOk({ ok: true });
});
