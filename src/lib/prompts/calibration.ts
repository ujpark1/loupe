import type { Rubric, CandidateProfile } from "@/lib/types";

/**
 * Calibration-test prompt.
 *
 * One Claude call. Inputs:
 *   - the user's rubric
 *   - the candidate's profile (handle, bio, bio-link page text, recent tweets)
 *
 * Output: per-criterion pass/fail with confidence, verification strength,
 * evidence tweet ids, optional external evidence, and a short rationale.
 *
 * Design notes:
 *   - Single call (no per-criterion loop) - cheap and fast.
 *   - Verification strength must be honest: "verified" only if external evidence
 *     was actually present in inputs (bio link page, scholar lookup hit, etc.).
 *     For calibration we usually only have twitter + 1 link page, so most
 *     pass/fail decisions will be "indirect" or "claimed" by design.
 */

export const CALIBRATION_SYSTEM_PROMPT = `You are scoring a candidate X account against a user-defined expertise rubric.

You will receive:
  1. The rubric: archetype + 5 criteria with descriptions + verification sources.
  2. The candidate: handle, bio, bio-linked page excerpt (may be empty), pinned tweet, recent tweets (id + text + url + likes).

For EACH criterion, decide:
  - passes: boolean. True only if the available evidence supports it. When in doubt, pass=false; vagueness is not a pass.
  - confidence: 0.0 - 1.0. How sure you are in the pass/fail call. Use 0.5 only when truly torn.
  - verificationStrength: one of "verified" | "indirect" | "claimed".
      "verified"  = corroborated by an external source you can SEE in the inputs (bio-link page, company about page, github repo description, etc.).
      "indirect"  = inferred from on-platform behaviour or self-description that is consistent and specific (e.g., consistent technical threads matching the criterion).
      "claimed"   = the only support is the candidate's own bio claim or a single self-promotional tweet, with nothing corroborating.
  - evidenceTweetIds: tweet ids you used as evidence, [] if none.
  - externalEvidence: array of { source, url?, note }. Only fill in when you actually have non-Twitter input you used. Otherwise return [].
  - rationale: ONE sentence. Cite a specific tweet id, bio phrase, or link page detail. Don't editorialize.

Hard rules:
  - Do not invent evidence. If you didn't see the tweet or page, don't cite it.
  - Do not assume facts not in the input. The only inputs you have are the bio, bio-link page (if present), and recent tweets.
  - "verified" requires an external source visible in the input. If you only saw tweets, the maximum is "indirect".
  - If the criterion is about credentials (PhD, faculty position, MD) and the only support is the bio's self-claim, that is "claimed".

Output: JSON only, no prose, no fences. Shape:

{
  "criteriaResults": [
    {
      "criterionId": "kebab-case-id-from-rubric",
      "passes": true,
      "confidence": 0.85,
      "verificationStrength": "indirect",
      "evidenceTweetIds": ["1234567890"],
      "externalEvidence": [],
      "rationale": "Tweet 1234567890 walks through a specific deployment; consistent with shipped-AI-features."
    }
    // one entry per criterion in the rubric, in the same order
  ]
}

Return JSON only.`;

export function buildCalibrationUserPrompt(
  rubric: Rubric,
  profile: CandidateProfile,
  bioLinkExcerpt?: string,
): string {
  const lines: string[] = [];
  lines.push("=== RUBRIC ===");
  lines.push(`Topic: ${rubric.topic}`);
  if (rubric.hint) lines.push(`Hint: ${rubric.hint}`);
  lines.push(`Archetype: ${rubric.archetype}`);
  lines.push("");
  lines.push("Criteria:");
  for (const c of rubric.criteria) {
    lines.push(
      `- id: ${c.id}\n  label: ${c.label}\n  description: ${c.description}\n  weight: ${c.weight}\n  verificationSources: [${c.verificationSources.join(", ")}]`,
    );
  }
  lines.push("");

  lines.push("=== CANDIDATE ===");
  lines.push(`handle: @${profile.handle}`);
  if (profile.name) lines.push(`displayName: ${profile.name}`);
  if (typeof profile.followers === "number") lines.push(`followers: ${profile.followers}`);
  if (typeof profile.following === "number") lines.push(`following: ${profile.following}`);
  if (profile.bio) {
    lines.push("bio:");
    lines.push(profile.bio);
  }
  if (profile.bioLinks.length > 0) {
    lines.push(`bioLinks: ${profile.bioLinks.join(" | ")}`);
  }
  if (bioLinkExcerpt && bioLinkExcerpt.trim().length > 0) {
    lines.push("");
    lines.push("=== BIO LINK PAGE (excerpt) ===");
    lines.push(bioLinkExcerpt.slice(0, 4000));
  }

  if (profile.pinnedTweet) {
    lines.push("");
    lines.push("=== PINNED TWEET ===");
    lines.push(formatTweet(profile.pinnedTweet));
  }

  lines.push("");
  lines.push("=== RECENT TWEETS ===");
  if (profile.recentTweets.length === 0) {
    lines.push("(none)");
  } else {
    for (const t of profile.recentTweets) {
      lines.push(formatTweet(t));
    }
  }

  lines.push("");
  lines.push(
    "Score the candidate against each criterion. Return JSON only with criteriaResults array, one entry per criterion id, in the same order as the rubric.",
  );

  return lines.join("\n");
}

function formatTweet(t: { id: string; text: string; createdAt?: string; likes?: number; retweets?: number }): string {
  const meta: string[] = [];
  if (t.createdAt) meta.push(t.createdAt);
  if (typeof t.likes === "number") meta.push(`${t.likes} likes`);
  if (typeof t.retweets === "number") meta.push(`${t.retweets} RTs`);
  const metaStr = meta.length > 0 ? ` [${meta.join(" | ")}]` : "";
  // Trim very long tweets - calibration scoring rarely needs >500 chars per tweet.
  const text = t.text.length > 500 ? t.text.slice(0, 500) + "..." : t.text;
  return `id=${t.id}${metaStr}\n  ${text.replace(/\n/g, " ")}`;
}
