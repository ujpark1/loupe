"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { CriterionCard } from "@/components/CriterionCard";
import { CalibrationPanel } from "@/components/CalibrationPanel";
import type { Criterion, DomainArchetype, Rubric } from "@/lib/types";
import { generateCriteria } from "@/lib/api";
import { setRubric, useRubric } from "@/lib/store";

const ARCHETYPE_LABEL: Record<DomainArchetype, string> = {
  "academic-research": "academic / research",
  "industry-professional": "industry professional",
  "craft-artistic": "craft / artistic",
  "community-fandom": "community / fandom",
  hybrid: "hybrid",
};

const MAX_CRITERIA = 7;

// Distribute a delta across the OTHER criteria proportionally so the sum stays
// at 100. Returns a new criteria array. Never produces negative weights.
function redistributeAfterChange(
  criteria: Criterion[],
  changedIndex: number,
  newWeight: number,
): Criterion[] {
  const clamped = Math.max(0, Math.min(100, Math.round(newWeight)));
  const others = criteria
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => i !== changedIndex);
  const remaining = 100 - clamped;
  const otherSum = others.reduce((s, { c }) => s + c.weight, 0);

  const next: Criterion[] = criteria.map((c, i) =>
    i === changedIndex ? { ...c, weight: clamped } : { ...c },
  );

  if (others.length === 0) {
    next[changedIndex] = { ...next[changedIndex], weight: 100 };
    return next;
  }

  if (otherSum === 0) {
    const each = Math.floor(remaining / others.length);
    let leftover = remaining - each * others.length;
    for (const { i } of others) {
      next[i] = { ...next[i], weight: each + (leftover > 0 ? 1 : 0) };
      if (leftover > 0) leftover--;
    }
  } else {
    const scale = remaining / otherSum;
    const raw = others.map(({ c, i }) => ({ i, raw: c.weight * scale }));
    let assignedTotal = 0;
    raw.forEach((r, k) => {
      const w = k === raw.length - 1 ? remaining - assignedTotal : Math.round(r.raw);
      next[r.i] = { ...next[r.i], weight: Math.max(0, w) };
      assignedTotal += next[r.i].weight;
    });
  }

  // Final fix-up: ensure exact sum 100 by nudging the largest other.
  const sum = next.reduce((s, c) => s + c.weight, 0);
  if (sum !== 100 && others.length > 0) {
    const diff = 100 - sum;
    let bestI = others[0].i;
    let bestW = next[bestI].weight;
    for (const { i } of others) {
      if (next[i].weight > bestW) {
        bestW = next[i].weight;
        bestI = i;
      }
    }
    next[bestI] = {
      ...next[bestI],
      weight: Math.max(0, next[bestI].weight + diff),
    };
  }
  return next;
}

