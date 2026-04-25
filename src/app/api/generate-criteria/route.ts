import { NextResponse } from "next/server";
import type {
  Criterion,
  DomainArchetype,
  GenerateCriteriaRequest,
  GenerateCriteriaResponse,
  Rubric,
  VerificationSource,
} from "@/lib/types";
import { clampWeights } from "@/lib/types";
import { claudeJson } from "@/lib/anthropic-helpers";
import {
  CRITERIA_CRITIQUE_SYSTEM_PROMPT,
  CRITERIA_SYSTEM_PROMPT,
  buildCriteriaUserPrompt,
  buildCritiqueUserPrompt,
} from "@/lib/prompts/criteria";

// Route handler runs on Node (not edge): we need full SDK + cheerio support
// later, and Anthropic streaming uses Node fetch happily on the server runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ARCHETYPES = new Set<DomainArchetype>([
  "academic-research",
  "industry-professional",
  "craft-artistic",
  "community-fandom",
  "hybrid",
]);

const VALID_VERIFICATION_SOURCES = new Set<VerificationSource>([
  "twitter",
  "personal-site",
  "github",
  "semantic-scholar",
  "web-search",
  "company-page",
  "wikipedia",
]);

type RawCriterion = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  weight?: unknown;
  examples?: unknown;
  verificationSources?: unknown;
};

type RawDraft = {
  archetype?: unknown;
  criteria?: unknown;
  searchQueries?: unknown;
};

type RawCritique = {
  ok?: unknown;
  issues?: unknown;
  patched?: unknown;
};

export async function POST(req: Request): Promise<NextResponse<GenerateCriteriaResponse>> {
  let body: GenerateCriteriaRequest;
  try {
    body = (await req.json()) as GenerateCriteriaRequest;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  const hint = typeof body?.hint === "string" ? body.hint.trim() : undefined;

  if (topic.length === 0) {
    return NextResponse.json(
      { ok: false, error: "topic is required" },
      { status: 400 },
    );
  }
  if (topic.length > 200) {
    return NextResponse.json(
      { ok: false, error: "topic must be <= 200 characters" },
      { status: 400 },
    );
  }
  if (hint && hint.length > 400) {
    return NextResponse.json(
      { ok: false, error: "hint must be <= 400 characters" },
      { status: 400 },
    );
  }

  try {
    // Stage 1: extended-thinking initial draft.
    const draftRes = await claudeJson<RawDraft>({
      system: CRITERIA_SYSTEM_PROMPT,
      user: buildCriteriaUserPrompt(topic, hint),
      maxTokens: 12_000,
      thinking: { enabled: true, budgetTokens: 8_000 },
    });

    let normalized = normalizeDraft(draftRes.parsed);

    // Stage 2: self-critique. No thinking; smaller call.
    try {
      const critiqueRes = await claudeJson<RawCritique>({
        system: CRITERIA_CRITIQUE_SYSTEM_PROMPT,
        user: buildCritiqueUserPrompt(topic, hint, JSON.stringify(normalized)),
        maxTokens: 6_000,
        thinking: { enabled: false },
      });

      if (critiqueRes.parsed && critiqueRes.parsed.ok === false && critiqueRes.parsed.patched) {
        try {
          normalized = normalizeDraft(critiqueRes.parsed.patched as RawDraft);
        } catch (err) {
          // If the patched rubric is malformed, fall back to the original draft.
          console.warn("[generate-criteria] critique patch malformed, keeping draft:", (err as Error).message);
        }
      }
    } catch (err) {
      // Critique is best-effort: if it fails or returns garbage, ship the draft.
      console.warn("[generate-criteria] critique step failed:", (err as Error).message);
    }

    const rubric: Rubric = {
      topic,
      hint,
      archetype: normalized.archetype,
      criteria: normalized.criteria,
      searchQueries: normalized.searchQueries,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, rubric });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[generate-criteria] failed:", err);
    return NextResponse.json(
      { ok: false, error: `Criteria generation failed: ${msg}` },
      { status: 500 },
    );
  }
}

// ============================================================================
// Validation / normalization helpers
// ============================================================================

type NormalizedDraft = {
  archetype: DomainArchetype;
  criteria: Criterion[];
  searchQueries: string[];
};

