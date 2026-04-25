"use client";

import type { RunMode } from "@/lib/types";

export type ProgressPhase = {
  name: string;
  status: "pending" | "active" | "done";
  detail?: string;
};

type Props = {
  mode: RunMode;
  phases: ProgressPhase[];
  candidateCount: number;
  error?: string | null;
};

const MODE_LABEL: Record<RunMode, string> = {
  discover: "Discover",
  follows: "My Follows",
};

export function ProgressDisplay({
  mode,
  phases,
  candidateCount,
  error,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-100">
          {mode === "discover" ? <DiscoverGlyph /> : <MirrorGlyph />}
          {MODE_LABEL[mode]}
        </h3>
        <span className="font-mono text-xs text-zinc-500">
          {candidateCount} candidate{candidateCount === 1 ? "" : "s"} ready
        </span>
      </div>

      <ol className="mt-5 space-y-3">
        {phases.length === 0 ? (
          <li className="text-sm text-zinc-500">Waiting for first event…</li>
        ) : null}
        {phases.map((p, i) => (
          <li key={`${p.name}-${i}`} className="flex items-start gap-3">
            <PhaseGlyph status={p.status} />
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm ${
                  p.status === "done"
                    ? "text-zinc-400"
                    : p.status === "active"
                      ? "text-zinc-100"
                      : "text-zinc-500"
                }`}
              >
                {p.name}
              </div>
              {p.detail ? (
                <div className="mt-0.5 truncate text-xs text-zinc-500">
                  {p.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mt-4 rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function PhaseGlyph({ status }: { status: ProgressPhase["status"] }) {
  if (status === "done") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-xs text-emerald-400"
      >
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span
        aria-hidden="true"
        className="mt-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 inline-block h-2 w-2 rounded-full bg-zinc-700"
    />
  );
}

function DiscoverGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="10.2"
        y1="10.2"
        x2="13.5"
        y2="13.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MirrorGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2"
        width="11"
        height="9"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 14l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
