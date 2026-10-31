import { describe, expect, it } from "vitest";
import { buildEvidenceCatalog, catalogIndex } from "@/lib/evidence/catalog";
import { buildWatchTerms, checkClaim } from "@/lib/evidence/validate";
import { extractNumbers, normalizeText, quoteAppearsIn } from "@/lib/evidence/text";
import { computeScore, validateMatch } from "@/lib/matching/match";
import { composeResume, type ResumePlan } from "@/lib/resume/compose";
import { jobWatchTerms } from "@/lib/jobs/analysis";
import { resumeDocumentSchema } from "@/lib/schemas/resume";
import { IDS, sampleAnalysis, sampleSnapshot } from "../fixtures/profile";

const records = buildEvidenceCatalog(sampleSnapshot());
const ctx = () => ({ index: catalogIndex(records), watchTerms: buildWatchTerms(jobWatchTerms(sampleAnalysis()), records) });

describe("text normalisation", () => {
  it("normalises Arabic digits and letter variants", () => {
    expect(extractNumbers("خفض الوقت ٣ أيام إلى ١ يوم")).toEqual(["3", "1"]);
    expect(normalizeText("إدارة البيانات")).toBe(normalizeText("ادارة البيانات"));
    expect(extractNumbers("Saved 1,200 hours and 3,5 days")).toEqual(["1200", "3.5"]);
  });
  it("finds quotes despite whitespace differences", () => {
    expect(quoteAppearsIn("Strong   Python\nand SQL", "We need strong Python and SQL skills.")).toBe(true);
    expect(quoteAppearsIn("Kubernetes in production", "We need strong Python and SQL skills.")).toBe(false);
  });
});

describe("Evidence matching uses real profile records (scenario 11)", () => {
  const analysis = sampleAnalysis();

  it("removes unknown evidence ids and downgrades unsupported matches", () => {
    const result = validateMatch(
      {
        requirements: [
          { requirement_id: "r1", status: "strong", evidence_ids: [`education:${IDS.edu}`], reasoning: "BSc CS" },
          { requirement_id: "r2", status: "strong", evidence_ids: [`projects:${IDS.projData}`, "projects:00000000-0000-4000-8000-000000000000"], reasoning: "Python in capstone" },
          // Related experience is never proof of a certification.
          { requirement_id: "r3", status: "strong", evidence_ids: [`experiences:${IDS.intern}`], reasoning: "used data tools" },
          // Claimed match with a fabricated record id.
          { requirement_id: "r4", status: "partial", evidence_ids: ["projects:fake"], reasoning: "made up" },
        ],
        recommended_evidence_ids: [`projects:${IDS.projData}`, "skills:not-real"],
        supported_keywords: ["Python", "Kubernetes"],
        clarifying_questions: [{ evidence_id: `experiences:${IDS.club}`, question: "Did you lead a team?" }],
        improvement_recommendations: [],
      },
      analysis,
      records,
    );
    const byId = Object.fromEntries(result.requirements.map((r) => [r.requirement_id, r]));
    expect(byId.r1.status).toBe("strong");
    expect(byId.r2.evidence_ids).toEqual([`projects:${IDS.projData}`]);
    expect(byId.r3.status).toBe("partial");
    expect(byId.r3.adjusted).toBe("requires_explicit_record");
    expect(byId.r4.status).toBe("missing");
    expect(byId.r4.adjusted).toBe("no_valid_evidence");
    expect(result.recommended_evidence_ids).toEqual([`projects:${IDS.projData}`]);
    // Keywords are "supported" only if they literally appear in the profile.
    expect(result.supported_keywords).toContain("Python");
    expect(result.supported_keywords).toContain("Power BI");
    expect(result.unsupported_keywords).toContain("Kubernetes");
    expect(result.unsupported_keywords).toContain("Tableau");
  });

  it("reports requirements the model skipped as missing", () => {
    const result = validateMatch(
      { requirements: [], recommended_evidence_ids: [], supported_keywords: [], clarifying_questions: [], improvement_recommendations: [] },
      analysis,
      records,
    );
    expect(result.requirements.every((r) => r.status === "missing" && r.adjusted === "not_assessed")).toBe(true);
    expect(result.score.overall).toBe(0);
  });

  it("computes the documented heuristic", () => {
    const score = computeScore(analysis, [
      { requirement_id: "r1", status: "strong", evidence_ids: [], reasoning: "", adjusted: null },
      { requirement_id: "r2", status: "partial", evidence_ids: [], reasoning: "", adjusted: null },
      { requirement_id: "r3", status: "missing", evidence_ids: [], reasoning: "", adjusted: null },
      { requirement_id: "r4", status: "strong", evidence_ids: [], reasoning: "", adjusted: null },
    ]);
    expect(score.mandatory_coverage).toBe(75);
    expect(score.preferred_coverage).toBe(50);
    expect(score.overall).toBe(67.5);
    expect(score.method).toBe("heuristic_v1");
  });
});

describe("Anti-hallucination claim checks (scenario 12)", () => {
  it("rejects statements with no valid evidence", () => {
    const r = checkClaim("Led a team of engineers", ["projects:does-not-exist"], ctx());
    expect(r.rejected).toBe(true);
  });
  it("flags numbers that are not in the cited records", () => {
    const ok = checkClaim("Reduced report preparation time from 3 days to 1 day", [`experiences:${IDS.intern}`], ctx());
    expect(ok.flags).toEqual([]);
    const bad = checkClaim("Increased dashboard adoption by 45%", [`experiences:${IDS.intern}`], ctx());
    expect(bad.flags).toContain("unsupported_number:45");
    expect(bad.needsReview).toBe(true);
  });
  it("flags job keywords or skills the cited record does not support", () => {
    const r = checkClaim("Deployed forecasting models on Kubernetes using Tableau", [`projects:${IDS.projData}`], ctx());
    expect(r.flags).toEqual(expect.arrayContaining(["unsupported_term:Kubernetes", "unsupported_term:Tableau"]));
  });
  it("flags certification claims without a certification record", () => {
    const r = checkClaim("Certified data analyst with strong Python skills", [`projects:${IDS.projData}`], ctx());
    expect(r.flags).toContain("unsupported_certification_claim");
  });
});

