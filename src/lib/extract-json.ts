// Robust JSON extraction from Claude responses.
// Claude often wraps JSON in code fences, prefixes prose, or trails commentary.
// This module tries hard to pull the first valid JSON object/array out.

export class JsonExtractError extends Error {
  raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "JsonExtractError";
    this.raw = raw;
  }
}

/**
 * Pull a JSON object or array out of arbitrary model text. Strategies, in order:
 *   1. Strip a leading triple-backtick code fence (with or without "json" tag).
 *   2. Try JSON.parse on the whole trimmed string.
 *   3. Find the first balanced {...} or [...] block and parse it.
 *
 * Throws JsonExtractError if nothing parses.
 */
export function extractJson<T = unknown>(raw: string): T {
  if (typeof raw !== "string") {
    throw new JsonExtractError("extractJson received non-string input", String(raw));
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new JsonExtractError("extractJson received empty string", raw);
  }

  // Strategy 1: strip code fences.
  const fenced = stripCodeFence(trimmed);
  if (fenced && fenced !== trimmed) {
    try {
      return JSON.parse(fenced) as T;
    } catch {
      // fall through
    }
  }

  // Strategy 2: parse trimmed as-is.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through
  }

  // Strategy 3: walk the string and find the first balanced JSON block.
  const block = findFirstJsonBlock(trimmed);
  if (block !== null) {
    try {
      return JSON.parse(block) as T;
    } catch (err) {
      throw new JsonExtractError(
        `extractJson: found candidate JSON block but it failed to parse: ${(err as Error).message}`,
        raw,
      );
    }
  }

  throw new JsonExtractError("extractJson: no valid JSON object or array found", raw);
}

function stripCodeFence(s: string): string | null {
  const fenceRe = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = s.match(fenceRe);
  if (m && typeof m[1] === "string") return m[1].trim();
  return null;
}

/**
 * Walk the string looking for the first balanced JSON object or array.
 * Respects strings (and escapes within them) so braces inside string literals
 * don't confuse the depth counter.
 */
function findFirstJsonBlock(s: string): string | null {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{" || ch === "[") {
      const end = findMatchingClose(s, i);
      if (end !== -1) {
        return s.slice(i, end + 1);
      }
    }
  }
  return null;
}

function findMatchingClose(s: string, start: number): number {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