export default function CriteriaPage() {
  const router = useRouter();
  const [rubric, setRubricState] = useRubric();
  const [showExplanation, setShowExplanation] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // After hydration, redirect home if there's no rubric in the session at all.
  // (Distinguishes "still hydrating" from "really nothing in storage".)
  useEffect(() => {
    if (rubric) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("loupe.rubric")) return;
    router.replace("/");
  }, [rubric, router]);

  const sum = useMemo(
    () => rubric?.criteria.reduce((s, c) => s + c.weight, 0) ?? 0,
    [rubric],
  );

  if (!rubric) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading…
      </main>
    );
  }

  const updateCriterion = (index: number, next: Criterion) => {
    const weightChanged = next.weight !== rubric.criteria[index].weight;
    let nextCriteria: Criterion[];
    if (weightChanged) {
      nextCriteria = redistributeAfterChange(rubric.criteria, index, next.weight);
      // Preserve label/desc edits from `next`
      nextCriteria[index] = {
        ...nextCriteria[index],
        label: next.label,
        description: next.description,
        examples: next.examples,
        verificationSources: next.verificationSources,
      };
    } else {
      nextCriteria = rubric.criteria.map((c, i) => (i === index ? next : c));
    }
    const updated: Rubric = { ...rubric, criteria: nextCriteria };
    setRubricState(updated);
  };

  const removeCriterion = (index: number) => {
    if (rubric.criteria.length <= 1) return;
    const removedWeight = rubric.criteria[index].weight;
    const remaining = rubric.criteria.filter((_, i) => i !== index);
    const otherSum = remaining.reduce((s, c) => s + c.weight, 0);
    let redist: Criterion[];
    if (otherSum === 0) {
      const each = Math.floor(100 / remaining.length);
      let leftover = 100 - each * remaining.length;
      redist = remaining.map((c) => ({
        ...c,
        weight: each + (leftover-- > 0 ? 1 : 0),
      }));
    } else {
      const scale = (otherSum + removedWeight) / otherSum;
      let assigned = 0;
      redist = remaining.map((c, i) => {
        const w =
          i === remaining.length - 1 ? 100 - assigned : Math.round(c.weight * scale);
        assigned += w;
        return { ...c, weight: Math.max(0, w) };
      });
    }
    setRubricState({ ...rubric, criteria: redist });
  };

  const addCriterion = () => {
    if (rubric.criteria.length >= MAX_CRITERIA) return;
    const blank: Criterion = {
      id: `criterion-${Date.now().toString(36)}`,
      label: "New criterion",
      description: "Describe what passing looks like in 1–2 sentences.",
      weight: 0,
      examples: [],
      verificationSources: ["twitter"],
    };
    setRubricState({ ...rubric, criteria: [...rubric.criteria, blank] });
  };

  const onRegenerate = async () => {
    setRegenerating(true);
    setRegenError(null);
    try {
      const fresh = await generateCriteria({
        topic: rubric.topic,
        hint: rubric.hint,
      });
      setRubric(fresh);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRegenerating(false);
    }
  };

  const confirmAndContinue = () => {
    router.push("/run");
  };

  const sumOff = sum !== 100;

  return (
    <main className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-900 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <span className="font-mono text-xs text-zinc-600">step 2 / 4</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Your expert rubric for{" "}
              <span className="text-amber-400">{rubric.topic}</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Edit anything that doesn&apos;t match how you define expertise.
              Weights auto-rebalance to 100.
            </p>
          </div>
          <ArchetypeBadge archetype={rubric.archetype} />
        </div>

        <button
          type="button"
          onClick={() => setShowExplanation((v) => !v)}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none"
        >
          <span>{showExplanation ? "Hide" : "How"} this rubric was built</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden
            className={`transition-transform ${showExplanation ? "rotate-180" : ""}`}
          >
            <path
              d="M2 4l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {showExplanation ? (
          <p className="mt-3 max-w-2xl rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-400">
            We combined credentials, public output, and community signal in
            proportions that fit a{" "}
            <span className="text-zinc-200">
              {ARCHETYPE_LABEL[rubric.archetype]}
            </span>{" "}
            topic. The example handles you see are the AI&apos;s candidates for
            people who clearly pass each criterion — they&apos;ll seed the
            discovery search later. Edit anything that doesn&apos;t match how
            you define expertise.
          </p>
        ) : null}

        {/* Weight summary bar */}
        <div className="mt-8 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-sm">
          <span className="text-zinc-400">Total weight</span>
          <span
            className={`font-mono ${sumOff ? "text-amber-300" : "text-zinc-200"}`}
          >
            {sum} / 100
            {sumOff ? (
              <span className="ml-2 text-xs text-amber-400/80">
                (auto-rebalances on change)
              </span>
            ) : null}
          </span>
        </div>

        {/* Criteria stack */}
        <div className="mt-4 space-y-4">
          {rubric.criteria.map((c, i) => (
            <CriterionCard
              key={c.id}
              criterion={c}
              index={i}
              onChange={(next) => updateCriterion(i, next)}
              onRemove={() => removeCriterion(i)}
            />
          ))}
        </div>

        {rubric.criteria.length < MAX_CRITERIA ? (
          <button
            type="button"
            onClick={addCriterion}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 px-4 py-4 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M7 1.5v11M1.5 7h11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Add criterion ({rubric.criteria.length} / {MAX_CRITERIA})
          </button>
        ) : null}

        {/* Calibration */}
        <div className="mt-10">
          <CalibrationPanel
            rubric={rubric}
            onRegenerate={onRegenerate}
            regenerating={regenerating}
          />
          {regenError ? (
            <p className="mt-2 text-sm text-red-400">{regenError}</p>
          ) : null}
        </div>

        {/* Bottom CTA */}
        <div className="sticky bottom-0 -mx-6 mt-10 border-t border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur sm:-mx-10 sm:px-10">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <p className="text-xs text-zinc-500">
              Confirm to start finding experts that match this rubric.
            </p>
            <Button onClick={confirmAndContinue} size="lg">
              Confirm rubric
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path
                  d="M3 7h8m-3-3l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

function ArchetypeBadge({ archetype }: { archetype: DomainArchetype }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/5 px-3 py-1 text-xs font-medium text-amber-200">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      {ARCHETYPE_LABEL[archetype]}
    </span>
  );
}
