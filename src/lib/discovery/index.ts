// Discovery entry point: chains seed -> (expand + search in parallel) ->
// dedupe -> LLM filter -> capped handle list with source-tagged provenance.

import { filterCandidates } from "@/lib/discovery/filter";
import { expandFromSeeds } from "@/lib/discovery/expand";
import { searchCandidates } from "@/lib/discovery/search";
import { seedHandlesFromRubric } from "@/lib/discovery/seed";
import type { CandidateSource, Rubric } from "@/lib/types";
import type { MiniBio } from "@/lib/apify-helpers";

export type DiscoveredCandidate = {
  handle: string;
  source: CandidateSource;
  bio?: MiniBio;
};

export type DiscoveryDebug = {
  seeds: number;
  expanded: number;
  keywordHits: number;
  bioHits: number;
  unionBeforeFilter: number;
  afterFilter: number;
};

export type DiscoveryProgress = {
  onPhase?: (phase: string, detail?: string, counts?: Record<string, number>) => void;
};

const MAX_AFTER_FILTER = 80;

export async function discoverCandidates(
  rubric: Rubric,
  opts: DiscoveryProgress = {},
): Promise<{ candidates: DiscoveredCandidate[]; debug: DiscoveryDebug }> {
  const { onPhase } = opts;

  // 1) seeds (rubric-example)
  const seeds = seedHandlesFromRubric(rubric, 30);
  onPhase?.("seed", `gathered ${seeds.length} seed handles`, { seeds: seeds.length });

  // 2) expand + search in parallel
  onPhase?.("expand+search", `running 1-hop expansion + keyword/bio search`);
  const [expandRes, searchRes] = await Promise.all([
    expandFromSeeds(seeds).catch(() => ({ handles: [], bios: [], rawTweetsCount: 0 })),
    searchCandidates(rubric).catch(() => ({ keywordHandles: [], bioHandles: [], bios: [] })),
  ]);

  onPhase?.("expand", `expansion produced ${expandRes.handles.length} handles`, {
    expanded: expandRes.handles.length,
    rawTweets: expandRes.rawTweetsCount,
  });
  onPhase?.("search", `keyword=${searchRes.keywordHandles.length}, bio=${searchRes.bioHandles.length}`, {
    keyword: searchRes.keywordHandles.length,
    bio: searchRes.bioHandles.length,
  });

  // 3) merge with provenance
  const seedSet = new Set(seeds);
  const sourceFor = (h: string, fallback: CandidateSource): CandidateSource => {
    if (seedSet.has(h)) return "rubric-example";
    return fallback;
  };

  const merged = new Map<string, DiscoveredCandidate>();
  const addCandidate = (h: string, src: CandidateSource) => {
    if (!h || merged.has(h)) return;
    merged.set(h, { handle: h, source: sourceFor(h, src) });
  };
  for (const h of seeds) addCandidate(h, "rubric-example");
  for (const h of expandRes.handles) addCandidate(h, "seed-network");
  for (const h of searchRes.keywordHandles) addCandidate(h, "keyword-search");
  for (const h of searchRes.bioHandles) addCandidate(h, "bio-search");

  // attach mini bios where we have them
  const bioMap = new Map<string, MiniBio>();
  for (const b of [...expandRes.bios, ...searchRes.bios]) {
    if (!bioMap.has(b.handle)) bioMap.set(b.handle, b);
  }
  for (const c of merged.values()) {
    const b = bioMap.get(c.handle);
    if (b) c.bio = b;
  }

  const unionBeforeFilter = merged.size;

  // 4) LLM filter — keep up to MAX_AFTER_FILTER. We only filter the *non-seed*
  // population. Seeds always pass through (they came from the user's rubric).
  const filterInput: MiniBio[] = [];
  for (const c of merged.values()) {
    if (c.source === "rubric-example") continue;
    filterInput.push({
      handle: c.handle,
      name: c.bio?.name,
      bio: c.bio?.bio,
    });
  }

  let kept: Set<string>;
  if (filterInput.length === 0) {
    kept = new Set();
  } else {
    onPhase?.("filter", `LLM-filtering ${filterInput.length} non-seed candidates`);
    const keptArr = await filterCandidates(rubric, filterInput, Math.max(MAX_AFTER_FILTER - seeds.length, 0));
    kept = new Set(keptArr);
  }

  const finalList: DiscoveredCandidate[] = [];
  for (const c of merged.values()) {
    if (c.source === "rubric-example" || kept.has(c.handle)) {
      finalList.push(c);
    }
    if (finalList.length >= MAX_AFTER_FILTER) break;
  }

  onPhase?.("filter", `kept ${finalList.length} after filter`, { kept: finalList.length });

  return {
    candidates: finalList,
    debug: {
      seeds: seeds.length,
      expanded: expandRes.handles.length,
      keywordHits: searchRes.keywordHandles.length,
      bioHits: searchRes.bioHandles.length,
      unionBeforeFilter,
      afterFilter: finalList.length,
    },
  };
}
