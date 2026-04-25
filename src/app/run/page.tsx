"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import {
  ProgressDisplay,
  type ProgressPhase,
} from "@/components/ProgressDisplay";
import type { RunMode, ScoredCandidate } from "@/lib/types";
import { streamRun } from "@/lib/api";
import {
  setResults,
  setUserHandle as persistUserHandle,
  useRubric,
} from "@/lib/store";

type ModeState = {
  phases: ProgressPhase[];
  candidates: ScoredCandidate[];
  done: boolean;
  error?: string;
};

const EMPTY_PROGRESS: Record<RunMode, ModeState> = {
  discover: { phases: [], candidates: [], done: false },
  follows: { phases: [], candidates: [], done: false },
};

export default function RunPage() {
  const router = useRouter();
  const [rubric] = useRubric();

  const [discover, setDiscoverChecked] = useState(true);
  const [follows, setFollowsChecked] = useState(false);
  const [handle, setHandle] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<RunMode, ModeState>>(EMPTY_PROGRESS);
  const closeRef = useRef<(() => void) | null>(null);
  const navigatedRef = useRef(false);

  // Redirect home if there's no rubric in the session at all (after hydration).
  useEffect(() => {
    if (rubric) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("loupe.rubric")) return;
    router.replace("/");
  }, [rubric, router]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      closeRef.current?.();
    };
  }, []);

  const selectedModes = useMemo(() => {
    const ms: RunMode[] = [];
    if (discover) ms.push("discover");
    if (follows) ms.push("follows");
    return ms;
  }, [discover, follows]);

  // When all selected modes finish, persist results & navigate.
  useEffect(() => {
    if (!running) return;
    if (navigatedRef.current) return;
    if (selectedModes.length === 0) return;
    const allDone = selectedModes.every((m) => progress[m].done);
    if (!allDone) return;
    navigatedRef.current = true;
    setResults({
      discover: discover ? progress.discover.candidates : undefined,
      follows: follows ? progress.follows.candidates : undefined,
    });
    closeRef.current = null;
    router.push("/results");
  }, [progress, selectedModes, running, discover, follows, router]);

  const canSubmit =
    !running &&
    selectedModes.length > 0 &&
    (!follows || handle.replace(/^@/, "").trim().length > 0);

  if (!rubric) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading…
      </main>
    );
  }

  const onRun = () => {
    if (!canSubmit) return;
    const cleanedHandle = handle.replace(/^@/, "").trim();
    persistUserHandle(cleanedHandle);
    navigatedRef.current = false;
    setRunning(true);
    setError(null);
    setProgress({
      discover: { phases: [], candidates: [], done: false },
      follows: { phases: [], candidates: [], done: false },
    });

    const stream = streamRun(
      {
        rubric,
        userHandle: follows ? cleanedHandle : undefined,
        modes: selectedModes,
      },
      (event) => {
        setProgress((prev) => {
          const next = { ...prev };
          const slot = { ...next[event.mode] };
          if (event.type === "phase") {
            const prevPhases = slot.phases.map((p) =>
              p.status === "active" ? { ...p, status: "done" as const } : p,
            );
            slot.phases = [
              ...prevPhases,
              {
                name: event.phase,
                status: "active",
                detail: event.detail,
              },
            ];
          } else if (event.type === "candidate") {
            slot.candidates = [...slot.candidates, event.candidate];
          } else if (event.type === "done") {
            slot.done = true;
            slot.phases = slot.phases.map((p) =>
              p.status === "active" ? { ...p, status: "done" as const } : p,
            );
          } else if (event.type === "error") {
            slot.error = event.message;
          }
          next[event.mode] = slot;
          return next;
        });
      },
      (err) => {
        setError(err.message);
        setRunning(false);
      },
    );
    closeRef.current = stream.close;
  };

  return (
    <main className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-900 px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <span className="font-mono text-xs text-zinc-600">step 3 / 4</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        {!running ? (
          <>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Pick what to score.
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Discover finds new accounts; My Follows scores people you
              already follow against the same rubric.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <ModeCard
                title="Discover"
                description="Find new experts I don't follow yet (uses your rubric across X)."
                glyph={<DiscoverGlyph />}
                checked={discover}
                onToggle={() => setDiscoverChecked((v) => !v)}
              />
              <ModeCard
                title="Score people I follow"
                description="Score my existing follows against this rubric."
                glyph={<MirrorGlyph />}
                checked={follows}
                onToggle={() => setFollowsChecked((v) => !v)}
              />
            </div>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <label className="block text-sm font-medium text-zinc-300">
                Your X handle{" "}
                <span className="font-normal text-zinc-500">
                  (we won&apos;t post anything)
                </span>
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-zinc-500">
                  @
                </span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="your_handle"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={!follows}
                  className="block w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-8 pr-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {follows
                  ? "Required for My Follows mode."
                  : "Only needed if you turn on My Follows."}
              </p>
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <div className="mt-8 flex items-center justify-between gap-4">
              <Button size="lg" onClick={onRun} disabled={!canSubmit}>
                Find experts
              </Button>
              <p className="text-xs text-zinc-500">
                Takes about 30–60 seconds.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Running…
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Scoring against{" "}
              <span className="text-zinc-200">{rubric.topic}</span>. You can
              leave this tab open.
            </p>

            <div
              className={`mt-8 grid gap-4 ${
                selectedModes.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1"
              }`}
            >
              {selectedModes.map((m) => (
                <ProgressDisplay
                  key={m}
                  mode={m}
                  phases={progress[m].phases}
                  candidateCount={progress[m].candidates.length}
                  error={progress[m].error}
                />
              ))}
            </div>

            {error ? (
              <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <div className="mt-6">
              <Button
                variant="secondary"
                onClick={() => {
                  closeRef.current?.();
                  setRunning(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function ModeCard({
  title,
  description,
  glyph,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  glyph: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/60 ${
        checked
          ? "border-amber-400/50 bg-amber-400/[0.04]"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            checked
              ? "bg-amber-400/15 text-amber-300"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {glyph}
        </span>
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-md border ${
            checked
              ? "border-amber-400 bg-amber-400 text-zinc-950"
              : "border-zinc-700 bg-transparent"
          }`}
        >
          {checked ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 5.5L4.5 8L9 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
      </div>
      <div>
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
      </div>
    </button>
  );
}

function DiscoverGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
      <line
        x1="11.5"
        y1="11.5"
        x2="15"
        y2="15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MirrorGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="3"
        y="2.5"
        width="12"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.5 16l3.5-3 3.5 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
