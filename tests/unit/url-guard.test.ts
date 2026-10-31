import { describe, expect, it } from "vitest";
import { isPublicAddress, parseAndCheckUrl, resolvePublic, UrlRejectedError } from "@/server/jobs/url-guard";
import { robotsAllows } from "@/server/jobs/fetch-url";

const rejects = (url: string) => {
  try {
    parseAndCheckUrl(url);
  } catch (e) {
    return e instanceof UrlRejectedError ? e.reason : "other";
  }
  return null;
};

describe("SSRF guard — malicious URLs are rejected (scenario 19)", () => {
  it.each([
    ["file:///etc/passwd", "unsupported_scheme"],
    ["ftp://example.com/job", "unsupported_scheme"],
    ["javascript:alert(1)", "unsupported_scheme"],
    ["http://localhost/admin", "internal_host"],
    ["http://intranet/", "internal_host"],
    ["http://printer.local/", "internal_host"],
    ["http://metadata.google.internal/computeMetadata/v1/", "internal_host"],
    ["http://127.0.0.1/", "private_address"],
    ["http://2130706433/", "private_address"], // decimal form of 127.0.0.1
    ["http://0x7f.0.0.1/", "private_address"],
    ["http://10.0.0.5/", "private_address"],
    ["http://172.16.3.4/", "private_address"],
    ["http://192.168.1.1/", "private_address"],
    ["http://169.254.169.254/latest/meta-data/", "private_address"],
    ["http://100.64.0.1/", "private_address"],
    ["http://0.0.0.0/", "private_address"],
    ["http://[::1]/", "private_address"],
    ["http://[::ffff:127.0.0.1]/", "private_address"],
    ["http://[fd00::1]/", "private_address"],
    ["http://[fe80::1]/", "private_address"],
    ["https://user:pass@example.com/", "credentials_in_url"],
    ["https://example.com:8443/", "non_standard_port"],
    ["http://example.com:22/", "non_standard_port"],
    ["not a url", "malformed_url"],
  ])("rejects %s", (url, reason) => {
    expect(rejects(url)).toBe(reason);
  });

  it("accepts ordinary public https URLs", () => {
    expect(rejects("https://careers.example.com/jobs/123?ref=abc")).toBeNull();
    expect(rejects("http://example.org/job")).toBeNull();
    expect(rejects("https://example.com:443/job")).toBeNull();
  });

  it("classifies addresses", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
    expect(isPublicAddress("198.18.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isPublicAddress("garbage")).toBe(false);
  });

  it("rejects literal private addresses at resolution time", async () => {
    await expect(resolvePublic("127.0.0.1")).rejects.toBeInstanceOf(UrlRejectedError);
    await expect(resolvePublic("[::1]")).rejects.toBeInstanceOf(UrlRejectedError);
  });
});

describe("robots.txt handling", () => {
  const robots = `
User-agent: *
Disallow: /private
Allow: /private/jobs

User-agent: BadBot
Disallow: /
`;
  it("respects disallow rules with longest-match precedence", () => {
    expect(robotsAllows(robots, "/jobs/1")).toBe(true);
    expect(robotsAllows(robots, "/private/area")).toBe(false);
    expect(robotsAllows(robots, "/private/jobs/42")).toBe(true);
  });
  it("blocks everything when disallowed for all agents", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/careers")).toBe(false);
  });
  it("allows when no rules apply", () => {
    expect(robotsAllows("", "/x")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow:", "/x")).toBe(true);
  });
});
