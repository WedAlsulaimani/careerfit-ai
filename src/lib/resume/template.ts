import { isSafeHttpUrl } from "@/lib/schemas/common";
import type { ResumeDocument, ResumeItem, ResumeSection } from "@/lib/schemas/resume";

/**
 * ATS-friendly resume template rendered to a self-contained HTML string.
 * The same output feeds the editor's live preview (sandboxed iframe) and the
 * PDF renderer, so what users see is exactly what is exported.
 *
 * Layout rules: single column, standard headings, real text (no images,
 * icons, tables, text boxes or skill bars), logical DOM reading order.
 * Every interpolated value is HTML-escaped.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

function link(url: string, label: string): string {
  if (!isSafeHttpUrl(url)) return e(label);
  return `<a href="${e(url)}">${e(label)}</a>`;
}

/** Visible URL text: drop the scheme so ATS parsers and humans read a clean address. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function renderItem(item: ResumeItem): string {
  const bullets = item.bullets.filter((b) => b.visible);
  const headParts: string[] = [];
  if (item.title) headParts.push(`<span class="item-title">${e(item.title)}</span>`);
  if (item.subtitle) headParts.push(`<span class="item-subtitle">${e(item.subtitle)}</span>`);
  const head = headParts.join(`<span class="sep"> | </span>`);
  const metaParts = [item.location, item.meta].filter(Boolean).map((m) => e(m));
  const links = item.links.map((l) => link(l.url, l.label)).join(`<span class="sep"> | </span>`);

  let html = `<div class="item">`;
  // Inline items (skill groups, languages) carry their label inside the line itself.
  const inlineOnly = Boolean(item.inline) && !item.subtitle && !metaParts.length;
  if ((head || metaParts.length) && !inlineOnly) {
    html += `<p class="item-head">${head}${metaParts.length ? `<span class="item-meta">${metaParts.join(" | ")}</span>` : ""}</p>`;
  }
  if (item.inline) {
    html += item.title
      ? `<p class="inline"><span class="inline-label">${e(item.title)}:</span> ${e(item.inline)}</p>`
      : `<p class="inline">${e(item.inline)}</p>`;
  }
  for (const d of item.details) html += `<p class="detail">${e(d)}</p>`;
  if (links) html += `<p class="detail">${links}</p>`;
  if (bullets.length) {
    html += `<ul>${bullets.map((b) => `<li>${e(b.text)}</li>`).join("")}</ul>`;
  }
  html += `</div>`;
  return html;
}

function renderSection(section: ResumeSection): string {
  if (!section.visible) return "";
  const items = section.items.filter((i) => i.visible);
  if (section.type === "summary") {
    if (!section.text) return "";
    return `<section><h2>${e(section.heading)}</h2><p class="summary">${e(section.text)}</p></section>`;
  }
  if (!items.length && !section.text) return "";
  const isSkillLike = items.every((i) => i.inline && !i.bullets.length && !i.subtitle);
  return `<section${isSkillLike ? ` class="compact-list"` : ""}><h2>${e(section.heading)}</h2>${
    section.text ? `<p class="summary">${e(section.text)}</p>` : ""
  }${items.map(renderItem).join("")}</section>`;
}

export interface RenderOptions {
  /** @font-face rules. PDF rendering inlines fonts; previews reference /fonts. */
  fontCss: string;
  title?: string;
}

