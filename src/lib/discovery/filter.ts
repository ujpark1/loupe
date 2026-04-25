// Phase 3: a single LLM pass that drops obviously-irrelevant candidates from
// the unioned candidate pool. We pass only handle/name/bio to keep tokens
// modest. The model returns `{ keep: ["handle", ...] }` and we intersect that
// against the input set to defend against hallucinated handles.

import { claudeJson } from "@/lib/anthropic-helpers";
import type { Rubric } from "@/lib/types";
import type { MiniBio } from "@/lib/apify-helpers";
import { normalizeHandle } from "@/lib/apify-helpers";

const SYSTEM = `You are a research assistant filtering a candidate pool of X (Twitter) accounts for relevance to a topic.

You will receive:
- A topic and a domain archetype.
- A list of criterion labels that describe what "expertise" looks like for this topic.
- A list of candidates with their handle, display name, and bio.

Your job: return ONLY the handles whose bio plausibly matches the topic and archetype. Be liberal — keep any candidate whose bio is even loosely on-topic. Drop only obvious non-matches: politicians, celebrities, fan accounts unrelated to the topic, brand accounts, news bots, NSFW/spam, and anyone with no bio whose handle gives no topical signal.

Return JSON shaped exactly like:
{"keep": ["handle1", "handle2", ...]}

Lowercase all handles. No @ prefix. No prose, no code fences — JSON only.`;

type FilterInput = {
  rubric: Rubric;
  candidates: MiniBio[];
  // Hard cap on returned size; the LLM may over-include and we slice.
  maxKeep: number;
};

type FilterOutput = { keep: string[] };

function userPrompt(input: FilterInput): string {
  const { rubric, candidates, maxKeep } = input;
  const lines: string[] = [];
  lines.push(`Topic: ${rubric.topic}`);
  if (rubric.hint) lines.push(`Hint: ${rubric.hint}`);
  lines.push(`Archetype: ${rubric.archetype}`);
  lines.push(`Criteria:`);
  for (const c of rubric.criteria) {
    lines.push(`  - ${c.label}: ${c.description}`);
  }
  lines.push(``);
  lines.push(`Return up to ${maxKeep} on-topic handles.`);
  lines.push(`Candidates (${candidates.length}):`);
  for (const c of candidates) {
    const bio = (c.bio ?? "").replace(/\s+/g, " ").slice(0, 240);
    const name = c.name ? ` "${c.name.replace(/"/g, "'")}"` : "";
    lines.push(`@${c.handle}${name} :: ${bio || "(no bio)"}`);
  }
  return lines.join("\n");
}

export async function filterCandidates(
  rubric: Rubric,
  candidates: MiniBio[],
  maxKeep = 80,
): Promise<string[]> {
  if (candidates.length === 0) return [];

  // Defensive cap on input size — even at ~250 chars each, 200 candidates is
  // safe within Sonnet's window for a 4k output budget.
  const limited = candidates.slice(0, 200);
  const inputHandles = new Set(limited.map((c) => normalizeHandle(c.handle)));

  let parsed: FilterOutput;
  try {
    const result = await claudeJson<FilterOutput>({
      system: SYSTEM,
      user: userPrompt({ rubric, candidates: limited, maxKeep }),
      maxTokens: 4000,
      thinking: { enabled: false },
    });
    parsed = result.parsed;
  } catch {
    // If the filter LLM fails, keep everyone — the verification pass is the
    // real quality gate.
    return Array.from(inputHandles).slice(0, maxKeep);
  }

  const kept: string[] = [];
  const seen = new Set<string>();
  for (const h of parsed.keep ?? []) {
    const norm = normalizeHandle(h);
    if (!norm || seen.has(norm)) continue;
    if (!inputHandles.has(norm)) continue; // drop hallucinated handles
    seen.add(norm);
    kept.push(norm);
    if (kept.length >= maxKeep) break;
  }
  return kept;
}
