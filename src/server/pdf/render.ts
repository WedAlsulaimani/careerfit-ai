import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractText } from "unpdf";
import { tokens } from "@/lib/evidence/text";
import type { ResumeDocument } from "@/lib/schemas/resume";
import { FONT_FILES, fontFaceCss, renderResumeHtml, resumePlainText } from "@/lib/resume/template";

/**
 * Resume → PDF via headless Chromium. Chromium gives correct Arabic shaping and
 * bidirectional layout, selectable/searchable text, live links and a tagged
 * PDF. Fonts are embedded from /public/fonts (Noto Sans + Noto Sans Arabic,
 * SIL OFL) so output is identical locally and on Vercel.
 *
 * After rendering, the PDF text layer is extracted and compared with the
 * resume text; a PDF whose text cannot be extracted is never returned.
 */
export class PdfUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfUnavailableError";
  }
}
export class PdfValidationError extends Error {
  constructor(
    message: string,
    public readonly coverage: number,
  ) {
    super(message);
    this.name = "PdfValidationError";
  }
}

const LOCAL_BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
];

async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  const executablePath = configured || LOCAL_BROWSER_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    throw new PdfUnavailableError(
      "No Chromium-based browser found for PDF rendering. Set CHROME_EXECUTABLE_PATH (see .env.example).",
    );
  }
  return puppeteer.launch({ executablePath, headless: true, args: ["--disable-gpu", "--no-first-run"] });
}

let fontCssCache: string | null = null;
async function inlineFontCss(): Promise<string> {
  if (fontCssCache) return fontCssCache;
  const dir = path.join(process.cwd(), "public", "fonts");
  const data = new Map<string, string>();
  for (const f of FONT_FILES) {
    const buf = await readFile(path.join(dir, f.file));
    data.set(f.file, `data:font/woff2;base64,${buf.toString("base64")}`);
  }
  fontCssCache = fontFaceCss((file) => data.get(file)!);
  return fontCssCache;
}

export interface PdfMeta {
  title: string;
  author: string;
  subject: string;
  keywords: string[];
}

/** Renders and verifies; a PDF without a readable text layer is never returned. */
export async function renderResumePdf(doc: ResumeDocument, meta: PdfMeta): Promise<Uint8Array> {
  const pdf = await renderResumePdfUnchecked(doc, meta);
  await assertExtractable(pdf, doc);
  return pdf;
}

/** Rendering only (no text-layer verification). Exposed for diagnostics and tests. */
export async function renderResumePdfUnchecked(doc: ResumeDocument, meta: PdfMeta): Promise<Uint8Array> {
  const html = renderResumeHtml(doc, { fontCss: await inlineFontCss(), title: meta.title });

  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    if (err instanceof PdfUnavailableError) throw err;
    throw new PdfUnavailableError("The PDF renderer could not start.");
  }

  let pdf: Uint8Array;
  try {
    const page = await browser.newPage();
    // The document is fully self-contained: block every network request so
    // resume content can never make the renderer fetch anything.
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.url().startsWith("data:") || req.url() === "about:blank") void req.continue();
      else void req.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      tagged: true,
      timeout: 30_000,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }

  // Document metadata.
  const pdfDoc = await PDFDocument.load(pdf);
  pdfDoc.setTitle(meta.title);
  pdfDoc.setAuthor(meta.author);
  pdfDoc.setSubject(meta.subject);
  pdfDoc.setKeywords(meta.keywords.slice(0, 30));
  pdfDoc.setCreator("CareerFit AI");
  pdfDoc.setProducer("CareerFit AI (Chromium + pdf-lib)");
  pdfDoc.setLanguage(doc.language === "ar" ? "ar" : "en");
  const now = new Date();
  pdfDoc.setCreationDate(now);
  pdfDoc.setModificationDate(now);
  return pdfDoc.save();
}

/**
 * Verifies the PDF has a real text layer that matches the resume content.
 * Thresholds: ≥ 90% of word tokens for English; ≥ 80% for Arabic, where a few
 * Amiri ligatures and glyph-position splits are known extraction gaps
 * (documented in docs/ARCHITECTURE.md). Throws instead of returning a PDF
 * whose text an ATS could not read.
 */
export async function assertExtractable(pdf: Uint8Array, doc: ResumeDocument): Promise<{ coverage: number; text: string }> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  const expected = tokens(resumePlainText(doc)).filter((t) => t.length > 1);
  if (expected.length === 0) return { coverage: 1, text };
  const found = new Set(tokens(text));
  const hits = expected.filter((t) => found.has(t)).length;
  const coverage = hits / expected.length;
  if (coverage < (doc.language === "ar" ? 0.8 : 0.9)) {
    throw new PdfValidationError("The generated PDF's text layer could not be verified.", coverage);
  }
  return { coverage, text };
}