describe("Resume composition (scenarios 12 and 13)", () => {
  const plan: ResumePlan = {
    summary: { text: "Computer Science graduate with hands-on data analysis experience in Python and SQL.", evidence_ids: [`education:${IDS.edu}`, `experiences:${IDS.intern}`] },
    sections: [
      { type: "education", items: [{ evidence_id: `education:${IDS.edu}`, bullets: [] }] },
      {
        type: "internships",
        items: [
          {
            evidence_id: `experiences:${IDS.intern}`,
            bullets: [
              { text: "Automated a manual report, reducing preparation time from 3 days to 1 day", evidence_ids: [`experiences:${IDS.intern}`] },
              { text: "Improved forecast accuracy by 40% using Tableau", evidence_ids: [`experiences:${IDS.intern}`] },
              { text: "Invented achievement with no source", evidence_ids: ["experiences:ghost"] },
            ],
          },
        ],
      },
      // A personal project must not be presented as employment.
      { type: "experience", items: [{ evidence_id: `projects:${IDS.projWeb}`, bullets: [{ text: "Built a site", evidence_ids: [`projects:${IDS.projWeb}`] }] }] },
      { type: "projects", items: [{ evidence_id: `projects:${IDS.projData}`, bullets: [{ text: "Built a time-series forecasting model in Python with scikit-learn", evidence_ids: [`projects:${IDS.projData}`] }] }] },
      { type: "publications", items: [{ evidence_id: `publications:${IDS.pub}`, bullets: [] }] },
      { type: "awards", items: [{ evidence_id: `achievements:${IDS.award}`, bullets: [] }] },
      { type: "projects", items: [{ evidence_id: "projects:00000000-0000-4000-8000-000000000000", bullets: [] }] },
    ],
    skill_groups: [{ label: "Technical", skill_ids: [`skills:${IDS.skillPy}`, `skills:${IDS.skillSql}`, "skills:kubernetes-invented"] }],
    notes_for_user: [],
  };
  const doc = composeResume({
    snapshot: sampleSnapshot(),
    records,
    plan,
    analysis: sampleAnalysis(),
    language: "en",
    layout: "classic",
    length: "one_page",
    model: "test-model",
  });

  it("produces a schema-valid document", () => {
    expect(resumeDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("copies facts from the database, never from the model", () => {
    const edu = doc.sections.find((s) => s.type === "education")!.items[0];
    expect(edu.title).toBe("King Saud University");
    expect(edu.meta).toBe("Sep 2019 – Jun 2024");
    // GPA is shown on its original scale — not converted to 4.0.
    expect(edu.details).toContain("GPA: 4.62 / 5.0");
    const intern = doc.sections.find((s) => s.type === "internships")!.items[0];
    expect(intern.subtitle).toBe("Riyad Bank");
  });

  it("keeps supported bullets, hides unverifiable ones, drops unsupported ones", () => {
    const bullets = doc.sections.find((s) => s.type === "internships")!.items[0].bullets;
    expect(bullets).toHaveLength(2);
    expect(bullets[0].status).toBe("verified");
    expect(bullets[0].visible).toBe(true);
    expect(bullets[1].status).toBe("needs_review");
    expect(bullets[1].visible).toBe(false);
    expect(bullets[1].flags).toEqual(expect.arrayContaining(["unsupported_number:40", "unsupported_term:Tableau"]));
  });

  it("never places a personal project under work experience", () => {
    expect(doc.sections.find((s) => s.type === "experience")).toBeUndefined();
    expect(doc.meta.notes.some((n) => n.includes("Personal Portfolio Website"))).toBe(true);
  });

  it("only lists skills that exist in the profile", () => {
    const skills = doc.sections.find((s) => s.type === "skills")!.items[0].inline;
    expect(skills).toBe("Python, SQL");
  });

  it("preserves publication status and patent distinctions", () => {
    expect(doc.sections.find((s) => s.type === "publications")!.items[0].subtitle).toContain("Under review");
    expect(doc.sections.find((s) => s.type === "awards")!.items[0].subtitle).toContain("Patent application");
  });

  it("excludes sensitive personal details by default", () => {
    expect(doc.header.extras).toEqual([]);
    const withOptIn = composeResume({
      snapshot: { ...sampleSnapshot(), personal: { ...sampleSnapshot().personal, include_nationality_in_resume: true } },
      records,
      plan: { ...plan, sections: [] },
      analysis: sampleAnalysis(),
      language: "en",
      layout: "classic",
      length: "one_page",
      model: null,
    });
    expect(withOptIn.header.extras).toEqual([{ label: "Nationality", value: "Saudi" }]);
  });

  it("uses Arabic headings, Arabic name and Latin digits for Arabic resumes", () => {
    const ar = composeResume({ snapshot: sampleSnapshot(), records, plan, analysis: sampleAnalysis(), language: "ar", layout: "classic", length: "one_page", model: null });
    expect(ar.header.name).toBe("سارة الحربي");
    expect(ar.sections.find((s) => s.type === "education")!.heading).toBe("التعليم");
    expect(ar.sections.find((s) => s.type === "education")!.items[0].meta).toMatch(/2019.*2024/);
  });
});
