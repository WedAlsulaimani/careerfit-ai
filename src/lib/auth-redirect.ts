/**
 * Only same-site relative paths are accepted as post-login redirects (prevents open redirects).
 * ASCII control characters are rejected because URL parsers strip tab/CR/LF, which would turn
 * "/\t/evil.com" into the protocol-relative URL "//evil.com".
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (CONTROL_CHARS.test(next)) return fallback;
  return next;
}
