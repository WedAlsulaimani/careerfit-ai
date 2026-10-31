import { z } from "zod";
import { AppError, authedRoute, jsonOk } from "@/server/http";
import { deleteOpportunity, getOpportunityBundle } from "@/server/services/opportunities";

const checkId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return id;
};

export const GET = authedRoute<{ id: string }>(async (_req, ctx, { id }) => jsonOk(await getOpportunityBundle(ctx, checkId(id))));

export const DELETE = authedRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteOpportunity(ctx, checkId(id));
  return jsonOk({ ok: true });
});
