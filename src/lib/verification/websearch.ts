// Step 3: Tavily web search. Returns [] when TAVILY_API_KEY is missing or the
// API errors out — never throws.

import { tavilyApiKey } from "@/lib/clients";

export type WebSearchResult = {
  url: string;
  title?: string;
  snippet?: string;
};

const TIMEOUT_MS = 8_000;

type TavilyApiResult = {
  url?: unknown;
  title?: unknown;
  content?: unknown;
};

type TavilyResponse = {
  results?: TavilyApiResult[];
};

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.length > 0 ? x : undefined;
}

export async function searchWeb(
  handle: string,
  name: string | undefined,
  topic: string,
): Promise<WebSearchResult[]> {
  const key = tavilyApiKey();
  if (!key) return [];

  const queryParts: string[] = [];
  queryParts.push(`@${handle}`);
  if (name && name.trim()) queryParts.push(name.trim());
  if (topic.trim()) queryParts.push(topic.trim());
  const query = queryParts.join(" ").slice(0, 300);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: 5,
        include_answer: false,
      }),
      signal: ac.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as TavilyResponse;
    const out: WebSearchResult[] = [];
    for (const r of data.results ?? []) {
      const url = asString(r.url);
      if (!url) continue;
      out.push({
        url,
        title: asString(r.title),
        snippet: asString(r.content)?.slice(0, 500),
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
