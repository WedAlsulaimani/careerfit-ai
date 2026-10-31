import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { assertExtractable, renderResumePdf } from "@/server/pdf/render";
import { buildEvidenceCatalog } from "@/lib/evidence/catalog";
import { composeResume, type ResumePlan } from "@/lib/resume/compose";
import { normalizeText } from "@/lib/evidence/text";
import { IDS, sampleAnalysis, sampleSnapshot } from "../fixtures/profile";

/**
 * Real PDF rendering through headless Chromium (scenarios 15 and 16).
 * Requires a local Chrome/Edge/Chromium; skipped (and reported) otherwise.
 */
const candidates = [
  process.env.CHROME_EXECUTABLE_PATH ?? "",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const hasBrowser = candidates.some((p) => p && existsSync(p));

const plan: ResumePlan = {
  summary: { text: "Computer Science graduate with data analysis experience in Python and SQL.", evidence_ids: [`education:${IDS.edu}`, `experiences:${IDS.intern}`] },
  sections: [
    { type: "education", items: [{ evidence_id: `education:${IDS.edu}`, bullets: [] }] },
    {
      type: "internships",
      items: [{ evidence_id: `experiences:${IDS.intern}`, bullets: [{ text: "Automated a manual report, reducing preparation time from 3 days to 1 day", evidence_ids: [`experiences:${IDS.intern}`] }] }],
    },
    { type: "projects", items: [{ evidence_id: `projects:${IDS.projData}`, bullets: [{ text: "Built a time-series forecasting model in Python with scikit-learn", evidence_ids: [`projects:${IDS.projData}`] }] }] },
  ],
  skill_groups: [{ label: "Technical", skill_ids: [`skills:${IDS.skillPy}`, `skills:${IDS.skillSql}`] }],
  notes_for_user: [],
};

const build = (language: "en" | "ar") =>
  composeResume({
    snapshot: sampleSnapshot(),
    records: buildEvidenceCatalog(sampleSnapshot()),
    plan:
      language === "ar"
        ? {
            ...plan,
            summary: { text: "خريجة علوم حاسب لديها خبرة في تحليل البيانات باستخدام Python وSQL.", evidence_ids: plan.summary!.evidence_ids },
            sections: plan.sections.map((s) =>
              s.type === "internships"
                ? { ...s, items: [{ evidence_id: `experiences:${IDS.intern}`, bullets: [{ text: "أتمتة تقرير يدوي وتقليل مدة إعداده من 3 أيام إلى يوم واحد", evidence_ids: [`experiences:${IDS.intern}`] }] }] }
                : s,
            ),
          }
        : plan,
    analysis: sampleAnalysis(),
    language,
    layout: "classic",
    length: "one_page",
    model: null,
  });

describe.skipIf(!hasBrowser)("PDF export (Chromium)", () => {
  it("produces a selectable-text English PDF with metadata and logical reading order", async () => {
    const doc = build("en");
    const pdf = await renderResumePdf(doc, { title: "Sara Al-Harbi — Junior Data Analyst", author: "Sara Al-Harbi", subject: "Junior Data Analyst — Acme Fintech", keywords: ["Python", "SQL"] });
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");

    const meta = await PDFDocument.load(pdf);
    expect(meta.getTitle()).toBe("Sara Al-Harbi — Junior Data Analyst");
    expect(meta.getAuthor()).toBe("Sara Al-Harbi");
    expect(meta.getPageCount()).toBe(1);

    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    const order = ["Sara Al-Harbi", "PROFESSIONAL SUMMARY", "EDUCATION", "King Saud University", "Riyad Bank", "Retail Sales Forecasting"].map((s) =>
      text.toUpperCase().indexOf(s.toUpperCase()),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("GPA: 4.62 / 5.0");

    // Links are real annotations.
    const proxy = await getDocumentProxy(new Uint8Array(pdf));
    const annotations = await (await proxy.getPage(1)).getAnnotations();
    expect(annotations.some((a: { url?: string }) => a.url?.startsWith("https://github.com/sara-example"))).toBe(true);

    const check = await assertExtractable(pdf, doc);
    expect(check.coverage).toBeGreaterThanOrEqual(0.95);
  }, 90_000);

  it("produces an Arabic right-to-left PDF whose text is extractable", async () => {
    const doc = build("ar");
    const pdf = await renderResumePdf(doc, { title: "سارة الحربي", author: "سارة الحربي", subject: "محلل بيانات", keywords: [] });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    const normalized = normalizeText(text);
    for (const word of ["سارة", "الحربي", "التعليم", "تحليل", "البيانات"]) {
      expect(normalized).toContain(normalizeText(word));
    }
    const check = await assertExtractable(pdf, doc);
    expect(check.coverage).toBeGreaterThanOrEqual(0.8);
    // Logical (not visually reversed) order: the name precedes the first heading.
    expect(normalized.indexOf(normalizeText("سارة"))).toBeLessThan(normalized.indexOf(normalizeText("التعليم")));
    // Latin technical terms survive inside Arabic text.
    expect(text).toContain("Python");
  }, 90_000);
});

describe.runIf(!hasBrowser)("PDF export (no browser)", () => {
  it("is skipped because no Chromium-based browser was found", () => {
    console.warn("PDF integration tests skipped: set CHROME_EXECUTABLE_PATH to run them.");
    expect(hasBrowser).toBe(false);
  });
});
