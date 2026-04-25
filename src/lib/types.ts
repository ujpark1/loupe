// ============================================================================
// CONTRACTS — these types are the API between agents.
// Keep them stable. If you change one, every consumer needs to be updated.
// ============================================================================

// ----- Topic & rubric -------------------------------------------------------

export type DomainArchetype =
  | "academic-research"
  | "industry-professional"
  | "craft-artistic"
  | "community-fandom"
  | "hybrid";

export type VerificationSource =
  | "twitter"
  | "personal-site"
  | "github"
  | "semantic-scholar"
  | "web-search"
  | "company-page"
  | "wikipedia";

export type Criterion = {
  id: string;            // kebab-case
  label: string;
  description: string;
  weight: number;        // 0-100; criteria weights sum to 100
  examples: string[];    // X handles WITHOUT @
  verificationSources: VerificationSource[];
};

export type Rubric = {
  topic: string;
  hint?: string;
  archetype: DomainArchetype;
  criteria: Criterion[];
  searchQueries: string[]; // 5-10 X search queries for candidate discovery
  generatedAt: string;     // ISO timestamp
};

// ----- Candidate raw data ---------------------------------------------------

export type TweetSnippet = {
  id: string;
  text: string;
  url?: string;
  createdAt?: string;
  likes?: number;
  retweets?: number;
};

export type CandidateProfile = {
  handle: string;            // without @
  name?: string;
  bio?: string;
  bioLinks: string[];
  followers?: number;
  following?: number;
  pinnedTweet?: TweetSnippet;
  recentTweets: TweetSnippet[]; // 30-50 most recent
  fetchedAt: string;
};

// ----- Verification evidence -----------------------------------------------

export type ExternalEvidence = {
  source: VerificationSource;
  url?: string;
  note: string;          // 1-line summary of what this evidence shows
};

export type VerificationStrength = "verified" | "indirect" | "claimed";

export type CriterionResult = {
  criterionId: string;
  passes: boolean;
  confidence: number;              // 0-1
  verificationStrength: VerificationStrength;
  evidenceTweetIds: string[];
  externalEvidence: ExternalEvidence[];
  rationale: string;               // 1 sentence
};

// ----- Final scored candidate ----------------------------------------------

export type ScoredCandidate = {
  profile: CandidateProfile;
  criteriaResults: CriterionResult[];
  fitScore: number;                // 0-100
  passCount: number;               // criteria passed
  averageVerificationStrength: VerificationStrength;
  source: CandidateSource;         // how this candidate entered the pool
};

export type CandidateSource =
  | "rubric-example"
  | "seed-network"
  | "keyword-search"
  | "bio-search"
  | "user-following";

// ----- API request/response shapes -----------------------------------------

export type GenerateCriteriaRequest = {
  topic: string;
  hint?: string;
};

export type GenerateCriteriaResponse =
  | { ok: true; rubric: Rubric }
  | { ok: false; error: string };

export type CalibrationTestRequest = {
  handle: string;
  rubric: Rubric;
};

export type CalibrationTestResponse =
  | {
      ok: true;
      handle: string;
      criteriaResults: CriterionResult[];
      fitScore: number;
      passCount: number;
      profile: { name?: string; bio?: string };
    }
  | { ok: false; error: string };

export type RunMode = "discover" | "follows";

export type RunRequest = {
  rubric: Rubric;
  userHandle?: string;     // required when modes includes "follows"
  modes: RunMode[];
};

// SSE events streamed from /api/run
export type RunEvent =
  | { type: "phase"; mode: RunMode; phase: string; detail?: string; counts?: Record<string, number> }
  | { type: "candidate"; mode: RunMode; candidate: ScoredCandidate }
  | { type: "done"; mode: RunMode; total: number }
  | { type: "error"; mode: RunMode; message: string };

// ----- Helpers --------------------------------------------------------------

export function clampWeights(criteria: Criterion[]): Criterion[] {
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return criteria;
  return criteria.map((c) => ({ ...c, weight: Math.round((c.weight / total) * 100) }));
}

export function fitScoreFromResults(
  criteria: Criterion[],
  results: CriterionResult[],
): number {
  let total = 0;
  for (const c of criteria) {
    const r = results.find((x) => x.criterionId === c.id);
    if (!r) continue;
    if (r.passes) total += c.weight * r.confidence;
  }
  return Math.round(total);
}

export function strengthRank(s: VerificationStrength): number {
  return s === "verified" ? 2 : s === "indirect" ? 1 : 0;
}

export function avgStrength(results: CriterionResult[]): VerificationStrength {
  if (results.length === 0) return "claimed";
  const passed = results.filter((r) => r.passes);
  if (passed.length === 0) return "claimed";
  const avg = passed.reduce((s, r) => s + strengthRank(r.verificationStrength), 0) / passed.length;
  if (avg >= 1.5) return "verified";
  if (avg >= 0.5) return "indirect";
  return "claimed";
}
