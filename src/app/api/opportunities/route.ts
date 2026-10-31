import { authedRoute, jsonOk, readJson } from "@/server/http";
import { manualJobSchema } from "@/lib/schemas/job";
import { createFromManual, listOpportunities } from "@/server/services/opportunities";

export const GET = authedRoute(async (_req, ctx) => jsonOk({ opportunities: await listOpportunities(ctx) }));

/** Method 4: manual entry. */
export const POST = authedRoute(async (req, ctx) => {
  const input = await readJson(req, manualJobSchema);
  return jsonOk({ opportunity: await createFromManual(ctx, input) }, { status: 201 });
});
