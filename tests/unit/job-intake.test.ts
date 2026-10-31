import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { extractJobFromHtml } from "@/lib/jobs/html-extract";
import { composeManualJobText, normalizeJobAnalysis, type RawJobAnalysis } from "@/lib/jobs/analysis";
import { classifyQrPayload } from "@/lib/jobs/qr";
import { detectFileType } from "@/lib/files";
import { manualJobSchema } from "@/lib/schemas/job";

describe("URL intake — HTML extraction (scenario 6)", () => {
  it("prefers schema.org JobPosting JSON-LD", () => {
    const html = `<html><head><title>Careers</title>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Junior Data Analyst",
        hiringOrganization: { "@type": "Organization", name: "Acme Fintech" },
        jobLocation: { address: { addressLocality: "Riyadh", addressCountry: "SA" } },
        employmentType: "FULL_TIME",
        validThrough: "2026-12-31T23:59:00Z",
        description:
          "<p>We are hiring a junior data analyst.</p><ul><li>Python and SQL required</li><li>Tableau is a plus</li></ul><p>Work with finance teams to build dashboards and analyse transaction data every week.</p>",
      })}</script></head><body><nav>Home Jobs</nav><main>noise</main></body></html>`;
    const job = extractJobFromHtml(html);
    expect(job.method).toBe("json_ld");
    expect(job.title).toBe("Junior Data Analyst");
    expect(job.organization).toBe("Acme Fintech");
    expect(job.deadline).toBe("2026-12-31");
    expect(job.text).toContain("- Python and SQL required");
    expect(job.text).not.toContain("<li>");
  });

  it("falls back to main content and strips navigation, scripts and footers", () => {
    const body = "Responsibilities include building dashboards and cleaning data. ".repeat(12);
    const html = `<html><body><header>Site header</header><nav>Menu Login Signup</nav>
      <main><h1>Data Analyst</h1><p>${body}</p><script>alert("x")</script></main>
      <footer>Copyright footer</footer></body></html>`;
    const job = extractJobFromHtml(html);
    expect(job.method).toBe("main_content");
    expect(job.title).toBe("Data Analyst");
    expect(job.text).toContain("Responsibilities include");
    expect(job.text).not.toMatch(/Menu Login|Copyright footer|alert/);
  });
});

describe("Manual entry (scenario 9)", () => {
  it("validates and composes labelled source text", () => {
    const input = manualJobSchema.parse({
      title: "Junior Data Analyst",
      organization: "Acme",
      description: "Analyse data",
      required_skills: "Python, SQL",
      preferred_skills: "Tableau",
      source_url: "",
      deadline: "",
    });
    const text = composeManualJobText(input);
    expect(text).toContain("Required skills (mandatory):\nPython, SQL");
    expect(text).toContain("Preferred skills (nice to have):\nTableau");
    expect(text).not.toContain("Original advertisement URL");
  });
  it("rejects unsafe source URLs", () => {
    expect(manualJobSchema.safeParse({ title: "x", source_url: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("Job analysis normalisation (scenario 10)", () => {
  const source = "Requirements: Bachelor's degree in Computer Science. Strong Python and SQL skills. Nice to have: Tableau.";
  const raw: RawJobAnalysis = {
    is_job_posting: true,
    title: "Data Analyst",
    employer: "Acme",
    industry: null,
    employment_type: null,
    location: null,
    seniority: null,
    deadline: "next Friday",
    summary: null,
    requirements: [
      { text: "Bachelor's in CS", category: "mandatory", type: "education", keywords: ["Computer Science"], source_quote: "Bachelor's degree in Computer Science" },
      { text: "Python and SQL", category: "mandatory", type: "technical_skill", keywords: ["Python", "SQL", "python"], source_quote: "Strong Python and SQL skills" },
      { text: "Kubernetes", category: "preferred", type: "tool", keywords: ["Kubernetes"], source_quote: "Experience running Kubernetes clusters in production" },
    ],
    responsibilities: [],
    ats_keywords: ["Python", "SQL", "Python"],
    domain_terms: [],
    tools: [],
    eligibility: [],
    uncertain_fields: [],
  };

  it("assigns ids, dedupes keywords and validates against the strict schema", () => {
    const a = normalizeJobAnalysis(raw, source);
    expect(a.requirements.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(a.requirements[1].keywords).toEqual(["Python", "SQL"]);
    expect(a.ats_keywords).toEqual(["Python", "SQL"]);
  });

  it("flags requirements whose quote is not in the source (possible hallucination)", () => {
    const a = normalizeJobAnalysis(raw, source);
    expect(a.requirements[0].quote_verified).toBe(true);
    expect(a.requirements[1].quote_verified).toBe(true);
    expect(a.requirements[2].quote_verified).toBe(false);
    expect(a.uncertain_fields.some((u) => u.field === "requirements")).toBe(true);
  });

  it("drops a non-date deadline instead of guessing", () => {
    const a = normalizeJobAnalysis(raw, source);
    expect(a.deadline).toBeNull();
    expect(a.uncertain_fields.some((u) => u.field === "deadline")).toBe(true);
  });
});

describe("Image intake — file validation (scenario 7)", () => {
  it("identifies files by magic bytes, not by name", () => {
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectFileType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(detectFileType(new TextEncoder().encode("%PDF-1.7"))?.mime).toBe("application/pdf");
    expect(detectFileType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectFileType(new TextEncoder().encode("MZ executable"))).toBeNull();
  });
});

describe("QR intake (scenario 8)", () => {
  it("classifies decoded payloads", () => {
    expect(classifyQrPayload("https://jobs.example.com/123")).toEqual({ kind: "url", url: "https://jobs.example.com/123" });
    expect(classifyQrPayload("www.example.com/jobs")).toEqual({ kind: "url", url: "https://www.example.com/jobs" });
    expect(classifyQrPayload("WIFI:S:Office;T:WPA;P:secret;;").kind).toBe("unsupported");
    expect(classifyQrPayload("BEGIN:VCARD\nFN:John\nEND:VCARD").kind).toBe("unsupported");
    expect(classifyQrPayload("javascript:alert(1)").kind).toBe("unsupported");
    expect(classifyQrPayload("Junior Data Analyst at Acme. Requirements: Python, SQL.").kind).toBe("text");
    expect(classifyQrPayload("   ").kind).toBe("unsupported");
  });

  it("decodes a real QR code with ZXing", () => {
    const payload = "https://jobs.example.com/data-analyst?id=42";
    const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
    const modules = qr.modules.size;
    const scale = 6;
    const quiet = 4;
    const size = (modules + quiet * 2) * scale;
    const luminance = new Uint8ClampedArray(size * size).fill(255);
    for (let y = 0; y < modules; y++) {
      for (let x = 0; x < modules; x++) {
        if (!qr.modules.get(x, y)) continue;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) luminance[((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx] = 0;
      }
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, size, size)));
    const decoded = new QRCodeReader().decode(bitmap).getText();
    expect(decoded).toBe(payload);
    expect(classifyQrPayload(decoded)).toEqual({ kind: "url", url: payload });
  });
});
