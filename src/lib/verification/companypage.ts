// Step 6: scan obvious company "about" / "team" pages for a candidate's name
// or handle. We only consider links that look like a company root (no path
// segments, no obvious blogging platforms). Returns only matches that
// actually mention the candidate.

import * as cheerio from "cheerio";

export type CompanyHit = {
  url: string;
  snippet: string;
};

const TIMEOUT_MS = 5_000;
const SNIPPET_CHARS = 400;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LoupeBot/0.1; +https://github.com/loupe)";

const SKIP_HOST_PATTERNS = [
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)github\.com$/i,
  /(^|\.)substack\.com$/i,
  /(^|\.)medium\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)patreon\.com$/i,
  /(^|\.)tumblr\.com$/i,
  /(^|\.)bsky\.app$/i,
  /(^|\.)threads\.net$/i,
  /(^|\.)mastodon\.social$/i,
  /(^|\.)wikipedia\.org$/i,
];

function isCompanyRoot(u: URL): boolean {
  if (SKIP_HOST_PATTERNS.some((re) => re.test(u.hostname))) return false;
  // Path empty or "/" considered root. Also allow short single-segment paths.
  const segments = u.pathname.split("/").filter(Boolean);
  return segments.length <= 1;
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("xml")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function findMentionSnippet(
  html: string,
  needles: string[],
): string | null {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  for (const n of needles) {
    if (!n) continue;
    const i = lowered.indexOf(n.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - 80);
      return text.slice(start, start + SNIPPET_CHARS);
    }
  }
  return null;
}

export async function scanCompanyPages(
  bioLinks: string[],
  handle: string,
  name?: string,
): Promise<CompanyHit[]> {
  if (!bioLinks || bioLinks.length === 0) return [];

  // Build the set of URLs to probe: company-root + /about + /team for each
  // qualifying link. De-dupe.
  const urls = new Set<string>();
  for (const raw of bioLinks) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (!isCompanyRoot(u)) continue;
    const root = `${u.protocol}//${u.host}`;
    urls.add(root);
    urls.add(`${root}/about`);
    urls.add(`${root}/team`);
  }

  const list = Array.from(urls).slice(0, 9);
  if (list.length === 0) return [];

  const needles = [name?.trim(), `@${handle}`, handle].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );

  const results = await Promise.all(
    list.map(async (url) => {
      const html = await fetchHtml(url);
      if (!html) return null;
      const snippet = findMentionSnippet(html, needles);
      if (!snippet) return null;
      return { url, snippet } satisfies CompanyHit;
    }),
  );
  return results.filter((r): r is CompanyHit => r !== null);
}
