// Phase 2B + 2C: keyword search and bio search. Both backed by the same
// apidojo~tweet-scraper actor in `searchTerms` mode. The actor doesn't expose
// a true "search bios only" mode, so for bio search we synthesize bio-flavored
// queries from the rubric (e.g. archetype labels + criterion labels) and rely
// on the LLM filter pass to drop noise.

import {
  miniBiosFromTweets,
  normalizeHandle,
  tweetsForSearch,
  type ApifyTweet,
  type MiniBio,
  extractAuthorHandle,
} from "@/lib/apify-helpers";
import type { Rubric } from "@/lib/types";

const QUERY_CONCURRENCY = 3;
const PER_QUERY_TIMEOUT_MS = 60_000;
const MAX_KEYWORD_QUERIES = 6;
const MAX_BIO_QUERIES = 3;
const PER_QUERY_MAX_ITEMS = 25;

async function inBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const out = await Promise.all(slice.map(fn));
    results.push(...out);
  }
  return results;
}

async function safeSearch(query: string): Promise<ApifyTweet[]> {
  try {
    return await tweetsForSearch(query, PER_QUERY_MAX_ITEMS, PER_QUERY_TIMEOUT_MS);
  } catch {
    return [];
  }
}

function uniqueAuthors(items: ApifyTweet[]): string[] {
  const set = new Set<string>();
  for (const t of items) {
    const h = normalizeHandle(extractAuthorHandle(t));
    if (h) set.add(h);
  }
  return Array.from(set);
}

export type SearchResult = {
  keywordHandles: string[];
  bioHandles: string[];
  bios: MiniBio[];
};

/**
 * Build a list of bio-flavored queries derived from the rubric. The actor
 * doesn't filter by bio specifically; these queries just bias the search
 * toward people who self-describe in topic-relevant ways.
 */
function bioQueriesForRubric(rubric: Rubric): string[] {
  const labels = rubric.criteria.map((c) => c.label).filter(Boolean);
  const baseTopic = rubric.topic.trim();
  const out = new Set<string>();
  // Topic-as-bio search.
  if (baseTopic) out.add(`"${baseTopic}"`);
  // Labels merged with topic — biases toward bio-style claims.
  for (const l of labels.slice(0, 3)) {
    const trimmed = l.trim();
    if (trimmed) out.add(`${trimmed} ${baseTopic}`.slice(0, 200));
  }
  // Archetype hints.
  if (rubric.archetype === "academic-research") {
    out.add(`${baseTopic} researcher`);
    out.add(`${baseTopic} PhD`);
  } else if (rubric.archetype === "industry-professional") {
    out.add(`${baseTopic} engineer`);
    out.add(`${baseTopic} staff`);
  } else if (rubric.archetype === "craft-artistic") {
    out.add(`${baseTopic} artist`);
  } else if (rubric.archetype === "community-fandom") {
    out.add(`${baseTopic} fan`);
  }
  return Array.from(out).slice(0, MAX_BIO_QUERIES);
}

export async function searchCandidates(rubric: Rubric): Promise<SearchResult> {
  const keywordQueries = (rubric.searchQueries ?? []).slice(0, MAX_KEYWORD_QUERIES);
  const bioQueries = bioQueriesForRubric(rubric);

  const [keywordBatches, bioBatches] = await Promise.all([
    inBatches(keywordQueries, QUERY_CONCURRENCY, safeSearch),
    inBatches(bioQueries, QUERY_CONCURRENCY, safeSearch),
  ]);

  const keywordTweets = keywordBatches.flat();
  const bioTweets = bioBatches.flat();

  const keywordHandles = uniqueAuthors(keywordTweets);
  const bioHandles = uniqueAuthors(bioTweets);

  const allBios = miniBiosFromTweets([...keywordTweets, ...bioTweets]);

  return { keywordHandles, bioHandles, bios: allBios };
}
