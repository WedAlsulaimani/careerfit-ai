import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import type { LookupFunction } from "node:net";
import { urlFetchConfig } from "@/lib/env";
import { UrlRejectedError, parseAndCheckUrl, resolvePublic } from "./url-guard";

const USER_AGENT = "CareerFitAI-JobReader/1.0 (+resume tailoring; fetches a single page on user request)";
const MAX_REDIRECTS = 5;

/** Connect-time DNS hook: re-validates addresses so DNS rebinding cannot reach private networks. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  resolvePublic(hostname)
    .then((addresses) => {
      if (typeof options === "object" && options && "all" in options && options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    })
    .catch((err: Error) => callback(Object.assign(err, { code: "ENOTFOUND" }) as NodeJS.ErrnoException, "", 4));
};

let agent: Agent | null = null;
function getAgent() {
  if (!agent) {
    const { timeoutMs } = urlFetchConfig();
    agent = new Agent({
      connect: { lookup: safeLookup, timeout: timeoutMs },
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  }
  return agent;
}

export type FetchOutcome =
  | { ok: true; finalUrl: string; status: number; contentType: string; body: string }
  | {
      ok: false;
      reason:
        | "rejected"
        | "robots_disallowed"
        | "blocked"
        | "http_error"
        | "not_html"
        | "too_large"
        | "network"
        | "timeout";
      detail: string;
      status?: number;
    };

async function rawGet(url: URL, accept: string, maxBytes: number, signal: AbortSignal) {
  const res = await undiciFetch(url, {
    method: "GET",
    redirect: "manual",
    dispatcher: getAgent(),
    signal,
    headers: { "user-agent": USER_AGENT, accept, "accept-language": "en,ar;q=0.8" },
  });
  return res;
}

async function readCapped(res: Awaited<ReturnType<typeof rawGet>>, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks);
  const charset = /charset=([^;]+)/i.exec(res.headers.get("content-type") ?? "")?.[1]?.trim().toLowerCase();
  try {
    return new TextDecoder(charset && charset !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

/** Minimal robots.txt check for our user agent and "*". */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && "careerfitai-jobreader".includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
      if (new RegExp(`^${pattern}`).test(path)) {
        if (!best || r.path.length > best.len || (r.path.length === best.len && r.allow)) {
          best = { allow: r.allow, len: r.path.length };
        }
      }
    }
  }
  return best ? best.allow : true;
}

const BLOCK_MARKERS = [
  /captcha/i,
  /cf-challenge|challenge-platform|just a moment\.\.\./i,
  /access denied/i,
  /are you a robot|verify you are human|unusual traffic/i,
];

/**
 * Fetches a public job page safely: SSRF checks on every hop, manual redirects,
 * robots.txt respect, timeouts, byte cap and HTML-only content. It never
 * attempts to bypass logins, paywalls, CAPTCHAs or bot protection.
 */
export async function fetchJobPage(rawUrl: string): Promise<FetchOutcome> {
  const { timeoutMs, maxBytes } = urlFetchConfig();
  let url: URL;
  try {
    url = parseAndCheckUrl(rawUrl);
    await resolvePublic(url.hostname);
  } catch (err) {
    return { ok: false, reason: "rejected", detail: err instanceof UrlRejectedError ? err.reason : "invalid" };
  }

  const signal = AbortSignal.timeout(timeoutMs * 2);
  try {
    // robots.txt (best effort: unreachable robots.txt means no restrictions).
    try {
      const robotsUrl = new URL("/robots.txt", url);
      const robotsRes = await rawGet(robotsUrl, "text/plain", 200_000, signal);
      if (robotsRes.status === 200) {
        const txt = await readCapped(robotsRes, 200_000);
        if (txt && !robotsAllows(txt, url.pathname + url.search)) {
          return { ok: false, reason: "robots_disallowed", detail: "robots.txt disallows automated access to this page" };
        }
      } else {
        await robotsRes.body?.cancel();
      }
    } catch {
      /* ignore robots errors */
    }

    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await rawGet(current, "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5", maxBytes, signal);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return { ok: false, reason: "http_error", detail: "redirect without location", status: res.status };
        try {
          current = parseAndCheckUrl(new URL(location, current).toString());
          await resolvePublic(current.hostname);
        } catch (err) {
          return { ok: false, reason: "rejected", detail: err instanceof UrlRejectedError ? err.reason : "invalid_redirect" };
        }
        continue;
      }
      if ([401, 402, 403, 407, 429, 451].includes(res.status)) {
        await res.body?.cancel();
        return { ok: false, reason: "blocked", detail: `The site refused access (HTTP ${res.status}).`, status: res.status };
      }
      if (res.status >= 400) {
        await res.body?.cancel();
        return { ok: false, reason: "http_error", detail: `HTTP ${res.status}`, status: res.status };
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) {
        await res.body?.cancel();
        return { ok: false, reason: "not_html", detail: contentType || "unknown content type" };
      }
      const body = await readCapped(res, maxBytes);
      if (body === null) return { ok: false, reason: "too_large", detail: `Page exceeds ${maxBytes} bytes.` };
      const head = body.slice(0, 20000);
      if (BLOCK_MARKERS.some((re) => re.test(head)) && body.length < 60000) {
        return { ok: false, reason: "blocked", detail: "The site presented a bot check or access wall." };
      }
      return { ok: true, finalUrl: current.toString(), status: res.status, contentType, body };
    }
    return { ok: false, reason: "http_error", detail: "Too many redirects." };
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return { ok: false, reason: "timeout", detail: "The site took too long to respond." };
    }
    if (err instanceof Error && /ENOTFOUND|private_address|dns_failure/.test(`${err.message} ${(err as NodeJS.ErrnoException).code ?? ""}`)) {
      return { ok: false, reason: "rejected", detail: "private_address_or_dns" };
    }
    return { ok: false, reason: "network", detail: "Could not reach the site." };
  }
}
