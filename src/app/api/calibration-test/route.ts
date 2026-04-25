import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { apify } from "@/lib/clients";
import { claudeJson } from "@/lib/anthropic-helpers";
import {
  CALIBRATION_SYSTEM_PROMPT,
  buildCalibrationUserPrompt,
} from "@/lib/prompts/calibration";
import type {
  CalibrationTestRequest,
  CalibrationTestResponse,
  CandidateProfile,
  CriterionResult,
  ExternalEvidence,
  Rubric,
  TweetSnippet,
  VerificationSource,
  VerificationStrength,
} from "@/lib/types";
import { avgStrength, fitScoreFromResults } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APIFY_ACTOR = "apidojo/tweet-scraper";
const MAX_TWEETS = 30;
const BIO_LINK_FETCH_TIMEOUT_MS = 6_000;
const VALID_STRENGTHS: VerificationStrength[] = ["verified", "indirect", "claimed"];
const VALID_VERIFICATION_SOURCES = new Set<VerificationSource>([
  "twitter",
  "personal-site",
  "github",
  "semantic-scholar",
  "web-search",
  "company-page",
  "wikipedia",
]);

type ApifyTweetItem = {
  id?: string;
  id_str?: string;
  conversationId?: string;
  text?: string;
  fullText?: string;
  full_text?: string;
  url?: string;
  twitterUrl?: string;
  createdAt?: string;
  created_at?: string;
  isPinned?: boolean;
  pinned?: boolean;
  likeCount?: number;
  favorite_count?: number;
  retweetCount?: number;
  retweet_count?: number;
  author?: {
    userName?: string;
    name?: string;
    description?: string;
    followers?: number;
    followersCount?: number;
    following?: number;
    friendsCount?: number;
    profileBio?: { description?: string; entities?: { url?: { urls?: Array<{ expandedUrl?: string }> } } };
    entities?: { url?: { urls?: Array<{ expandedUrl?: string }> } };
    url?: string;
    profile_image_url_https?: string;
  };
};

type RawCalibrationOutput = {
  criteriaResults?: unknown;
};

type RawCriterionResult = {
  criterionId?: unknown;
  passes?: unknown;
  confidence?: unknown;
  verificationStrength?: unknown;
  evidenceTweetIds?: unknown;
  externalEvidence?: unknown;
  rationale?: unknown;
};

