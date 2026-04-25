// Step 1 of verification: fetch a CandidateProfile via Apify. Throws on
// "no results" so the orchestrator can record an error event and skip.

import { profileForHandle } from "@/lib/apify-helpers";
import type { CandidateProfile } from "@/lib/types";

export async function fetchProfile(handle: string): Promise<CandidateProfile> {
  const profile = await profileForHandle(handle, 30);
  if (!profile) {
    throw new Error(`apify returned no profile data for @${handle}`);
  }
  return profile;
}
