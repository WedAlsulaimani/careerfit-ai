import { z } from "zod";
import { AppError, authedRoute, jsonOk, readJson } from "@/server/http";
import { listVersions, restoreVersion } from "@/server/services/resumes";

const checkId = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  return id;
};

export const GET = authedRoute<{ id: string }>(async (_req, ctx, { id }) => jsonOk({ versions: await listVersions(ctx, checkId(id)) }));

/** Restores an older version by saving it as the newest version (history is kept). */
export const POST = authedRoute<{ id: string }>(async (req, ctx, { id }) => {
  const { version } = await readJson(req, z.object({ version: z.number().int().min(1) }));
  return jsonOk({ resume: await restoreVersion(ctx, checkId(id), version) });
});