export function renderResumeHtml(doc: ResumeDocument, opts: RenderOptions): string {
  const rtl = doc.language === "ar";
  const compact = doc.layout === "compact";
  const h = doc.header;

  const contact: string[] = [];
  if (h.email) contact.push(`<a href="mailto:${e(h.email)}">${e(h.email)}</a>`);
  if (h.phone) contact.push(`<span dir="ltr">${e(h.phone)}</span>`);
  if (h.location) contact.push(e(h.location));
  for (const l of h.links) contact.push(link(l.url, displayUrl(l.url)));
  for (const x of h.extras) contact.push(`${e(x.label)}: ${e(x.value)}`);

  // Naskh glyphs read smaller than Latin sans at the same size.
  const baseSize = (compact ? 9.6 : 10.4) + (rtl ? 0.6 : 0);
  const css = `
${opts.fontCss}
@page { size: A4; margin: ${compact ? "12mm 13mm" : "14mm 15mm"}; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0; color: #111; background: #fff;
  font-family: "Noto Sans", "Amiri", Arial, sans-serif;
  font-size: ${baseSize}pt; line-height: ${rtl ? (compact ? 1.36 : 1.44) : compact ? 1.3 : 1.38};
  direction: ${rtl ? "rtl" : "ltr"}; text-align: ${rtl ? "right" : "left"};
}
.page { max-width: 180mm; margin: 0 auto; }
a { color: #111; text-decoration: none; }
header { margin-bottom: ${compact ? 6 : 8}pt; text-align: center; }
h1 { font-size: ${compact ? 17 : 19}pt; margin: 0 0 2pt; font-weight: 700; letter-spacing: ${rtl ? 0 : 0.2}pt; }
.headline { margin: 0 0 3pt; font-size: ${baseSize + 0.6}pt; }
.contact { margin: 0; font-size: ${baseSize - 0.6}pt; }
.contact .sep { padding: 0 4pt; color: #555; }
section { margin-top: ${compact ? 6 : 8}pt; }
h2 {
  font-size: ${baseSize + 1.4}pt; font-weight: 700; margin: 0 0 3pt; padding-bottom: 1.5pt;
  border-bottom: 0.75pt solid #222; text-transform: ${rtl ? "none" : "uppercase"}; letter-spacing: ${rtl ? 0 : 0.5}pt;
  break-after: avoid; page-break-after: avoid;
}
.item { margin: 0 0 ${compact ? 3.5 : 5}pt; break-inside: avoid; page-break-inside: avoid; }
.item-head { margin: 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 8pt; }
.item-title { font-weight: 700; }
.item-subtitle { font-style: ${rtl ? "normal" : "italic"}; }
.item-meta { margin-${rtl ? "right" : "left"}: auto; white-space: nowrap; }
.sep { color: #555; }
.detail, .inline, .summary { margin: 1pt 0 0; }
.inline-label { font-weight: 700; }
ul { margin: 1.5pt 0 0; padding-${rtl ? "right" : "left"}: 13pt; padding-${rtl ? "left" : "right"}: 0; }
li { margin: 0 0 1pt; }
.compact-list .item { margin-bottom: 1.5pt; }
`;

  const title = opts.title ?? (h.name ? `${h.name} — Resume` : "Resume");
  return `<!doctype html>
<html lang="${doc.language}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="page">
<header>
${h.name ? `<h1>${e(h.name)}</h1>` : ""}
${h.headline ? `<p class="headline">${e(h.headline)}</p>` : ""}
${contact.length ? `<p class="contact">${contact.join(`<span class="sep">|</span>`)}</p>` : ""}
</header>
${doc.sections.map(renderSection).join("\n")}
</div>
</body>
</html>`;
}

/** Plain-text rendering in reading order (used for keyword coverage). */
export function resumePlainText(doc: ResumeDocument): string {
  const out: string[] = [doc.header.name, doc.header.headline];
  for (const s of doc.sections) {
    if (!s.visible) continue;
    out.push(s.heading, s.text);
    for (const i of s.items) {
      if (!i.visible) continue;
      out.push(i.title, i.subtitle, i.meta, i.location, i.inline, ...i.details);
      for (const b of i.bullets) if (b.visible) out.push(b.text);
    }
  }
  return out.filter(Boolean).join("\n");
}

export function previewFontCss(): string {
  return fontFaceCss((file) => `/fonts/${file}`);
}

export const FONT_FILES = [
  { family: "Noto Sans", weight: 400, file: "noto-sans-latin-400-normal.woff2", range: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  { family: "Noto Sans", weight: 700, file: "noto-sans-latin-700-normal.woff2", range: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  { family: "Noto Sans", weight: 400, file: "noto-sans-latin-ext-400-normal.woff2", range: "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  { family: "Noto Sans", weight: 700, file: "noto-sans-latin-ext-700-normal.woff2", range: "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  // Amiri (SIL OFL) for Arabic in resumes: unlike Noto Sans Arabic, whose dotless
  // base glyphs lose their Unicode mapping in Chromium PDFs, Amiri's text layer
  // extracts as real Arabic letters in logical order (see docs/ARCHITECTURE.md).
  { family: "Amiri", weight: 400, file: "amiri-arabic-400-normal.woff2", range: "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC" },
  { family: "Amiri", weight: 700, file: "amiri-arabic-700-normal.woff2", range: "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC" },
] as const;

export function fontFaceCss(src: (file: string) => string): string {
  return FONT_FILES.map(
    (f) =>
      `@font-face { font-family: "${f.family}"; font-style: normal; font-weight: ${f.weight}; font-display: block; src: url("${src(f.file)}") format("woff2"); unicode-range: ${f.range}; }`,
  ).join("\n");
}
