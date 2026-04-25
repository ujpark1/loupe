import Anthropic from "@anthropic-ai/sdk";
import { ApifyClient } from "apify-client";

let _anthropic: Anthropic | null = null;
let _apify: ApifyClient | null = null;

export function anthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

export function apify(): ApifyClient {
  if (_apify) return _apify;
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is required");
  _apify = new ApifyClient({ token });
  return _apify;
}

export const ANTHROPIC_MODEL = "claude-sonnet-4-6";

export const APIFY_TWEET_SCRAPER = "apidojo~tweet-scraper";
// Apify Twitter search via same actor with searchTerms input.

export function tavilyApiKey(): string | undefined {
  return process.env.TAVILY_API_KEY;
}
