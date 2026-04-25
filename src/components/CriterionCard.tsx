"use client";

import { useEffect, useRef } from "react";
import type { Criterion, VerificationSource } from "@/lib/types";

type Props = {
  criterion: Criterion;
  index: number;
  onChange: (next: Criterion) => void;
  onRemove: () => void;
};

const SOURCE_LABELS: Record<VerificationSource, string> = {
  twitter: "twitter",
  "personal-site": "personal site",
  github: "github",
  "semantic-scholar": "semantic scholar",
  "web-search": "web search",
  "company-page": "company page",
  wikipedia: "wikipedia",
};

export function CriterionCard({ criterion, index, onChange, onRemove }: Props) {
  const descRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow textarea when description changes.
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [criterion.description]);

  const commit = (patch: Partial<Criterion>) =>
    onChange({ ...criterion, ...patch });

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-500">
            <span>Criterion {index + 1}</span>
            <span aria-hidden>·</span>
            <span>{criterion.id}</span>
          </div>
          <input
            type="text"
            value={criterion.label}
            onChange={(e) => commit({ label: e.target.value })}
            className="w-full rounded-md border border-transparent bg-transparent px-1 -mx-1 text-lg font-semibold text-zinc-100 hover:border-zinc-800 focus:border-amber-400/60 focus:bg-zinc-950 focus:outline-none"
            aria-label="Criterion label"
          />
          <textarea
            ref={descRef}
            value={criterion.description}
            onChange={(e) => commit({ description: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-md border border-transparent bg-transparent px-1 -mx-1 text-sm leading-relaxed text-zinc-300 hover:border-zinc-800 focus:border-amber-400/60 focus:bg-zinc-950 focus:outline-none"
            aria-label="Criterion description"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove criterion"
          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
        >
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Weight */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <label
            htmlFor={`weight-${criterion.id}`}
            className="font-medium uppercase tracking-wider text-zinc-500"
          >
            Weight
          </label>
          <span className="font-mono text-amber-300">{criterion.weight}</span>
        </div>
        <input
          id={`weight-${criterion.id}`}
          type="range"
          min={0}
          max={50}
          step={1}
          value={criterion.weight}
          onChange={(e) => commit({ weight: Number(e.target.value) })}
          className="w-full accent-amber-400"
        />
      </div>

      {/* Examples */}
      {criterion.examples.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Example experts
          </div>
          <div className="flex flex-wrap gap-2">
            {criterion.examples.map((handle) => (
              <a
                key={handle}
                href={`https://x.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-xs text-zinc-300 hover:border-amber-400/60 hover:text-amber-300"
              >
                @{handle}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Verification sources */}
      {criterion.verificationSources.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="font-medium uppercase tracking-wider">Verified via</span>
          {criterion.verificationSources.map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>·</span> : null}
              <span className="font-mono text-zinc-400">{SOURCE_LABELS[s]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
