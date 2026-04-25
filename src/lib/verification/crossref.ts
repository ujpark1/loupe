// Step 7: cross-reference LLM call. Takes the candidate profile + every piece
// of external evidence we collected and produces one CriterionResult per
// rubric criterion. Output is strictly typed and validated.

import { claudeJson } from "@/lib/anthropic-helpers";
import type {
  CandidateProfile,
  Criterion,
  CriterionResult,
  ExternalEvidence,
  Rubric,
  VerificationSource,
  VerificationStrength,
} from "@/lib/types";
import type { BioLinkResult } from "@/lib/verification/biolinks";
import type { CompanyHit } from "@/lib/verification/companypage";
import type { GithubProbe } from "@/lib/verification/github";
import type { ScholarAuthor } from "@/lib/verification/scholar";
import type { WebSearchResult } from "@/lib/verification/websearch";

export type EvidenceBundle = {
  bioLinks: BioLinkResult[];
  webSearch: WebSearchResult[];
  github: GithubProbe | null;
  scholar: ScholarAuthor | null;
  companyHits: CompanyHit[];
};

const SYSTEM = `You are a verification analyst evaluating an X (Twitter) account against a structured expertise rubric.

You will receive:
- A profile (handle, bio, recent tweet snippets, links).
- Evidence from external sources: bio-link page snippets, Tavily web search, GitHub, Semantic Scholar, scanned company pages.
- A rubric with criteria (id, label, description, verification_sources hint).

For EACH criterion in the rubric, output exactly one entry with this shape:

{
  "criterionId": "<criterion id>",
  "passes": <boolean — does this person meet this criterion?>,
  "confidence": <number 0..1 — how sure you are>,
  "verificationStrength": "verified" | "indirect" | "claimed",
  "evidenceTweetIds": [<string ids of tweets that support the verdict, may be empty>],
  "externalEvidence": [
    { "source": "<one of: twitter|personal-site|github|semantic-scholar|web-search|company-page|wikipedia>", "url": "<url or omit>", "note": "<1-line summary>" }
  ],
  "rationale": "<one sentence>"
}

Rules:
- "verified" requires at least one externalEvidence item that is NOT just twitter and corroborates the criterion.
- "indirect" means strong tweet/bio signal but no external corroboration beyond Twitter.
- "claimed" means only the bio claims it (no tweet activity, no external) — usually with passes=false or low confidence.
- If you can't tell, set passes=false, confidence<=0.4, verificationStrength="claimed", evidenceTweetIds=[], externalEvidence=[].
- Tweet ids must come from the supplied recentTweets list. Don't invent ids.
- Keep rationale to ONE sentence and reference concrete evidence.
- Do not output anything except a single JSON object: {"results": [<one entry per criterion>]}.`;

type LlmOut = { results: unknown };

const VALID_SOURCES: VerificationSource[] = [
  "twitter",
  "personal-site",
  "github",
  "semantic-scholar",
  "web-search",
  "company-page",
  "wikipedia",
];

const VALID_STRENGTHS: VerificationStrength[] = ["verified", "indirect", "claimed"];

function asString(x: unknown): string | undefined {
  return typeof x === "string" && x.length > 0 ? x : undefined;
}

function asNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function parseExternal(raw: unknown): ExternalEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalEvidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const sourceStr = asString(obj.source);
    if (!sourceStr) continue;
    const source = (VALID_SOURCES as string[]).includes(sourceStr)
      ? (sourceStr as VerificationSource)
      : null;
    if (!source) continue;
    const note = asString(obj.note) ?? "";
    if (!note) continue;
    out.push({
      source,
      url: asString(obj.url),
      note: note.slice(0, 280),
    });
  }
  return out.slice(0, 6);
}

function fallbackResult(criterion: Criterion): CriterionResult {
  return {
    criterionId: criterion.id,
    passes: false,
    confidence: 0,
    verificationStrength: "claimed",
    evidenceTweetIds: [],
    externalEvidence: [],
    rationale: "Insufficient evidence to evaluate.",
  };
}

function validate(
  raw: unknown,
  rubric: Rubric,
  validTweetIds: Set<string>,
): CriterionResult[] {
  const out: CriterionResult[] = [];
  const byId = new Map<string, CriterionResult>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const criterionId = asString(obj.criterionId);
      if (!criterionId) continue;
      const matched = rubric.criteria.find((c) => c.id === criterionId);
      if (!matched) continue;
      const passes = obj.passes === true;
      const confidenceRaw = asNumber(obj.confidence) ?? 0;
      const confidence = clamp01(confidenceRaw);
      const strengthStr = asString(obj.verificationStrength) ?? "claimed";
      const verificationStrength = (VALID_STRENGTHS as string[]).includes(strengthStr)
        ? (strengthStr as VerificationStrength)
        : "claimed";
      const tweetIdsRaw = Array.isArray(obj.evidenceTweetIds) ? obj.evidenceTweetIds : [];
      const evidenceTweetIds = tweetIdsRaw
        .map((x) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : ""))
        .filter((s) => s && validTweetIds.has(s));
      const externalEvidence = parseExternal(obj.externalEvidence);
      const rationale = (asString(obj.rationale) ?? "").slice(0, 400) || "No rationale provided.";

      byId.set(criterionId, {
        criterionId,
        passes,
        confidence,
        verificationStrength,
        evidenceTweetIds,
        externalEvidence,
        rationale,
      });
    }
  }
  for (const c of rubric.criteria) {
    out.push(byId.get(c.id) ?? fallbackResult(c));
  }
  return out;
}

