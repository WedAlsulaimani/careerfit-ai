import { authedRoute, jsonOk, readJson } from "@/server/http";
import { textIntakeSchema } from "@/lib/schemas/job";
import { createFromText } from "@/server/services/opportunities";

/** Methods 2 and 3: user-reviewed OCR text from an image, or text decoded from a QR code. */
export const POST = authedRoute(async (req, ctx) => {
  const input = await readJson(req, textIntakeSchema);
  return jsonOk({ opportunity: await createFromText(ctx, input) }, { status: 201 });
});
