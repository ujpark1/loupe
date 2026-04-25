// Step 2: fetch up to 3 of the candidate's bio links and extract a short
// snippet via cheerio. All errors are swallowed.

import * as cheerio from "cheerio";

export type BioLinkResult = {
  url: string;
  title?: string;
  snippet?: string;
  status: number | "error";
  description?: string;
};

const TIMEOUT_MS = 5_000;
const MAX_LINKS = 3;
const SNIPPET_CHARS = 500;
const USER_AGENT =
  "Mozilla/5.0 (compatible; LoupeBot/0.1; +https://github.com/loupe)";

async function fetchOne(url: string): Promise<BioLinkResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { url, status: res.status };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("xml")) {
      return { url, status: res.status };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = ($("title").first().text() || "").trim().slice(0, 200) || undefined;
    const description =
      $("meta[name='description']").attr("content")?.trim().slice(0, 300) ??
      $("meta[property='og:description']").attr("content")?.trim().slice(0, 300);
    // Grab first chunk of body text (sans script/style).
    $("script, style, noscript").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const snippet = bodyText.slice(0, SNIPPET_CHARS) || undefined;
    return { url, status: res.status, title, description, snippet };
  } catch {
    return { url, status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBioLinks(links: string[]): Promise<BioLinkResult[]> {
  if (!links || links.length === 0) return [];
  const filtered = links
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, MAX_LINKS);
  if (filtered.length === 0) return [];
  return Promise.all(filtered.map(fetchOne));
}