function describeProfile(profile: CandidateProfile): string {
  const lines: string[] = [];
  lines.push(`@${profile.handle}${profile.name ? ` (${profile.name})` : ""}`);
  if (profile.bio) lines.push(`bio: ${profile.bio.slice(0, 400)}`);
  if (profile.bioLinks.length > 0) lines.push(`links: ${profile.bioLinks.slice(0, 5).join(" | ")}`);
  if (typeof profile.followers === "number") lines.push(`followers: ${profile.followers}`);
  if (profile.pinnedTweet) {
    lines.push(`pinned[${profile.pinnedTweet.id}]: ${profile.pinnedTweet.text.slice(0, 240)}`);
  }
  const tweets = profile.recentTweets.slice(0, 25);
  if (tweets.length > 0) {
    lines.push(`recentTweets:`);
    for (const t of tweets) {
      lines.push(`  [${t.id}] ${t.text.slice(0, 220).replace(/\s+/g, " ")}`);
    }
  }
  return lines.join("\n");
}

function describeEvidence(e: EvidenceBundle): string {
  const lines: string[] = [];
  if (e.bioLinks.length > 0) {
    lines.push(`bio-link pages:`);
    for (const b of e.bioLinks) {
      const head = b.title ? ` "${b.title}"` : "";
      lines.push(`  - ${b.url}${head} [status=${b.status}]`);
      if (b.description) lines.push(`    desc: ${b.description}`);
      if (b.snippet) lines.push(`    body: ${b.snippet.slice(0, 360)}`);
    }
  }
  if (e.webSearch.length > 0) {
    lines.push(`web search (Tavily):`);
    for (const w of e.webSearch) {
      lines.push(`  - ${w.url}${w.title ? ` :: ${w.title}` : ""}`);
      if (w.snippet) lines.push(`    ${w.snippet.slice(0, 280)}`);
    }
  }
  if (e.github) {
    const g = e.github;
    lines.push(
      `github: ${g.url} login=${g.login} followers=${g.followers} totalStars=${g.totalStars} langs=${g.topRepoLanguages.join(",")}`,
    );
    if (g.topRepoUrls.length > 0) lines.push(`  topRepos: ${g.topRepoUrls.join(" | ")}`);
  }
  if (e.scholar) {
    const s = e.scholar;
    lines.push(
      `semantic-scholar: ${s.url} name="${s.name}" papers=${s.paperCount} citations=${s.citationCount} hIndex=${s.hIndex}`,
    );
  }
  if (e.companyHits.length > 0) {
    lines.push(`company pages:`);
    for (const c of e.companyHits) {
      lines.push(`  - ${c.url}: ${c.snippet.slice(0, 280)}`);
    }
  }
  if (lines.length === 0) return "(no external evidence collected)";
  return lines.join("\n");
}

function describeCriteria(rubric: Rubric): string {
  return rubric.criteria
    .map(
      (c) =>
        `- id=${c.id} weight=${c.weight} label="${c.label}" description="${c.description}" sources=[${c.verificationSources.join(",")}]`,
    )
    .join("\n");
}

export async function crossReference(
  profile: CandidateProfile,
  evidence: EvidenceBundle,
  rubric: Rubric,
): Promise<CriterionResult[]> {
  const validTweetIds = new Set<string>();
  if (profile.pinnedTweet) validTweetIds.add(profile.pinnedTweet.id);
  for (const t of profile.recentTweets) validTweetIds.add(t.id);

  const userPrompt = [
    `TOPIC: ${rubric.topic}`,
    rubric.hint ? `HINT: ${rubric.hint}` : null,
    `ARCHETYPE: ${rubric.archetype}`,
    ``,
    `CRITERIA:`,
    describeCriteria(rubric),
    ``,
    `PROFILE:`,
    describeProfile(profile),
    ``,
    `EVIDENCE:`,
    describeEvidence(evidence),
    ``,
    `Return JSON: {"results": [...]} with one entry per criterion id above. Use only tweet ids from the recentTweets list. Be honest — say "claimed" / passes=false when evidence is thin.`,
  ]
    .filter((x) => x !== null)
    .join("\n");

  try {
    const { parsed } = await claudeJson<LlmOut>({
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 4000,
      thinking: { enabled: true, budgetTokens: 4000 },
    });
    return validate(parsed.results, rubric, validTweetIds);
  } catch {
    return rubric.criteria.map(fallbackResult);
  }
}