function normalizeDraft(raw: RawDraft): NormalizedDraft {
  if (!raw || typeof raw !== "object") {
    throw new Error("Draft is not an object");
  }

  // archetype
  const archetypeStr = typeof raw.archetype === "string" ? raw.archetype.trim() : "";
  if (!VALID_ARCHETYPES.has(archetypeStr as DomainArchetype)) {
    throw new Error(`Invalid archetype: ${archetypeStr || "(missing)"}`);
  }
  const archetype = archetypeStr as DomainArchetype;

  // criteria
  if (!Array.isArray(raw.criteria) || raw.criteria.length === 0) {
    throw new Error("criteria must be a non-empty array");
  }
  const rawCriteria = raw.criteria as RawCriterion[];
  if (rawCriteria.length < 3 || rawCriteria.length > 7) {
    throw new Error(`criteria must have 3-7 entries; got ${rawCriteria.length}`);
  }

  const seenIds = new Set<string>();
  const criteria: Criterion[] = rawCriteria.map((c, i) => normalizeCriterion(c, i, seenIds));

  // Force weights to integers summing to exactly 100.
  const reweighted = clampWeights(criteria);
  const sum = reweighted.reduce((s, c) => s + c.weight, 0);
  if (sum !== 100 && reweighted.length > 0) {
    // Fix off-by-one rounding by adjusting the largest-weight criterion.
    let idx = 0;
    for (let i = 1; i < reweighted.length; i++) {
      if (reweighted[i].weight > reweighted[idx].weight) idx = i;
    }
    reweighted[idx] = { ...reweighted[idx], weight: reweighted[idx].weight + (100 - sum) };
  }

  // searchQueries
  let searchQueries: string[] = [];
  if (Array.isArray(raw.searchQueries)) {
    searchQueries = raw.searchQueries
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter((q) => q.length > 0);
  }
  if (searchQueries.length === 0) {
    throw new Error("searchQueries must be a non-empty array of strings");
  }
  // Cap at 10 to control cost downstream.
  if (searchQueries.length > 10) searchQueries = searchQueries.slice(0, 10);

  return { archetype, criteria: reweighted, searchQueries };
}

function normalizeCriterion(
  c: RawCriterion,
  i: number,
  seenIds: Set<string>,
): Criterion {
  const label = typeof c.label === "string" ? c.label.trim() : "";
  if (label.length === 0) throw new Error(`criterion[${i}].label missing`);

  let id = typeof c.id === "string" ? c.id.trim() : "";
  if (id.length === 0) id = slugify(label);
  // de-dupe ids
  let unique = id;
  let n = 2;
  while (seenIds.has(unique)) {
    unique = `${id}-${n}`;
    n++;
  }
  seenIds.add(unique);

  const description = typeof c.description === "string" ? c.description.trim() : "";
  if (description.length === 0) throw new Error(`criterion[${i}].description missing`);

  const weight = typeof c.weight === "number" && Number.isFinite(c.weight) ? Math.round(c.weight) : 0;
  if (weight <= 0) throw new Error(`criterion[${i}].weight must be > 0`);

  let examplesRaw: unknown[] = Array.isArray(c.examples) ? (c.examples as unknown[]) : [];
  const examples = examplesRaw
    .map((e) => (typeof e === "string" ? e.replace(/^@+/, "").trim() : ""))
    .filter((e) => e.length > 0);
  // We require 3 per spec, but if the model gave 2 we degrade gracefully (and log).
  if (examples.length < 1) {
    throw new Error(`criterion[${i}] (${id}) must list at least one example handle`);
  }
  if (examples.length < 3) {
    console.warn(
      `[generate-criteria] criterion ${id} only has ${examples.length} example handles (spec wants 3)`,
    );
  }

  let sourcesRaw: unknown[] = Array.isArray(c.verificationSources)
    ? (c.verificationSources as unknown[])
    : [];
  const verificationSources = sourcesRaw
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s): s is VerificationSource =>
      VALID_VERIFICATION_SOURCES.has(s as VerificationSource),
    );
  if (verificationSources.length === 0) {
    // Default to twitter so downstream code never crashes on an empty array.
    verificationSources.push("twitter");
  }

  return {
    id: unique,
    label,
    description,
    weight,
    examples,
    verificationSources,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "criterion";
}
