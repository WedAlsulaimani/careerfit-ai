import "server-only";
import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";

/**
 * SSRF protection for user-supplied URLs.
 *  - http/https only, default ports only, no embedded credentials
 *  - hostname must not be localhost / internal-looking names
 *  - every resolved address must be public unicast (blocks private, loopback,
 *    link-local incl. 169.254.169.254 metadata, CGNAT, multicast, reserved,
 *    IPv4-mapped IPv6, unique-local, etc.)
 * The same address check runs again at connect time (see fetch-url.ts), so a
 * DNS rebinding between validation and connection is also rejected.
 */
export class UrlRejectedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "UrlRejectedError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home", ".corp", ".localdomain"];

export function parseAndCheckUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlRejectedError("malformed_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UrlRejectedError("unsupported_scheme");
  if (url.username || url.password) throw new UrlRejectedError("credentials_in_url");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new UrlRejectedError("non_standard_port");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new UrlRejectedError("missing_host");
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UrlRejectedError("internal_host");
  }
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (ipaddr.isValid(literal)) {
    if (!isPublicAddress(literal)) throw new UrlRejectedError("private_address");
  } else if (!host.includes(".")) {
    throw new UrlRejectedError("internal_host");
  }
  return url;
}

export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) return isPublicAddress(v6.toIPv4Address().toString());
    return v6.range() === "unicast";
  }
  const v4 = parsed as ipaddr.IPv4;
  if (v4.range() !== "unicast") return false;
  // ipaddr classifies some special-purpose blocks as unicast; reject them too.
  const blocked: [string, number][] = [
    ["0.0.0.0", 8],
    ["100.64.0.0", 10],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
  ];
  return !blocked.some(([net, bits]) => v4.match(ipaddr.IPv4.parse(net), bits));
}

/** Resolves a hostname and requires every address to be public. */
export async function resolvePublic(hostname: string): Promise<{ address: string; family: number }[]> {
  const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (ipaddr.isValid(literal)) {
    if (!isPublicAddress(literal)) throw new UrlRejectedError("private_address");
    return [{ address: literal, family: literal.includes(":") ? 6 : 4 }];
  }
  let results: { address: string; family: number }[];
  try {
    results = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlRejectedError("dns_failure");
  }
  if (!results.length) throw new UrlRejectedError("dns_failure");
  if (results.some((r) => !isPublicAddress(r.address))) throw new UrlRejectedError("private_address");
  return results;
}
