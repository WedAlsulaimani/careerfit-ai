/**
 * Text normalisation used by every evidence check. Handles Latin and Arabic:
 * case folding, Arabic-Indic digits, diacritics (tashkeel/tatweel) and common
 * letter variants, so comparisons are robust across languages.
 */
const ARABIC_INDIC = /[٠-٩]/g;
const EXT_ARABIC_INDIC = /[۰-۹]/g;
const TASHKEEL = /[ً-ٰٟـ]/g;

export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(TASHKEEL, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[‘’“”]/g, "'")
    .replace(/[‐-―]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Word tokens (Latin letters/digits, Arabic letters, and tech symbols like c++, c#, .net). */
export function tokens(input: string): string[] {
  return normalizeText(input).match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [];
}

/**
 * Numeric claims in a piece of text: integers, decimals and percentages.
 * Returned in canonical form ("1,200" → "1200", "3,5" → "3.5").
 */
export function extractNumbers(input: string): string[] {
  const text = normalizeText(input);
  const matches = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return matches.map(canonicalNumber);
}

function canonicalNumber(n: string): string {
  // Thousands separators: 1,200 or 1.200.000 → 1200 / 1200000
  if (/^\d{1,3}([,.]\d{3})+$/.test(n)) return n.replace(/[,.]/g, "");
  return n.replace(",", ".");
}

/** True when `needle` appears in `haystack` as a whole term (after normalisation). */
export function containsTerm(haystack: string, needle: string): boolean {
  const h = ` ${tokens(haystack).join(" ")} `;
  const n = tokens(needle).join(" ");
  if (!n) return false;
  return h.includes(` ${n} `);
}

/**
 * Checks whether a quote taken from a source document is really present.
 * Exact normalised substring first, then a token-overlap fallback that
 * tolerates whitespace/punctuation differences introduced by extraction.
 */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalizeText(quote);
  if (!q) return false;
  const s = normalizeText(source);
  if (s.includes(q)) return true;
  const qTokens = tokens(quote);
  if (qTokens.length < 3) return false;
  const sTokens = new Set(tokens(source));
  const hits = qTokens.filter((t) => sTokens.has(t)).length;
  return hits / qTokens.length >= 0.85;
}
