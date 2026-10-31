import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { saveResumeSchema } from "@/lib/schemas/resume";
import { deleteResume, getResume, saveResume } from "@/server/services/resumes";

const checkId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return id;
};

export const GET = authedRoute<{ id: string }>(async (_req, ctx, { id }) => jsonOk({ resume: await getResume(ctx, checkId(id)) }));

export const PUT = authedRoute<{ id: string }>(async (req, ctx, { id }) => {
  const input = await readJson(req, saveResumeSchema, 600_000);
  return jsonOk({ resume: await saveResume(ctx, checkId(id), input) });
});

export const DELETE = authedRoute<{ id: string }>(async (_req, ctx, { id }) => {
  await deleteResume(ctx, checkId(id));
  return jsonOk({ ok: true });
});
