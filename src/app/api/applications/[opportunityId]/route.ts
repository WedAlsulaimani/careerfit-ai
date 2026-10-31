import { z } from "zod";
import { AppError, authedRoute, dbError, jsonOk, readJson } from "@/server/http";
import { optDate, optText } from "@/lib/schemas/common";
import { APPLICATION_STATUSES } from "@/lib/schemas/application";

const bodySchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  applied_on: optDate,
  notes: optText(4000),
  resume_id: z.uuid().nullable().optional(),
});

/**
 * User-managed tracker. Status changes are recorded only when the user makes
 * them — the app never marks something as "applied" on its own.
 */
export const PUT = authedRoute<{ opportunityId: string }>(async (req, { supabase, user }, { opportunityId }) => {
  if (!z.uuid().safeParse(opportunityId).success) throw new AppError(404, "not_found", "Not found.");
  const body = await readJson(req, bodySchema);
  const { data, error } = await supabase
    .from("applications")
    .upsert(
      {
        user_id: user.id,
        opportunity_id: opportunityId,
        status: body.status,
        applied_on: body.applied_on,
        notes: body.notes,
        ...(body.resume_id !== undefined ? { resume_id: body.resume_id } : {}),
      },
      { onConflict: "opportunity_id" },
    )
    .select("id, opportunity_id, resume_id, status, applied_on, notes, updated_at")
    .single();
  if (error) dbError(error, "upsert application");
  return jsonOk({ application: data });
});

export const DELETE = authedRoute<{ opportunityId: string }>(async (_req, { supabase }, { opportunityId }) => {
  if (!z.uuid().safeParse(opportunityId).success) throw new AppError(404, "not_found", "Not found.");
  const { error } = await supabase.from("applications").delete().eq("opportunity_id", opportunityId);
  if (error) dbError(error, "delete application");
  return jsonOk({ ok: true });
});
