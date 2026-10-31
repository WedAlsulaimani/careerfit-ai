import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { renderResumePdf } from "@/server/pdf/render";
import { buildEvidenceCatalog } from "@/lib/evidence/catalog";
import { composeResume } from "@/lib/resume/compose";
import { IDS, sampleAnalysis, sampleSnapshot } from "../fixtures/profile";

const OUT = process.env.SAMPLE_PDF_DIR;

it.runIf(!!OUT)("writes sample PDFs", async () => {
  for (const language of ["en", "ar"] as const) {
    const doc = composeResume({
      snapshot: sampleSnapshot(),
      records: buildEvidenceCatalog(sampleSnapshot()),
      plan: {
        summary: {
          text:
            language === "ar"
              ? "خريجة علوم حاسب بمرتبة الشرف الأولى، لديها خبرة عملية في تحليل البيانات باستخدام Python وSQL وPower BI."
              : "Computer Science graduate (First Class Honors) with hands-on data analysis experience using Python, SQL and Power BI.",
          evidence_ids: [`education:${IDS.edu}`, `experiences:${IDS.intern}`],
        },
        sections: [
          { type: "education", items: [{ evidence_id: `education:${IDS.edu}`, bullets: [] }] },
          {
            type: "internships",
            items: [
              {
                evidence_id: `experiences:${IDS.intern}`,
                bullets:
                  language === "ar"
                    ? [
                        { text: "أتمتة تقرير يدوي وتقليل مدة إعداده من 3 أيام إلى يوم واحد", evidence_ids: [`experiences:${IDS.intern}`] },
                        { text: "بناء لوحات معلومات أسبوعية في Power BI وتنظيف بيانات المعاملات باستخدام Python وPandas", evidence_ids: [`experiences:${IDS.intern}`] },
                      ]
                    : [
                        { text: "Automated a manual report, reducing preparation time from 3 days to 1 day", evidence_ids: [`experiences:${IDS.intern}`] },
                        { text: "Built weekly Power BI dashboards and cleaned transaction data with Python and Pandas", evidence_ids: [`experiences:${IDS.intern}`] },
                      ],
              },
            ],
          },
          {
            type: "projects",
            items: [
              {
                evidence_id: `projects:${IDS.projData}`,
                bullets: [
                  {
                    text:
                      language === "ar"
                        ? "بناء نموذج تنبؤ بالسلاسل الزمنية باستخدام Python وscikit-learn بخطأ أقل بنسبة 12% من النموذج الأساسي"
                        : "Built a time-series sales forecasting model in Python and scikit-learn with 12% lower error than the baseline",
                    evidence_ids: [`projects:${IDS.projData}`],
                  },
                ],
              },
            ],
          },
          { type: "leadership", items: [{ evidence_id: `experiences:${IDS.club}`, bullets: [{ text: language === "ar" ? "تنظيم ورش عمل في تصوير البيانات" : "Organized workshops on data visualization", evidence_ids: [`experiences:${IDS.club}`] }] }] },
          { type: "publications", items: [{ evidence_id: `publications:${IDS.pub}`, bullets: [] }] },
          { type: "certifications", items: [{ evidence_id: `certifications:${IDS.cert}`, bullets: [] }] },
          { type: "awards", items: [{ evidence_id: `achievements:${IDS.award}`, bullets: [] }] },
          { type: "languages", items: [] },
        ],
        skill_groups: [
          { label: language === "ar" ? "البرمجة والبيانات" : "Programming & Data", skill_ids: [`skills:${IDS.skillPy}`, `skills:${IDS.skillSql}`] },
          { label: language === "ar" ? "المهارات المهنية" : "Professional", skill_ids: [`skills:${IDS.skillLead}`] },
        ],
        notes_for_user: [],
      },
      analysis: sampleAnalysis(),
      language,
      layout: "classic",
      length: "one_page",
      model: null,
    });
    const pdf = await renderResumePdf(doc, { title: "Sample", author: "Sara", subject: "Sample", keywords: [] });
    writeFileSync(`${OUT}/sample-${language}.pdf`, pdf);
  }
}, 120_000);
