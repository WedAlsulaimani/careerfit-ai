import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Extracts job-advertisement text from an HTML page.
 *  1. schema.org JobPosting JSON-LD, when present (most reliable),
 *  2. otherwise the main content region with navigation/layout removed.
 * Output is plain text; HTML is never passed through.
 */
export interface ExtractedJob {
  method: "json_ld" | "main_content" | "plain_text";
  text: string;
  title: string | null;
  organization: string | null;
  location: string | null;
  employmentType: string | null;
  deadline: string | null;
  pageTitle: string | null;
}

const MAX_TEXT = 30000;

function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  return elementText($("#__root").get(0)!);
}

function elementText(root: AnyNode): string {
  const blocks = new Set([
    "p", "div", "section", "article", "li", "ul", "ol", "br", "h1", "h2", "h3", "h4", "h5", "h6",
    "tr", "table", "dd", "dt", "dl", "header", "footer", "main", "blockquote", "pre",
  ]);
  const out: string[] = [];
  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      out.push((node as unknown as { data: string }).data);
      return;
    }
    if (node.type !== "tag") return;
    const el = node as unknown as { name: string; children: AnyNode[] };
    const name = el.name.toLowerCase();
    if (name === "br") {
      out.push("\n");
      return;
    }
    if (name === "li") out.push("\n- ");
    else if (blocks.has(name)) out.push("\n");
    for (const c of el.children) walk(c);
    if (blocks.has(name)) out.push("\n");
  };
  walk(root);
  return out
    .join("")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type Json = Record<string, unknown>;

function findJobPosting(data: unknown): Json | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const d of data) {
      const found = findJobPosting(d);
      if (found) return found;
    }
    return null;
  }
  if (typeof data === "object") {
    const obj = data as Json;
    const type = obj["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
    if (obj["@graph"]) return findJobPosting(obj["@graph"]);
  }
  return null;
}

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ") || null;
  if (v && typeof v === "object") return str((v as Json).name ?? (v as Json)["@value"]);
  return null;
};

function locationOf(job: Json): string | null {
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : job.jobLocation ? [job.jobLocation] : [];
  const parts = (locs as Json[]).map((l) => {
    const a = (l?.address ?? {}) as Json;
    return [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)].filter(Boolean).join(", ");
  });
  const remote = job.jobLocationType === "TELECOMMUTE" ? "Remote" : null;
  return [...parts.filter(Boolean), remote].filter(Boolean).join(" / ") || null;
}

export function extractJobFromHtml(html: string, contentType = "text/html"): ExtractedJob {
  if (contentType.includes("text/plain")) {
    return {
      method: "plain_text",
      text: html.slice(0, MAX_TEXT),
      title: null,
      organization: null,
      location: null,
      employmentType: null,
      deadline: null,
      pageTitle: null,
    };
  }
  const $ = cheerio.load(html);
  const pageTitle = $("title").first().text().trim() || null;

  // 1) JSON-LD JobPosting
  let job: Json | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (job) return;
    try {
      job = findJobPosting(JSON.parse($(el).text()));
    } catch {
      /* malformed JSON-LD is ignored */
    }
  });
  if (job) {
    const j = job as Json;
    const sections: [string, unknown][] = [
      ["Title", j.title],
      ["Organization", (j.hiringOrganization as Json | undefined)?.name ?? j.hiringOrganization],
      ["Location", locationOf(j)],
      ["Employment type", j.employmentType],
      ["Date posted", j.datePosted],
      ["Apply before", j.validThrough],
    ];
    const header = sections
      .map(([k, v]) => [k, str(v)] as const)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const bodyParts: string[] = [];
    if (typeof j.description === "string") bodyParts.push(htmlToText(j.description));
    for (const key of ["responsibilities", "qualifications", "skills", "educationRequirements", "experienceRequirements"]) {
      const v = j[key];
      const t = typeof v === "string" ? htmlToText(v) : str(v);
      if (t) bodyParts.push(`${key}:\n${t}`);
    }
    const text = `${header}\n\n${bodyParts.join("\n\n")}`.trim();
    if (text.length > 200) {
      const validThrough = str(j.validThrough);
      return {
        method: "json_ld",
        text: text.slice(0, MAX_TEXT),
        title: str(j.title),
        organization: str((j.hiringOrganization as Json | undefined)?.name ?? j.hiringOrganization),
        location: locationOf(j),
        employmentType: str(j.employmentType),
        deadline: validThrough && /^\d{4}-\d{2}-\d{2}/.test(validThrough) ? validThrough.slice(0, 10) : null,
        pageTitle,
      };
    }
  }

  // 2) Main content
  $("script, style, noscript, template, svg, iframe, form, nav, header, footer, aside, button, select, input").remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"], .cookie, .cookies, #cookie-banner').remove();

  const candidates = ["main", "article", '[role="main"]', '[class*="job-description"]', '[class*="jobDescription"]', '[id*="job"]', "#content", ".content"];
  let best: AnyNode | null = null;
  let bestLen = 0;
  for (const sel of candidates) {
    $(sel).each((_, el) => {
      const len = $(el).text().replace(/\s+/g, " ").length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    });
    if (bestLen > 600) break;
  }
  const root = best ?? $("body").get(0) ?? null;
  const text = root ? elementText(root) : "";
  const h1 = $("h1").first().text().trim() || null;
  return {
    method: "main_content",
    text: text.slice(0, MAX_TEXT),
    title: h1,
    organization: null,
    location: null,
    employmentType: null,
    deadline: null,
    pageTitle,
  };
}
