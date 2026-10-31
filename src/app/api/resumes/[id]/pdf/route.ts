import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, authedRoute, rateLimit } from "@/server/http";
import { getResume } from "@/server/services/resumes";
import { PdfUnavailableError, PdfValidationError, renderResumePdf } from "@/server/pdf/render";
import { asciiFileName, resumeFileName } from "@/lib/resume/keywords";

export const maxDuration = 60;

export const GET = authedRoute<{ id: string }>(async (_req, ctx, { id }) => {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "not_found", "Not found.");
  rateLimit(`pdf:${ctx.user.id}`, 20, 60_000);
  const resume = await getResume(ctx, id);
  const doc = resume.content;
  const name = doc.header.name || "Candidate";
  const fileName = resumeFileName(name, doc.meta.targetTitle, doc.meta.targetOrganization);

  let pdf: Uint8Array;
  try {
    pdf = await renderResumePdf(doc, {
      title: `${name} — ${doc.meta.targetTitle ?? "Resume"}`,
      author: name,
      subject: [doc.meta.targetTitle, doc.meta.targetOrganization].filter(Boolean).join(" — ") || "Resume",
      keywords: doc.sections.filter((s) => s.type === "skills").flatMap((s) => s.items.flatMap((i) => i.inline.split(/,\s*/))),
    });
  } catch (err) {
    if (err instanceof PdfUnavailableError) throw new AppError(503, "pdf_unavailable", err.message);
    if (err instanceof PdfValidationError) {
      throw new AppError(500, "pdf_validation_failed", "The PDF text layer could not be verified, so it was not delivered.", {
        coverage: Math.round(err.coverage * 100),
      });
    }
    throw err;
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${asciiFileName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
    },
  });
});
