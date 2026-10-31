/** Classifies decoded QR content: a job link, job text, or something unrelated. */
export type QrPayload =
  | { kind: "url"; url: string }
  | { kind: "text"; text: string }
  | { kind: "unsupported"; type: string };

const UNSUPPORTED_PREFIXES: [RegExp, string][] = [
  [/^WIFI:/i, "Wi-Fi"],
  [/^BEGIN:VCARD/i, "contact card"],
  [/^MECARD:/i, "contact card"],
  [/^BEGIN:VEVENT|^BEGIN:VCALENDAR/i, "calendar event"],
  [/^(tel|sms|smsto|mms):/i, "phone"],
  [/^mailto:|^MATMSG:/i, "email"],
  [/^geo:/i, "location"],
  [/^(bitcoin|ethereum|lightning):/i, "payment"],
  [/^otpauth:/i, "authentication"],
];

export function classifyQrPayload(raw: string): QrPayload {
  const text = raw.replace(/\u0000/g, "").trim();
  if (!text) return { kind: "unsupported", type: "empty" };
  for (const [re, type] of UNSUPPORTED_PREFIXES) if (re.test(text)) return { kind: "unsupported", type };
  if (/^https?:\/\/\S+$/i.test(text)) return { kind: "url", url: text };
  if (/^www\.[^\s]+\.[^\s]+$/i.test(text)) return { kind: "url", url: `https://${text}` };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) return { kind: "unsupported", type: text.split(":")[0].toLowerCase() };
  return { kind: "text", text };
}