export async function POST(req: Request): Promise<NextResponse<CalibrationTestResponse>> {
  let body: CalibrationTestRequest;
  try {
    body = (await req.json()) as CalibrationTestRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const handleRaw = typeof body?.handle === "string" ? body.handle : "";
  const handle = normalizeHandle(handleRaw);
  if (!handle) {
    return NextResponse.json(
      { ok: false, error: "handle is required" },
      { status: 400 },
    );
  }

  const rubric = body?.rubric;
  const rubricError = validateRubric(rubric);
  if (rubricError) {
    return NextResponse.json(
      { ok: false, error: rubricError },
      { status: 400 },
    );
  }
  const validRubric = rubric as Rubric;

  // 1. Fetch tweets via Apify.
  let profile: CandidateProfile;
  try {
    profile = await fetchProfile(handle);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[calibration-test] apify fetch failed:", err);
    return NextResponse.json(
      { ok: false, error: `Failed to fetch X data for @${handle}: ${msg}` },
      { status: 502 },
    );
  }

  if (profile.recentTweets.length === 0 && !profile.bio) {
    return NextResponse.json(
      {
        ok: false,
        error: `No public tweets or bio found for @${handle}. Account may be private, suspended, or inactive.`,
      },
      { status: 404 },
    );
  }

  // 2. Optionally fetch one bio-link page (best-effort).
  let bioLinkExcerpt: string | undefined = undefined;
  if (profile.bioLinks.length > 0) {
    try {
      bioLinkExcerpt = await fetchBioLinkExcerpt(profile.bioLinks[0]);
    } catch (err) {
      console.warn("[calibration-test] bio link fetch failed:", (err as Error).message);
    }
  }

  // 3. Score with Claude.
  let criteriaResults: CriterionResult[];
  try {
    const res = await claudeJson<RawCalibrationOutput>({
      system: CALIBRATION_SYSTEM_PROMPT,
      user: buildCalibrationUserPrompt(validRubric, profile, bioLinkExcerpt),
      maxTokens: 4_000,
      thinking: { enabled: false },
    });
    criteriaResults = normalizeResults(res.parsed, validRubric);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[calibration-test] scoring failed:", err);
    return NextResponse.json(
      { ok: false, error: `Scoring failed: ${msg}` },
      { status: 500 },
    );
  }

  const fitScore = fitScoreFromResults(validRubric.criteria, criteriaResults);
  const passCount = criteriaResults.filter((r) => r.passes).length;
  // averageStrength is informational; compute it but it's not in the response shape.
  // (CalibrationTestResponse doesn't include averageStrength per types.ts.)
  void avgStrength(criteriaResults);

  return NextResponse.json({
    ok: true,
    handle: profile.handle,
    criteriaResults,
    fitScore,
    passCount,
    profile: {
      name: profile.name,
      bio: profile.bio,
    },
  });
}

// ============================================================================
// Apify fetch
// ============================================================================

async function fetchProfile(handle: string): Promise<CandidateProfile> {
  const client = apify();
  const run = await client.actor(APIFY_ACTOR).call({
    twitterHandles: [handle],
    maxItems: MAX_TWEETS,
    sort: "Latest",
  });

  if (!run?.defaultDatasetId) {
    throw new Error("Apify run produced no dataset id");
  }

  const ds = await client.dataset(run.defaultDatasetId).listItems();
  const items = ds.items as unknown as ApifyTweetItem[];

  // The actor returns tweets; the author block on each tweet has the bio info.
  // Pick the first item with a populated author block to derive profile metadata.
  const authorItem = items.find((t) => t?.author?.userName);

  const tweets: TweetSnippet[] = [];
  let pinnedTweet: TweetSnippet | undefined = undefined;

  for (const t of items) {
    const id = (t?.id_str || t?.id || "").toString();
    if (!id) continue;
    const text = t?.fullText || t?.full_text || t?.text || "";
    if (!text) continue;
    const url = t?.twitterUrl || t?.url;
    const createdAt = t?.createdAt || t?.created_at;
    const likes = t?.likeCount ?? t?.favorite_count;
    const retweets = t?.retweetCount ?? t?.retweet_count;
    const snippet: TweetSnippet = {
      id,
      text,
      url,
      createdAt,
      ...(typeof likes === "number" ? { likes } : {}),
      ...(typeof retweets === "number" ? { retweets } : {}),
    };
    if ((t?.isPinned || t?.pinned) && !pinnedTweet) {
      pinnedTweet = snippet;
    } else {
      tweets.push(snippet);
    }
  }

  const author = authorItem?.author;
  const bio = author?.description || author?.profileBio?.description || undefined;
  const bioLinks = extractBioLinks(authorItem);
  const followers = author?.followersCount ?? author?.followers;
  const following = author?.friendsCount ?? author?.following;
  const name = author?.name;

  return {
    handle,
    name,
    bio,
    bioLinks,
    followers: typeof followers === "number" ? followers : undefined,
    following: typeof following === "number" ? following : undefined,
    pinnedTweet,
    recentTweets: tweets,
    fetchedAt: new Date().toISOString(),
  };
}

function extractBioLinks(item: ApifyTweetItem | undefined): string[] {
  if (!item) return [];
  const links: string[] = [];
  const direct = item.author?.url;
  if (typeof direct === "string" && direct.length > 0) links.push(direct);
  const urls1 = item.author?.entities?.url?.urls;
  if (Array.isArray(urls1)) {
    for (const u of urls1) {
      if (u?.expandedUrl) links.push(u.expandedUrl);
    }
  }
  const urls2 = item.author?.profileBio?.entities?.url?.urls;
  if (Array.isArray(urls2)) {
    for (const u of urls2) {
      if (u?.expandedUrl) links.push(u.expandedUrl);
    }
  }
  // dedupe and filter to http(s)
  return Array.from(new Set(links.filter((l) => /^https?:\/\//.test(l))));
}

// ============================================================================
// Bio link fetch (light cheerio)
// ============================================================================

async function fetchBioLinkExcerpt(url: string): Promise<string | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BIO_LINK_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": "LoupeBot/0.1 (+https://loupe.dev)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return undefined;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("xhtml")) return undefined;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    const title = $("title").text().trim();
    const meta =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const parts = [
      title ? `TITLE: ${title}` : "",
      meta ? `DESCRIPTION: ${meta}` : "",
      bodyText ? `BODY: ${bodyText.slice(0, 3500)}` : "",
    ].filter((s) => s.length > 0);
    return parts.join("\n");
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Validation helpers
// ============================================================================

function normalizeHandle(raw: string): string | null {
  const cleaned = raw.trim().replace(/^@+/, "").replace(/^https?:\/\/(?:www\.|x\.|twitter\.)?(?:x\.com|twitter\.com)\//, "").split(/[/?#]/)[0];
  if (!cleaned) return null;
  if (!/^[A-Za-z0-9_]{1,30}$/.test(cleaned)) return null;
  return cleaned;
}

function validateRubric(r: unknown): string | null {
  if (!r || typeof r !== "object") return "rubric is required";
  const rb = r as Partial<Rubric>;
  if (typeof rb.topic !== "string" || rb.topic.trim().length === 0) {
    return "rubric.topic is required";
  }
  if (!Array.isArray(rb.criteria) || rb.criteria.length === 0) {
    return "rubric.criteria must be a non-empty array";
  }
  for (let i = 0; i < rb.criteria.length; i++) {
    const c = rb.criteria[i];
    if (!c || typeof c !== "object") return `rubric.criteria[${i}] invalid`;
    if (typeof c.id !== "string" || c.id.length === 0) return `rubric.criteria[${i}].id missing`;
    if (typeof c.label !== "string" || c.label.length === 0) return `rubric.criteria[${i}].label missing`;
  }
  return null;
}

function normalizeResults(raw: RawCalibrationOutput, rubric: Rubric): CriterionResult[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Calibration output is not an object");
  }
  const arr = raw.criteriaResults;
  if (!Array.isArray(arr)) throw new Error("criteriaResults missing or not an array");

  const byId = new Map<string, RawCriterionResult>();
  for (const item of arr as RawCriterionResult[]) {
    if (item && typeof item === "object" && typeof item.criterionId === "string") {
      byId.set(item.criterionId, item);
    }
  }

  const results: CriterionResult[] = [];
  for (const c of rubric.criteria) {
    const r = byId.get(c.id);
    if (r) {
      results.push(normalizeOneResult(c.id, r));
    } else {
      // Missing criterion in model output - emit a conservative fail.
      results.push({
        criterionId: c.id,
        passes: false,
        confidence: 0.3,
        verificationStrength: "claimed",
        evidenceTweetIds: [],
        externalEvidence: [],
        rationale: "Model did not emit a result for this criterion.",
      });
    }
  }
  return results;
}

function normalizeOneResult(criterionId: string, r: RawCriterionResult): CriterionResult {
  const passes = r.passes === true;
  let confidence = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : 0.5;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  const strength: VerificationStrength = VALID_STRENGTHS.includes(
    r.verificationStrength as VerificationStrength,
  )
    ? (r.verificationStrength as VerificationStrength)
    : "claimed";

  const evidenceTweetIds: string[] = Array.isArray(r.evidenceTweetIds)
    ? (r.evidenceTweetIds as unknown[])
        .map((x) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : ""))
        .filter((s) => s.length > 0)
    : [];

  const rawEv: unknown[] = Array.isArray(r.externalEvidence) ? (r.externalEvidence as unknown[]) : [];
  const externalEvidence: ExternalEvidence[] = [];
  for (const e of rawEv) {
    if (!e || typeof e !== "object") continue;
    const obj = e as { source?: unknown; url?: unknown; note?: unknown };
    const source = typeof obj.source === "string" ? (obj.source as VerificationSource) : undefined;
    if (!source || !VALID_VERIFICATION_SOURCES.has(source)) continue;
    const note = typeof obj.note === "string" ? obj.note : "";
    if (note.length === 0) continue;
    const url = typeof obj.url === "string" ? obj.url : undefined;
    externalEvidence.push({ source, url, note });
  }

  const rationale = typeof r.rationale === "string" && r.rationale.trim().length > 0
    ? r.rationale.trim()
    : "(no rationale)";

  return {
    criterionId,
    passes,
    confidence,
    verificationStrength: strength,
    evidenceTweetIds,
    externalEvidence,
    rationale,
  };
}
