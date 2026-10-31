import { z } from "zod";
import { AppError, authedRoute, jsonOk } from "@/server/http";
import { duplicateResume } from "@/server/services/resumes";

export const POST = authedRoute<{ id: string }>(async (_req, ctx, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return jsonOk({ resume: await duplicateResume(ctx, id) }, { status: 201 });
});
