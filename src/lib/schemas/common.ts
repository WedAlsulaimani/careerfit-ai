import { z } from "zod";

/** Trimmed optional text; empty strings become null. */
export const optText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
    z.string().max(max).nullable(),
  );

/** Trimmed required text. */
export const reqText = (max: number) => z.string().trim().min(1).max(max);

/** Only http(s) URLs are accepted, which blocks javascript:/data: link injection. */
export const isSafeHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
};

export const optUrl = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
  z.string().max(500).refine(isSafeHttpUrl, { message: "invalid_url" }).nullable(),
);

/** ISO calendar date (YYYY-MM-DD) or null. */
export const optDate = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalid_date" })
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "invalid_date" })
    .nullable(),
);

/** List of trimmed, de-duplicated, non-empty strings. Accepts a newline/comma string too. */
export const strList = (maxItems: number, maxLen: number, splitOnComma = false) =>
  z.preprocess(
    (v) => {
      const raw = Array.isArray(v)
        ? v
        : typeof v === "string"
          ? v.split(splitOnComma ? /[\n,]/ : /\n/)
          : [];
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of raw) {
        if (typeof item !== "string") continue;
        const s = item.trim().replace(/^[-•*]\s+/, "");
        if (!s || seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        out.push(s);
      }
      return out;
    },
    z.array(z.string().max(maxLen)).max(maxItems),
  );

export const optBool = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}, z.boolean().nullable());

export const bool = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

export const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(values).nullable());

export const uuid = z.uuid();

export type Locale = "en" | "ar";
export const localeSchema = z.enum(["en", "ar"]);
