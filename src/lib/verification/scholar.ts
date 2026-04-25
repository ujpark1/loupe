// Step 5: Semantic Scholar author search. Best-effort — null on any error.

export type ScholarAuthor = {
  authorId: string;
  name: string;
  paperCount: number;
  citationCount: number;
  hIndex: number;
  url: string;
};

const TIMEOUT_MS = 5_000;
const ENDPOINT = "https://api.semanticscholar.org/graph/v1/author/search";

type RawAuthor = {
  authorId?: string;
  name?: string;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
};

type RawResp = {
  data?: RawAuthor[];
};

export async function findScholarAuthor(
  name: string | undefined,
): Promise<ScholarAuthor | null> {
  if (!name || name.trim().length < 3) return null;
  const url = `${ENDPOINT}?query=${encodeURIComponent(name.trim())}&fields=name,paperCount,citationCount,hIndex&limit=3`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loupe-research-tool" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RawResp;
    const top = json.data?.[0];
    if (!top || !top.authorId || !top.name) return null;
    return {
      authorId: top.authorId,
      name: top.name,
      paperCount: top.paperCount ?? 0,
      citationCount: top.citationCount ?? 0,
      hIndex: top.hIndex ?? 0,
      url: `https://www.semanticscholar.org/author/${top.authorId}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
