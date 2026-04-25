// Phase 1 of discovery: gather handles from the rubric's `examples`. Returns
// up to 30 distinct, normalized handles in deterministic order.

import { normalizeHandle } from "@/lib/apify-helpers";
import type { Rubric } from "@/lib/types";

export function seedHandlesFromRubric(rubric: Rubric, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of rubric.criteria) {
    for (const ex of c.examples ?? []) {
      const h = normalizeHandle(ex);
      if (!h || seen.has(h)) continue;
      seen.add(h);
      out.push(h);
      if (out.length >= max) return out;
    }
  }
  return out;
}
