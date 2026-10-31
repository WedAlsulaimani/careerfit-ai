import { authedRoute, jsonOk, rateLimit, readJson } from "@/server/http";
import { urlIntakeSchema } from "@/lib/schemas/job";
import { createFromUrl } from "@/server/services/opportunities";

/** Method 1 (and QR codes that contain a URL): safe server-side retrieval. */
export const POST = authedRoute(async (req, ctx) => {
  rateLimit(`url:${ctx.user.id}`, 10, 60_000);
  const { url, via } = await readJson(req, urlIntakeSchema);
  return jsonOk({ opportunity: await createFromUrl(ctx, url, via) }, { status: 201 });
});
