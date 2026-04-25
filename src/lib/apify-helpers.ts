// Thin REST wrapper around the apidojo~tweet-scraper Apify actor. The official
// `apify-client` SDK is fine for orchestration, but this REST path is what the
// proven atrium scripts use, and it cuts an extra dependency layer for the hot
// path (run-sync-get-dataset-items).

import { APIFY_TWEET_SCRAPER } from "@/lib/clients";
import type { CandidateProfile, TweetSnippet } from "@/lib/types";

// ---------------------------------------------------------------------------
// Low-level fetch + actor calls
// ---------------------------------------------------------------------------

export type ApifyTweet = Record<string, unknown>;

const RUN_SYNC_BASE = "https://api.apify.com/v2/acts";

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is required");
  return t;
}

/**
 * POST to run-sync-get-dataset-items for an Apify actor. Throws with a
 * truncated body string on non-2xx so the caller can surface a useful error
 * to the SSE stream.
 */
export async function apifyRun<T = ApifyTweet>(
  actor: string,
  input: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<T[]> {
  const url = `${RUN_SYNC_BASE}/${actor}/run-sync-get-dataset-items?token=${token()}&clean=true`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(
        `apify ${actor} ${res.status}: ${body.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as T[];
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Handle / string utilities
// ---------------------------------------------------------------------------

export function normalizeHandle(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).trim().replace(/^@+/, "").toLowerCase();
}

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.length > 0 ? x : undefined;
}

function asNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function getProp(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object") {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tweet shape probing — Apify actors return fat objects, so be defensive.
// ---------------------------------------------------------------------------

export type TweetExtract = {
  id?: string;
  text: string;
  url?: string;
  createdAt?: string;
  likes?: number;
  retweets?: number;
  authorHandle?: string;
  authorName?: string;
  authorBio?: string;
  authorFollowers?: number;
  authorFollowing?: number;
};

export function extractAuthorHandle(tweet: ApifyTweet): string | undefined {
  const author = getProp(tweet, "author");
  const user = getProp(tweet, "user");
  return (
    asString(getProp(author, "userName")) ??
    asString(getProp(user, "userName")) ??
    asString(getProp(user, "screen_name")) ??
    asString(getProp(tweet, "userName"))
  );
}

export function extractAuthorName(tweet: ApifyTweet): string | undefined {
  const author = getProp(tweet, "author");
  const user = getProp(tweet, "user");
  return (
    asString(getProp(author, "name")) ??
    asString(getProp(user, "name"))
  );
}

export function extractAuthorBio(tweet: ApifyTweet): string | undefined {
  const author = getProp(tweet, "author");
  const user = getProp(tweet, "user");
  return (
    asString(getProp(author, "description")) ??
    asString(getProp(user, "description")) ??
    asString(getProp(author, "bio")) ??
    asString(getProp(user, "bio"))
  );
}

export function extractAuthorLinks(tweet: ApifyTweet): string[] {
  const out = new Set<string>();
  const author = getProp(tweet, "author");
  const user = getProp(tweet, "user");
  const url =
    asString(getProp(author, "url")) ??
    asString(getProp(user, "url")) ??
    asString(getProp(author, "expandedUrl"));
  if (url) out.add(url);

  const entities = getProp(author, "entities") ?? getProp(user, "entities");
  const urlEntities = getProp(entities, "url");
  const urls = getProp(urlEntities, "urls");
  if (Array.isArray(urls)) {
    for (const u of urls) {
      const eu = asString(getProp(u, "expanded_url")) ?? asString(getProp(u, "expandedUrl"));
      if (eu) out.add(eu);
    }
  }
  const descEntities = getProp(entities, "description");
  const descUrls = getProp(descEntities, "urls");
  if (Array.isArray(descUrls)) {
    for (const u of descUrls) {
      const eu = asString(getProp(u, "expanded_url")) ?? asString(getProp(u, "expandedUrl"));
      if (eu) out.add(eu);
    }
  }
  return Array.from(out);
}

export function extractTweet(tweet: ApifyTweet): TweetExtract {
  const text =
    asString(getProp(tweet, "fullText")) ??
    asString(getProp(tweet, "full_text")) ??
    asString(getProp(tweet, "text")) ??
    "";
  const id =
    asString(getProp(tweet, "id")) ??
    asString(getProp(tweet, "id_str")) ??
    asString(getProp(tweet, "tweetId"));
  const url = asString(getProp(tweet, "url")) ?? asString(getProp(tweet, "twitterUrl"));
  const createdAt =
    asString(getProp(tweet, "createdAt")) ??
    asString(getProp(tweet, "created_at")) ??
    asString(getProp(tweet, "date"));
  const likes =
    asNumber(getProp(tweet, "likeCount")) ??
    asNumber(getProp(tweet, "favoriteCount")) ??
    asNumber(getProp(tweet, "favorite_count"));
  const retweets =
    asNumber(getProp(tweet, "retweetCount")) ??
    asNumber(getProp(tweet, "retweet_count"));
  const authorHandle = extractAuthorHandle(tweet);
  const authorName = extractAuthorName(tweet);
  const authorBio = extractAuthorBio(tweet);
  const author = getProp(tweet, "author");
  const user = getProp(tweet, "user");
  const authorFollowers =
    asNumber(getProp(author, "followers")) ??
    asNumber(getProp(user, "followers")) ??
    asNumber(getProp(author, "followersCount")) ??
    asNumber(getProp(user, "followers_count"));
  const authorFollowing =
    asNumber(getProp(author, "following")) ??
    asNumber(getProp(user, "following")) ??
    asNumber(getProp(author, "followingCount")) ??
    asNumber(getProp(user, "friends_count"));
  return {
    id,
    text,
    url,
    createdAt,
    likes,
    retweets,
    authorHandle,
    authorName,
    authorBio,
    authorFollowers,
    authorFollowing,
  };
}

/**
 * Pull retweet/quote/reply/mention authors from a tweet object. Used in the
 * 1-hop expansion pass. Does NOT include the tweet's own author.
 */
export function extractRelatedHandles(tweet: ApifyTweet): string[] {
  const out = new Set<string>();

  const text =
    asString(getProp(tweet, "fullText")) ??
    asString(getProp(tweet, "full_text")) ??
    asString(getProp(tweet, "text")) ??
    "";
  const rt = text.match(/^RT @([A-Za-z0-9_]{1,15}):/);
  if (rt) out.add(normalizeHandle(rt[1]));

  const entities = getProp(tweet, "entities");
  const mentions = getProp(entities, "user_mentions");
  if (Array.isArray(mentions)) {
    for (const m of mentions) {
      const sn = asString(getProp(m, "screen_name")) ?? asString(getProp(m, "userName"));
      if (sn) out.add(normalizeHandle(sn));
    }
  }

  for (const key of [
    "retweet",
    "retweetedStatus",
    "retweeted_status",
    "quote",
    "quoted_status",
    "quotedStatus",
    "inReplyTo",
    "replyTo",
  ]) {
    const nested = getProp(tweet, key);
    if (nested) {
      const h = extractAuthorHandle(nested as ApifyTweet);
      if (h) out.add(normalizeHandle(h));
    }
  }

  const replyToHandle =
    asString(getProp(tweet, "inReplyToUsername")) ??
    asString(getProp(tweet, "in_reply_to_screen_name"));
  if (replyToHandle) out.add(normalizeHandle(replyToHandle));

  const quotedHandle =
    asString(getProp(tweet, "quotedUsername")) ??
    asString(getProp(tweet, "quoted_username"));
  if (quotedHandle) out.add(normalizeHandle(quotedHandle));

  const self = extractAuthorHandle(tweet);
  if (self) out.delete(normalizeHandle(self));
  out.delete("");
  return Array.from(out);
}

// ---------------------------------------------------------------------------
// Higher-level callers
// ---------------------------------------------------------------------------

export async function tweetsForHandle(
  handle: string,
  maxItems = 30,
  timeoutMs = 60_000,
): Promise<ApifyTweet[]> {
  const h = normalizeHandle(handle);
  if (!h) return [];
  return apifyRun<ApifyTweet>(
    APIFY_TWEET_SCRAPER,
    {
      twitterHandles: [h],
      maxItems,
      sort: "Latest",
    },
    timeoutMs,
  );
}

export async function tweetsForSearch(
  query: string,
  maxItems = 25,
  timeoutMs = 60_000,
): Promise<ApifyTweet[]> {
  if (!query.trim()) return [];
  return apifyRun<ApifyTweet>(
    APIFY_TWEET_SCRAPER,
    {
      searchTerms: [query],
      maxItems,
      sort: "Latest",
    },
    timeoutMs,
  );
}

/**
 * Fetch a handle's recent tweets and synthesize a CandidateProfile from
 * the most recent self-authored tweet. Returns null if the actor returns
 * no usable data.
 */
export async function profileForHandle(
  handle: string,
  maxItems = 30,
): Promise<CandidateProfile | null> {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const items = await tweetsForHandle(h, maxItems);
  if (items.length === 0) return null;

  let name: string | undefined;
  let bio: string | undefined;
  let followers: number | undefined;
  let following: number | undefined;
  const links = new Set<string>();
  const tweets: TweetSnippet[] = [];
  let pinned: TweetSnippet | undefined;

  for (const raw of items) {
    const t = extractTweet(raw);
    if (!name && t.authorName && normalizeHandle(t.authorHandle) === h) name = t.authorName;
    if (!bio && t.authorBio && normalizeHandle(t.authorHandle) === h) bio = t.authorBio;
    if (followers === undefined && t.authorFollowers !== undefined && normalizeHandle(t.authorHandle) === h) {
      followers = t.authorFollowers;
    }
    if (following === undefined && t.authorFollowing !== undefined && normalizeHandle(t.authorHandle) === h) {
      following = t.authorFollowing;
    }
    for (const u of extractAuthorLinks(raw)) links.add(u);

    if (t.id && normalizeHandle(t.authorHandle) === h) {
      tweets.push({
        id: t.id,
        text: t.text,
        url: t.url,
        createdAt: t.createdAt,
        likes: t.likes,
        retweets: t.retweets,
      });
    }
    const isPinned = getProp(raw, "isPinned") === true || getProp(raw, "pinned") === true;
    if (isPinned && t.id && !pinned) {
      pinned = {
        id: t.id,
        text: t.text,
        url: t.url,
        createdAt: t.createdAt,
        likes: t.likes,
        retweets: t.retweets,
      };
    }
  }

  return {
    handle: h,
    name,
    bio,
    bioLinks: Array.from(links),
    followers,
    following,
    pinnedTweet: pinned,
    recentTweets: tweets.slice(0, 50),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Mini bio summary for the LLM filter pass. Pulls handle/name/bio out of a
 * batch of tweets — much cheaper than a full profile fetch per candidate.
 */
export type MiniBio = {
  handle: string;
  name?: string;
  bio?: string;
};

export function miniBiosFromTweets(items: ApifyTweet[]): MiniBio[] {
  const map = new Map<string, MiniBio>();
  for (const raw of items) {
    const t = extractTweet(raw);
    const h = normalizeHandle(t.authorHandle);
    if (!h) continue;
    const existing = map.get(h);
    if (existing) {
      if (!existing.name && t.authorName) existing.name = t.authorName;
      if (!existing.bio && t.authorBio) existing.bio = t.authorBio;
    } else {
      map.set(h, { handle: h, name: t.authorName, bio: t.authorBio });
    }
  }
  return Array.from(map.values());
}
