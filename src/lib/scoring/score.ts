// Final scoring per candidate. Wraps fitScoreFromResults / avgStrength from
// types.ts and assembles a complete ScoredCandidate.
//
// We also expose a "lightScore" path used for the long tail of candidates
// where we skip the LLM cross-reference and synthesize CriterionResult[] from
// the bio + recent tweet text alone. Lightly-scored candidates always end up
// at strength="claimed" with low confidence.

import {
  avgStrength,
  fitScoreFromResults,
  type CandidateProfile,
  type CandidateSource,
  type Criterion,
  type CriterionResult,
  type Rubric,
  type ScoredCandidate,
} from "@/lib/types";

export function scoreCandidate(
  profile: CandidateProfile,
  results: CriterionResult[],
  rubric: Rubric,
  source: CandidateSource,
): ScoredCandidate {
  const fitScore = fitScoreFromResults(rubric.criteria, results);
  const passCount = results.filter((r) => r.passes).length;
  const averageVerificationStrength = avgStrength(results);
  return {
    profile,
    criteriaResults: results,
    fitScore,
    passCount,
    averageVerificationStrength,
    source,
  };
}

// ---------------------------------------------------------------------------
// Light scoring — used when caps are exceeded so we still produce a row but
// don't burn external API + LLM tokens on it.
// ---------------------------------------------------------------------------

function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function topicKeywords(rubric: Rubric): string[] {
  const set = new Set<string>();
  for (const t of tokenize(rubric.topic)) set.add(t);
  for (const c of rubric.criteria) {
    for (const t of tokenize(c.label)) set.add(t);
  }
  return Array.from(set).slice(0, 30);
}

function corpusFromProfile(profile: CandidateProfile): string {
  const parts: string[] = [];
  if (profile.bio) parts.push(profile.bio);
  if (profile.pinnedTweet) parts.push(profile.pinnedTweet.text);
  for (const t of profile.recentTweets) parts.push(t.text);
  return parts.join(" ").toLowerCase();
}

function lightCriterionResult(
  criterion: Criterion,
  corpus: string,
  topicWords: string[],
): CriterionResult {
  const labelWords = tokenize(criterion.label);
  const descWords = tokenize(criterion.description).slice(0, 8);
  const probe = new Set([...labelWords, ...descWords]);
  let hits = 0;
  for (const w of probe) {
    if (corpus.includes(w)) hits++;
  }
  const topicHits = topicWords.filter((w) => corpus.includes(w)).length;

  const passes = hits >= 2 && topicHits >= 2;
  const confidence = passes ? Math.min(0.5, 0.2 + hits * 0.05) : 0.15;
  return {
    criterionId: criterion.id,
    passes,
    confidence,
    verificationStrength: "claimed",
    evidenceTweetIds: [],
    externalEvidence: [],
    rationale: passes
      ? `Tweet/bio text mentions ${hits} criterion-relevant terms (light heuristic only).`
      : `Insufficient signal in tweets/bio for this criterion (light heuristic only).`,
  };
}

export function lightScoreFromProfile(
  profile: CandidateProfile,
  rubric: Rubric,
  source: CandidateSource,
): ScoredCandidate {
  const corpus = corpusFromProfile(profile);
  const topicWords = topicKeywords(rubric);
  const results = rubric.criteria.map((c) =>
    lightCriterionResult(c, corpus, topicWords),
  );
  return scoreCandidate(profile, results, rubric, source);
}

// ---------------------------------------------------------------------------
// Bio-relevance heuristic — used to pick which candidates get full
// verification. Higher score = more likely to be on-topic.
// ---------------------------------------------------------------------------

export function bioRelevanceScore(
  bio: string | undefined,
  name: string | undefined,
  rubric: Rubric,
): number {
  const haystack = `${bio ?? ""} ${name ?? ""}`.toLowerCase();
  if (!haystack.trim()) return 0;
  const words = topicKeywords(rubric);
  let score = 0;
  for (const w of words) {
    if (haystack.includes(w)) score += 1;
  }
  return score;
}
