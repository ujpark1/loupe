// Phase 2A: 1-hop network expansion. For each seed, fetch ~30 recent tweets
// and collect retweet/quote/reply/mention authors. We dedupe both the tweets
// and the resulting handle list.

import {
  extractRelatedHandles,
  miniBiosFromTweets,
  normalizeHandle,
  tweetsForHandle,
  type ApifyTweet,
  type MiniBio,
} from "@/lib/apify-helpers";

export type ExpandResult = {
  handles: string[];          // related handles (excluding seeds)
  bios: MiniBio[];            // mini bios harvested while we had the tweets in hand
  rawTweetsCount: number;     // for debugging / phase events
};

const PER_SEED_TWEETS = 30;
const SEED_CONCURRENCY = 4;
const PER_SEED_TIMEOUT_MS = 45_000;

async function safeTweetsForHandle(handle: string): Promise<ApifyTweet[]> {
  try {
    return await tweetsForHandle(handle, PER_SEED_TWEETS, PER_SEED_TIMEOUT_MS);
  } catch {
    return [];
  }
}

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

export async function expandFromSeeds(seeds: string[]): Promise<ExpandResult> {
  if (seeds.length === 0) {
    return { handles: [], bios: [], rawTweetsCount: 0 };
  }
  const seedSet = new Set(seeds.map(normalizeHandle));

  const tweetBatches = await inBatches(seeds, SEED_CONCURRENCY, safeTweetsForHandle);
  const allTweets = tweetBatches.flat();

  const handleSet = new Set<string>();
  for (const t of allTweets) {
    for (const h of extractRelatedHandles(t)) {
      if (!h || seedSet.has(h)) continue;
      handleSet.add(h);
    }
  }

  return {
    handles: Array.from(handleSet),
    bios: miniBiosFromTweets(allTweets),
    rawTweetsCount: allTweets.length,
  };
}
