// Optional follows-list fetch. The apidojo~tweet-scraper actor accepts a
// "user-mode" input shape that returns a user's recent timeline; some variants
// also surface follows. We try a best-effort call and gracefully report
// `{ ok: false }` so the orchestrator can fall back to a user-supplied
// handle list.

import { apifyRun, normalizeHandle } from "@/lib/apify-helpers";
import { APIFY_TWEET_SCRAPER } from "@/lib/clients";

export type FollowingResult =
  | { ok: true; handles: string[] }
  | { ok: false; reason: string };

type RawItem = Record<string, unknown>;

function pickHandles(items: RawItem[]): string[] {
  const out = new Set<string>();
  for (const item of items) {
    const candidates: unknown[] = [
      (item as { userName?: unknown }).userName,
      (item as { screen_name?: unknown }).screen_name,
      (item as { handle?: unknown }).handle,
      (item as { username?: unknown }).username,
      ((item as { user?: { userName?: unknown } }).user ?? {}).userName,
      ((item as { user?: { screen_name?: unknown } }).user ?? {}).screen_name,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.length > 0) {
        const h = normalizeHandle(c);
        if (h) out.add(h);
      }
    }
  }
  return Array.from(out);
}

/**
 * Try to fetch the follow-list for a handle. Best-effort: if the actor doesn't
 * support this mode (or the dataset is empty), return `{ ok: false }`.
 */
export async function fetchFollowing(
  userHandle: string,
  maxItems = 300,
  timeoutMs = 90_000,
): Promise<FollowingResult> {
  const h = normalizeHandle(userHandle);
  if (!h) return { ok: false, reason: "empty handle" };

  try {
    const items = await apifyRun<RawItem>(
      APIFY_TWEET_SCRAPER,
      {
        twitterHandles: [h],
        getFollowing: true,
        maxItems,
      },
      timeoutMs,
    );
    const handles = pickHandles(items);
    if (handles.length === 0) {
      return { ok: false, reason: "actor returned no follow rows" };
    }
    return { ok: true, handles: handles.slice(0, maxItems) };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
