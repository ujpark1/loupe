"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { Tabs, type TabSpec } from "@/components/Tabs";
import { ScoredCandidateRow } from "@/components/ScoredCandidateRow";
import type { ScoredCandidate, RunMode } from "@/lib/types";
import { strengthRank } from "@/lib/types";
import { useResults, useRubric } from "@/lib/store";

type SortKey = "fit" | "strength";
type LimitKey = "top20" | "all";

export default function ResultsPage() {
  const router = useRouter();
  const [rubric] = useRubric();
  const [results] = useResults();

  const availableModes = useMemo<RunMode[]>(() => {
    const ms: RunMode[] = [];
    if (results.discover) ms.push("discover");
    if (results.follows) ms.push("follows");
    return ms;
  }, [results]);

  // Active tab is computed from availableModes; falls back to "discover" until
  // results hydrate, then is normalized via the user's explicit selection.
  const [tabOverride, setTabOverride] = useState<RunMode | null>(null);
  const activeTab: RunMode =
    tabOverride && availableModes.includes(tabOverride)
      ? tabOverride
      : (availableModes[0] ?? "discover");

  const [limit, setLimit] = useState<LimitKey>("top20");
  const [minPasses, setMinPasses] = useState(0);
  const [sortBy, setSortBy] = useState<SortKey>("fit");

  // Redirect home if there's no rubric in the session at all (after hydration).
  useEffect(() => {
    if (rubric) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("loupe.rubric")) return;
    router.replace("/");
  }, [rubric, router]);

  if (!rubric) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading…
      </main>
    );
  }

  const candidatesForMode = (m: RunMode): ScoredCandidate[] =>
    (m === "discover" ? results.discover : results.follows) ?? [];

  const filterAndSort = (input: ScoredCandidate[]): ScoredCandidate[] => {
    let list = input.filter((c) => c.passCount >= minPasses);
    if (sortBy === "fit") {
      list = [...list].sort((a, b) => b.fitScore - a.fitScore);
    } else {
      list = [...list].sort((a, b) => {
        const sa = strengthRank(a.averageVerificationStrength);
        const sb = strengthRank(b.averageVerificationStrength);
        if (sb !== sa) return sb - sa;
        return b.fitScore - a.fitScore;
      });
    }
    if (limit === "top20") list = list.slice(0, 20);
    return list;
  };

  const showTabs = availableModes.length > 1;

  const tabSpecs: TabSpec[] = availableModes.map((m) => ({
    id: m,
    label: (
      <span className="flex items-center gap-1.5">
        {m === "discover" ? <DiscoverGlyph /> : <MirrorGlyph />}
        {m === "discover" ? "Discover" : "My Follows"}
      </span>
    ),
    count: candidatesForMode(m).length,
  }));

  const visible = filterAndSort(candidatesForMode(activeTab));
  const totalForActive = candidatesForMode(activeTab).length;

  return (
    <main className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-900 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-xs text-zinc-600 sm:inline">
              step 4 / 4
            </span>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              New search
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Experts in{" "}
            <span className="text-amber-400">{rubric.topic}</span>
          </h1>
          <button
            type="button"
            onClick={() => router.push("/criteria")}
            className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-200"
          >
            Edit rubric
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Scored against your {rubric.criteria.length}-criteria rubric. Loupe
          scores public web activity, not absolute expertise.
        </p>

        {showTabs ? (
          <div className="mt-8">
            <Tabs
              tabs={tabSpecs}
              active={activeTab}
              onChange={(id) => setTabOverride(id as RunMode)}
            />
          </div>
        ) : null}

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <ToggleGroup
            value={limit}
            onChange={(v) => setLimit(v as LimitKey)}
            options={[
              { v: "top20", label: "Top 20" },
              { v: "all", label: "All" },
            ]}
          />

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="min-passes" className="text-zinc-400">
              Min criteria passed
            </label>
            <select
              id="min-passes"
              value={minPasses}
              onChange={(e) => setMinPasses(Number(e.target.value))}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none"
            >
              {Array.from({ length: rubric.criteria.length + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "any" : `≥ ${i}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="sort" className="text-zinc-400">
              Sort by
            </label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none"
            >
              <option value="fit">Fit score</option>
              <option value="strength">Verification strength</option>
            </select>
          </div>

          <div className="ml-auto font-mono text-xs text-zinc-500">
            {visible.length} of {totalForActive} shown
          </div>
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-10 text-center">
              <p className="text-base text-zinc-300">
                No candidates passed your filters.
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Loosen the rubric or try a broader topic.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push("/criteria")}
                >
                  Edit rubric
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMinPasses(0);
                    setLimit("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            visible.map((c, i) => (
              <ScoredCandidateRow
                key={c.profile.handle}
                candidate={c}
                rubric={rubric}
                rank={i + 1}
              />
            ))
          )}
        </div>

        {/* Legend */}
        <div className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-400">
          <span className="mr-3 font-medium uppercase tracking-wider text-zinc-500">
            Verification strength
          </span>
          <span className="mr-4 inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30" />
            verified — cross-checked externally
          </span>
          <span className="mr-4 inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
            indirect — twitter signal only
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-500/30" />
            claimed — self-asserted
          </span>
        </div>
      </div>
    </main>
  );
}

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-zinc-700 bg-zinc-950 p-0.5">
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded px-3 py-1 text-sm transition-colors focus:outline-none ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DiscoverGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="8.5"
        y1="8.5"
        x2="11"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MirrorGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2"
        y="1.75"
        width="10"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4 12.5l3-2.5 3 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
