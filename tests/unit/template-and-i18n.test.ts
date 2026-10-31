import { describe, expect, it } from "vitest";
import { renderResumeHtml, resumePlainText } from "@/lib/resume/template";
import { asciiFileName, keywordCoverage, resumeFileName } from "@/lib/resume/keywords";
import { resumeDocumentSchema, type ResumeDocument } from "@/lib/schemas/resume";
import { negotiateLocale, format } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";
import { safeNextPath } from "@/lib/auth-redirect";

function doc(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return resumeDocumentSchema.parse({
    schemaVersion: 1,
    language: "en",
    layout: "classic",
    header: { name: "Sara <script>alert(1)</script>", email: "sara@example.com", links: [{ label: "GitHub", url: "https://github.com/sara" }] },
    sections: [
      { id: "s1", type: "summary", heading: "Professional Summary", text: "Data-minded graduate" },
      {
        id: "s2",
        type: "experience",
        heading: "Work Experience",
        items: [
          {
            id: "i1",
            title: "Data Analyst Intern",
            subtitle: "Riyad Bank",
            meta: "Jun 2023 – Aug 2023",
            bullets: [
              { id: "b1", text: "Built Power BI dashboards", evidenceRefs: [] },
              { id: "b2", text: "Hidden unverified claim", evidenceRefs: [], visible: false, status: "needs_review" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

describe("ATS template", () => {
  it("escapes all user content (XSS prevention)", () => {
    const html = renderResumeHtml(doc(), { fontCss: "" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("never renders unsafe links", () => {
    const d = doc();
    // Bypass schema validation to simulate a tampered document.
    (d.header.links as { label: string; url: string }[]).push({ label: "bad", url: "javascript:alert(1)" });
    const html = renderResumeHtml(d, { fontCss: "" });
    expect(html).not.toContain('href="javascript:');
  });

  it("is single-column and table/image free", () => {
    const html = renderResumeHtml(doc(), { fontCss: "" });
    expect(html).not.toMatch(/<table|<img|<svg|column-count|grid-template-columns/);
  });

  it("omits hidden bullets and keeps logical reading order", () => {
    const text = resumePlainText(doc());
    expect(text).not.toContain("Hidden unverified claim");
    const order = ["Sara", "Professional Summary", "Work Experience", "Data Analyst Intern", "Built Power BI dashboards"].map((s) => text.indexOf(s));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("sets right-to-left direction for Arabic resumes", () => {
    const html = renderResumeHtml(doc({ language: "ar" }), { fontCss: "" });
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("direction: rtl");
  });

  it("reports keyword coverage", () => {
    expect(keywordCoverage(doc(), ["Power BI", "Tableau", "power bi"])).toEqual({ present: ["Power BI"], absent: ["Tableau"] });
  });

  it("builds clean file names", () => {
    expect(resumeFileName("Sara Al-Harbi", "Junior Data Analyst", "Acme/Fintech")).toBe("Sara-Al-Harbi_Junior-Data-Analyst_Acme-Fintech.pdf");
    expect(resumeFileName("سارة الحربي", "محلل بيانات", null)).toBe("سارة-الحربي_محلل-بيانات.pdf");
    expect(asciiFileName("سارة-الحربي_Data-Analyst.pdf")).toBe("Data-Analyst.pdf");
  });
});

describe("Localisation (scenario 21)", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object" && !Array.isArray(o)
      ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
      : Array.isArray(o)
        ? [`${prefix}[${o.length}]`]
        : [prefix];

  it("Arabic and English dictionaries have identical keys", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it("negotiates locale from Accept-Language", () => {
    expect(negotiateLocale("ar-SA,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(negotiateLocale("fr-FR,en;q=0.5")).toBe("en");
    expect(negotiateLocale("fr-FR")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });

  it("interpolates variables", () => {
    expect(format(en.onboarding.stepOf, { current: 2, total: 14 })).toBe("Step 2 of 14");
    expect(format(ar.onboarding.stepOf, { current: 2, total: 14 })).toBe("الخطوة 2 من 14");
  });
});

describe("Open-redirect protection", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNextPath("/dashboard", "/x")).toBe("/dashboard");
    expect(safeNextPath("//evil.com", "/x")).toBe("/x");
    expect(safeNextPath("/\\evil.com", "/x")).toBe("/x");
    expect(safeNextPath("https://evil.com", "/x")).toBe("/x");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });
});
