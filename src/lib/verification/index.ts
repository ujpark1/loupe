// Verification entry point. Runs the per-candidate pipeline:
//   1. fetchProfile (Apify)
//   2-6. biolinks / webSearch / github / scholar / companyPages in parallel
//   7. crossReference (LLM) merges the evidence into CriterionResult[]
//
// Step 1 throws if Apify returns nothing — caller handles via try/catch.
// Steps 2-6 all swallow their own errors and return empty/null.

import { fetchBioLinks, type BioLinkResult } from "@/lib/verification/biolinks";
import { scanCompanyPages, type CompanyHit } from "@/lib/verification/companypage";
import { crossReference, type EvidenceBundle } from "@/lib/verification/crossref";
import { findGithubUser, type GithubProbe } from "@/lib/verification/github";
import { findScholarAuthor, type ScholarAuthor } from "@/lib/verification/scholar";
import { fetchProfile } from "@/lib/verification/twitter";
import { searchWeb, type WebSearchResult } from "@/lib/verification/websearch";
import type { CandidateProfile, CriterionResult, Rubric } from "@/lib/types";

export type VerifyResult = {
  profile: CandidateProfile;
  results: CriterionResult[];
  evidence: EvidenceBundle;
};

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

/**
 * Top-level: take a profile we've already fetched and run steps 2-7. Use this
 * when the orchestrator wants to fetch the profile separately (e.g. so it can
 * apply a heuristic before deciding full vs light verification).
 */
export async function verifyProfile(
  profile: CandidateProfile,
  rubric: Rubric,
): Promise<VerifyResult> {
  const bioLinksP: Promise<BioLinkResult[]> = safe(
    fetchBioLinks(profile.bioLinks),
    [] as BioLinkResult[],
  );
  const webSearchP: Promise<WebSearchResult[]> = safe(
    searchWeb(profile.handle, profile.name, rubric.topic),
    [] as WebSearchResult[],
  );
  const githubP: Promise<GithubProbe | null> = safe(
    findGithubUser(profile.handle, profile.name),
    null,
  );
  const scholarP: Promise<ScholarAuthor | null> = safe(
    findScholarAuthor(profile.name),
    null,
  );
  const companyP: Promise<CompanyHit[]> = safe(
    scanCompanyPages(profile.bioLinks, profile.handle, profile.name),
    [] as CompanyHit[],
  );

  const [bioLinks, webSearch, github, scholar, companyHits] = await Promise.all([
    bioLinksP,
    webSearchP,
    githubP,
    scholarP,
    companyP,
  ]);

  const evidence: EvidenceBundle = {
    bioLinks,
    webSearch,
    github,
    scholar,
    companyHits,
  };
  const results = await crossReference(profile, evidence, rubric);
  return { profile, results, evidence };
}

/**
 * Full pipeline including the Apify profile fetch (step 1). Throws when Apify
 * gives back nothing — caller is expected to surface an error event and skip.
 */
export async function verifyCandidate(
  handle: string,
  rubric: Rubric,
): Promise<VerifyResult> {
  const profile = await fetchProfile(handle);
  return verifyProfile(profile, rubric);
}
