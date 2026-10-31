import { containsTerm, normalizeText } from "@/lib/evidence/text";
import type { ResumeDocument } from "@/lib/schemas/resume";
import { resumePlainText } from "./template";

/** Deterministic ATS keyword coverage: which job keywords literally appear in the resume text. */
export function keywordCoverage(doc: ResumeDocument, keywords: string[]) {
  const text = resumePlainText(doc);
  const seen = new Set<string>();
  const present: string[] = [];
  const absent: string[] = [];
  for (const k of keywords) {
    const key = normalizeText(k);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (containsTerm(text, k) ? present : absent).push(k);
  }
  return { present, absent };
}

/** CandidateName_Position_Company.pdf, keeping Latin and Arabic letters. */
export function resumeFileName(name: string, position: string | null, company: string | null): string {
  const part = (v: string | null) =>
    (v ?? "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  const parts = [part(name) || "Resume", part(position), part(company)].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

/** ASCII fallback for the Content-Disposition `filename` parameter. */
export function asciiFileName(fileName: string): string {
  const ascii = fileName.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "");
  return ascii.replace(/^[_-]+/, "") || "resume.pdf";
}
