// Loupe orchestrator. POST /api/run takes a RunRequest and streams SSE
// RunEvents while running discover + follows modes concurrently.
//
// Contract & error rules:
//   - Per-stage failures emit `{type:"error"}` events but do NOT close the
//     stream. The other mode keeps going.
//   - We always emit a `done` per-mode at the end (even if it failed early).
//   - We always controller.close() in a finally so the client never hangs.
//   - We never throw out of the ReadableStream's start() function.

import { discoverCandidates, type DiscoveredCandidate } from "@/lib/discovery";
import { fetchFollowing } from "@/lib/following";
import { bioRelevanceScore, lightScoreFromProfile, scoreCandidate } from "@/lib/scoring/score";
import { fetchProfile } from "@/lib/verification/twitter";
import { verifyProfile } from "@/lib/verification";
import { normalizeHandle } from "@/lib/apify-helpers";
import type {
  CandidateProfile,
  CandidateSource,
  RunEvent,
  RunMode,
  RunRequest,
  Rubric,
  ScoredCandidate,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Caps (see PRD 5.4)
// ---------------------------------------------------------------------------

const DISCOVER_MAX_AFTER_FILTER = 80;
const DISCOVER_FULL_VERIFY_TOP_N = 30;

const FOLLOWS_HARD_CAP = 300;
const FOLLOWS_FULL_VERIFY_TOP_N = 60;

// Concurrency for the per-candidate verification fan-out.
const VERIFY_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// SSE plumbing
// ---------------------------------------------------------------------------

type Emit = (event: RunEvent) => void;

function makeEmit(controller: ReadableStreamDefaultController<Uint8Array>): Emit {
  const enc = new TextEncoder();
  let closed = false;
  return (event: RunEvent) => {
    if (closed) return;
    try {
      controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // Controller already closed (e.g. client disconnect). Mark and drop.
      closed = true;
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every(isString);
}

// ---------------------------------------------------------------------------
// Discover mode
// ---------------------------------------------------------------------------

async function runDiscover(rubric: Rubric, emit: Emit): Promise<void> {
  emit({ type: "phase", mode: "discover", phase: "start" });

  let pool: DiscoveredCandidate[];
  try {
    const out = await discoverCandidates(rubric, {
      onPhase: (phase, detail, counts) => {
        emit({ type: "phase", mode: "discover", phase, detail, counts });
      },
    });
    pool = out.candidates.slice(0, DISCOVER_MAX_AFTER_FILTER);
  } catch (err) {
    emit({
      type: "error",
      mode: "discover",
      message: `discovery failed: ${(err as Error).message ?? String(err)}`,
    });
    emit({ type: "done", mode: "discover", total: 0 });
    return;
  }

  if (pool.length === 0) {
    emit({ type: "phase", mode: "discover", phase: "verify", detail: "no candidates after filter" });
    emit({ type: "done", mode: "discover", total: 0 });
    return;
  }

  // Fetch profiles for everyone first (cheap-ish — Apify per-handle).
  emit({
    type: "phase",
    mode: "discover",
    phase: "fetch-profiles",
    detail: `fetching profiles for ${pool.length} candidates`,
    counts: { pool: pool.length },
  });

  const profiles = await inBatches(pool, VERIFY_CONCURRENCY, async (c) => {
    try {
      const profile = await fetchProfile(c.handle);
      return { candidate: c, profile, error: null as string | null };
    } catch (err) {
      return {
        candidate: c,
        profile: null as CandidateProfile | null,
        error: (err as Error).message ?? String(err),
      };
    }
  });

  // Rank by bio relevance to pick the top-N for full verification.
  const withProfiles = profiles
    .filter((p) => p.profile !== null)
    .map((p) => ({
      candidate: p.candidate,
      profile: p.profile as CandidateProfile,
      relevance: bioRelevanceScore(
        p.profile?.bio,
        p.profile?.name,
        rubric,
      ),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  const fullSet = new Set(
    withProfiles.slice(0, DISCOVER_FULL_VERIFY_TOP_N).map((p) => p.candidate.handle),
  );

  // Surface profile-fetch failures as error events.
  for (const p of profiles) {
    if (!p.profile && p.error) {
      emit({
        type: "error",
        mode: "discover",
        message: `@${p.candidate.handle}: ${p.error}`,
      });
    }
  }

  emit({
    type: "phase",
    mode: "discover",
    phase: "verify",
    detail: `verifying top ${fullSet.size}, light-scoring ${
      withProfiles.length - fullSet.size
    }`,
    counts: {
      profilesFetched: withProfiles.length,
      fullVerify: fullSet.size,
      lightScore: Math.max(0, withProfiles.length - fullSet.size),
    },
  });

  let total = 0;
  await inBatches(withProfiles, VERIFY_CONCURRENCY, async (entry) => {
    let scored: ScoredCandidate;
    if (fullSet.has(entry.candidate.handle)) {
      try {
        const v = await verifyProfile(entry.profile, rubric);
        scored = scoreCandidate(v.profile, v.results, rubric, entry.candidate.source);
      } catch (err) {
        emit({
          type: "error",
          mode: "discover",
          message: `verify failed for @${entry.candidate.handle}: ${
            (err as Error).message ?? String(err)
          }`,
        });
        scored = lightScoreFromProfile(entry.profile, rubric, entry.candidate.source);
      }
    } else {
      scored = lightScoreFromProfile(entry.profile, rubric, entry.candidate.source);
    }
    emit({ type: "candidate", mode: "discover", candidate: scored });
    total++;
  });

  emit({ type: "done", mode: "discover", total });
}

// ---------------------------------------------------------------------------
// Follows mode
// ---------------------------------------------------------------------------

async function runFollows(
  rubric: Rubric,
  userHandle: string | undefined,
  manualFollows: string[] | undefined,
  emit: Emit,
): Promise<void> {
  emit({ type: "phase", mode: "follows", phase: "start" });

  let handles: string[] = [];
  // Prefer a manual override if provided.
  if (manualFollows && manualFollows.length > 0) {
    handles = manualFollows.map(normalizeHandle).filter((h) => h.length > 0);
    emit({
      type: "phase",
      mode: "follows",
      phase: "fetch-follows",
      detail: `using ${handles.length} user-supplied handles`,
      counts: { provided: handles.length },
    });
  } else if (userHandle) {
    emit({ type: "phase", mode: "follows", phase: "fetch-follows", detail: `fetching follows for @${userHandle}` });
    const result = await fetchFollowing(userHandle, FOLLOWS_HARD_CAP);
    if (result.ok) {
      handles = result.handles;
      emit({
        type: "phase",
        mode: "follows",
        phase: "fetch-follows",
        detail: `got ${handles.length} handles via apify`,
        counts: { fetched: handles.length },
      });
    } else {
      emit({
        type: "error",
        mode: "follows",
        message: `apify follow-list unavailable: ${result.reason}. Pass userFollowingHandles[] to retry.`,
      });
      emit({ type: "done", mode: "follows", total: 0 });
      return;
    }
  } else {
    emit({
      type: "error",
      mode: "follows",
      message: "follows mode requires userHandle or userFollowingHandles[].",
    });
    emit({ type: "done", mode: "follows", total: 0 });
    return;
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const h of handles) {
    if (seen.has(h)) continue;
    seen.add(h);
    deduped.push(h);
    if (deduped.length >= FOLLOWS_HARD_CAP) break;
  }

  if (deduped.length === 0) {
    emit({ type: "done", mode: "follows", total: 0 });
    return;
  }

  emit({
    type: "phase",
    mode: "follows",
    phase: "fetch-profiles",
    detail: `fetching ${deduped.length} profiles`,
    counts: { pool: deduped.length },
  });

  const profiles = await inBatches(deduped, VERIFY_CONCURRENCY, async (handle) => {
    try {
      const profile = await fetchProfile(handle);
      return { handle, profile, error: null as string | null };
    } catch (err) {
      return {
        handle,
        profile: null as CandidateProfile | null,
        error: (err as Error).message ?? String(err),
      };
    }
  });

  for (const p of profiles) {
    if (!p.profile && p.error) {
      emit({ type: "error", mode: "follows", message: `@${p.handle}: ${p.error}` });
    }
  }

  const withProfiles = profiles
    .filter((p) => p.profile !== null)
    .map((p) => ({
      handle: p.handle,
      profile: p.profile as CandidateProfile,
      relevance: bioRelevanceScore(p.profile?.bio, p.profile?.name, rubric),
    }))
    .sort((a, b) => b.relevance - a.relevance);

  const fullSet = new Set(
    withProfiles.slice(0, FOLLOWS_FULL_VERIFY_TOP_N).map((p) => p.handle),
  );

  emit({
    type: "phase",
    mode: "follows",
    phase: "verify",
    detail: `verifying top ${fullSet.size}, light-scoring ${
      withProfiles.length - fullSet.size
    }`,
    counts: {
      profilesFetched: withProfiles.length,
      fullVerify: fullSet.size,
      lightScore: Math.max(0, withProfiles.length - fullSet.size),
    },
  });

  const source: CandidateSource = "user-following";
  let total = 0;
  await inBatches(withProfiles, VERIFY_CONCURRENCY, async (entry) => {
    let scored: ScoredCandidate;
    if (fullSet.has(entry.handle)) {
      try {
        const v = await verifyProfile(entry.profile, rubric);
        scored = scoreCandidate(v.profile, v.results, rubric, source);
      } catch (err) {
        emit({
          type: "error",
          mode: "follows",
          message: `verify failed for @${entry.handle}: ${
            (err as Error).message ?? String(err)
          }`,
        });
        scored = lightScoreFromProfile(entry.profile, rubric, source);
      }
    } else {
      scored = lightScoreFromProfile(entry.profile, rubric, source);
    }
    emit({ type: "candidate", mode: "follows", candidate: scored });
    total++;
  });

  emit({ type: "done", mode: "follows", total });
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------

function emitErrorOnce(
  emit: Emit,
  mode: RunMode,
  message: string,
): void {
  emit({ type: "error", mode, message });
  emit({ type: "done", mode, total: 0 });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const reqBody = body as Partial<RunRequest> & { userFollowingHandles?: unknown };
  const rubric = reqBody.rubric;
  const userHandle = typeof reqBody.userHandle === "string" ? reqBody.userHandle.trim() : undefined;
  const modes = Array.isArray(reqBody.modes) ? reqBody.modes : [];
  const manualFollows = isStringArray(reqBody.userFollowingHandles)
    ? reqBody.userFollowingHandles
    : undefined;

  if (!rubric || !rubric.topic || !Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    return new Response("rubric is required and must have criteria", { status: 400 });
  }
  if (modes.length === 0) {
    return new Response("modes must be non-empty", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = makeEmit(controller);
      try {
        const tasks: Promise<void>[] = [];
        if (modes.includes("discover")) {
          tasks.push(
            runDiscover(rubric, emit).catch((err) => {
              emitErrorOnce(
                emit,
                "discover",
                `unhandled: ${(err as Error).message ?? String(err)}`,
              );
            }),
          );
        }
        if (modes.includes("follows")) {
          tasks.push(
            runFollows(rubric, userHandle, manualFollows, emit).catch((err) => {
              emitErrorOnce(
                emit,
                "follows",
                `unhandled: ${(err as Error).message ?? String(err)}`,
              );
            }),
          );
        }
        await Promise.allSettled(tasks);
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
