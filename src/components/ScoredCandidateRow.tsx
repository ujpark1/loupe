"use client";

import { useState } from "react";
import type {
  Criterion,
  CriterionResult,
  Rubric,
  ScoredCandidate,
  VerificationSource,
} from "@/lib/types";
import { VerificationStrengthDot } from "./VerificationStrengthDot";

type Props = {
  candidate: ScoredCandidate;
  rubric: Rubric;
  rank: number;
};

const SOURCE_LABELS: Record<VerificationSource, string> = {
  twitter: "twitter",
  "personal-site": "personal site",
  github: "github",
  "semantic-scholar": "scholar",
  "web-search": "web",
  "company-page": "company",
  wikipedia: "wikipedia",
};

export function ScoredCandidateRow({ candidate, rubric, rank }: Props) {
  const [open, setOpen] = useState(false);
  const handle = candidate.profile.handle;
  const initial = handle.charAt(0).toUpperCase();
  const followers = candidate.profile.followers;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-zinc-900/40 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
      >
        <span className="font-mono text-xs text-zinc-600 tabular-nums w-6 flex-shrink-0">
          {rank.toString().padStart(2, "0")}
        </span>

        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 font-semibold text-zinc-300"
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm text-zinc-100">@{handle}</span>
            {candidate.profile.name ? (
              <span className="truncate text-sm text-zinc-400">
                {candidate.profile.name}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            {typeof followers === "number" ? (
              <span>{formatFollowers(followers)} followers</span>
            ) : null}
            <span>·</span>
            <span>
              {candidate.passCount}/{rubric.criteria.length} criteria
            </span>
            <span>·</span>
            <span className="capitalize">
              {candidate.averageVerificationStrength}
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-1.5 sm:flex">
          {rubric.criteria.map((c) => {
            const r = candidate.criteriaResults.find(
              (x) => x.criterionId === c.id,
            );
            return (
              <VerificationStrengthDot
                key={c.id}
                strength={r?.verificationStrength}
                passed={r?.passes}
                title={`${c.label} — ${r?.passes ? r.verificationStrength : "did not pass"}`}
              />
            );
          })}
        </div>

        <div className="flex flex-shrink-0 items-baseline gap-1">
          <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-100">
            {candidate.fitScore}
          </span>
          <span className="text-xs text-zinc-500">/100</span>
        </div>

        <Chevron open={open} />
      </button>

      {open ? (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-5">
          {candidate.profile.bio ? (
            <p className="mb-4 text-sm text-zinc-300">{candidate.profile.bio}</p>
          ) : null}

          <div className="space-y-3">
            {rubric.criteria.map((c) => {
              const r = candidate.criteriaResults.find(
                (x) => x.criterionId === c.id,
              );
              return (
                <CriterionBreakdown
                  key={c.id}
                  criterion={c}
                  result={r}
                  handle={handle}
                />
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={`https://x.com/${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              Open on X
              <ArrowOut />
            </a>
            <a
              href={`https://x.com/intent/follow?screen_name=${handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              Follow on X
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CriterionBreakdown({
  criterion,
  result,
  handle,
}: {
  criterion: Criterion;
  result: CriterionResult | undefined;
  handle: string;
}) {
  const passes = result?.passes ?? false;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${
            passes
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-zinc-800 text-zinc-500"
          }`}
          aria-label={passes ? "Pass" : "Fail"}
        >
          {passes ? "✓" : "✗"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-zinc-100">
              {criterion.label}
            </span>
            <span className="font-mono text-xs text-zinc-500">
              weight {criterion.weight}
            </span>
            {result ? (
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <VerificationStrengthDot
                  strength={result.verificationStrength}
                  passed={result.passes}
                  size="sm"
                />
                <span className="capitalize">{result.verificationStrength}</span>
                <span aria-hidden>·</span>
                <span>{Math.round((result.confidence ?? 0) * 100)}% conf</span>
              </span>
            ) : null}
          </div>
          {result ? (
            <p className="mt-1 text-sm text-zinc-300">{result.rationale}</p>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">No analysis available.</p>
          )}

          {result && result.evidenceTweetIds.length > 0 ? (
            <div className="mt-3 text-xs">
              <span className="font-medium uppercase tracking-wider text-zinc-500">
                Evidence tweets
              </span>
              <div className="mt-1 flex flex-wrap gap-2">
                {result.evidenceTweetIds.map((id) => (
                  <a
                    key={id}
                    href={`https://x.com/${handle}/status/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-zinc-400 hover:border-amber-400/50 hover:text-amber-300"
                  >
                    {id}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {result && result.externalEvidence.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                External evidence
              </span>
              <ul className="space-y-1">
                {result.externalEvidence.map((e, i) => (
                  <li
                    key={`${e.source}-${i}`}
                    className="flex items-start gap-2 text-xs text-zinc-300"
                  >
                    <span className="mt-0.5 inline-block rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                      {SOURCE_LABELS[e.source]}
                    </span>
                    <span className="flex-1">
                      {e.url ? (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-200 underline decoration-zinc-700 underline-offset-2 hover:decoration-amber-400"
                        >
                          {e.note}
                        </a>
                      ) : (
                        <span>{e.note}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`flex-shrink-0 text-zinc-500 transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowOut() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 9l6-6M5 3h4v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
