"use client";

import { useState } from "react";
import type {
  CalibrationTestResponse,
  Criterion,
  Rubric,
} from "@/lib/types";
import { calibrationTest } from "@/lib/api";
import { Button } from "./Button";
import { VerificationStrengthDot } from "./VerificationStrengthDot";

type Props = {
  rubric: Rubric;
  onRegenerate: () => void;
  regenerating?: boolean;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; data: Extract<CalibrationTestResponse, { ok: true }> };

export function CalibrationPanel({ rubric, onRegenerate, regenerating }: Props) {
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = handle.replace(/^@/, "").trim();
    if (!cleaned) return;
    setState({ kind: "loading" });
    try {
      const res = await calibrationTest({ handle: cleaned, rubric });
      if (!res.ok) {
        setState({ kind: "error", message: res.error });
        return;
      }
      setState({ kind: "result", data: res });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const result = state.kind === "result" ? state.data : null;
  const total = rubric.criteria.length;
  const passRatio = result ? result.passCount / total : 1;
  const tooStrict = result !== null && total > 0 && passRatio < 0.6;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100">
            Test your rubric
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Name a gold-standard expert in this topic. If they don&apos;t pass
            most of these criteria, the rubric is probably miscalibrated.
          </p>
        </div>
        <span className="hidden text-xs font-mono uppercase tracking-wider text-zinc-600 sm:block">
          Calibration
        </span>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-zinc-500">
            @
          </span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="x_handle_without_at"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2.5 pl-8 pr-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none"
            aria-label="Gold-standard X handle"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          loading={state.kind === "loading"}
          disabled={!handle.trim()}
        >
          Run test
        </Button>
      </form>

      {state.kind === "error" ? (
        <p className="mt-3 text-sm text-red-400">{state.message}</p>
      ) : null}

      {result ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <div className="text-sm text-zinc-400">
                <span className="font-mono text-zinc-200">@{result.handle}</span>
                {result.profile.name ? (
                  <span className="text-zinc-500"> · {result.profile.name}</span>
                ) : null}
              </div>
              <div className="mt-0.5 text-base text-zinc-100">
                Passes{" "}
                <span className="font-mono text-amber-300">
                  {result.passCount}/{total}
                </span>{" "}
                criteria
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-3xl font-semibold tabular-nums text-zinc-100">
                {result.fitScore}
              </div>
              <div className="text-xs text-zinc-500">fit score</div>
            </div>
          </div>

          <ul className="space-y-2">
            {rubric.criteria.map((c: Criterion) => {
              const r = result.criteriaResults.find(
                (x) => x.criterionId === c.id,
              );
              const passes = r?.passes ?? false;
              return (
                <li
                  key={c.id}
                  className="flex gap-3 rounded-md border border-zinc-800/60 bg-zinc-950/50 p-3"
                >
                  <div className="mt-0.5 flex flex-shrink-0 items-center gap-2">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        passes
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                      aria-label={passes ? "Pass" : "Fail"}
                    >
                      {passes ? "✓" : "✗"}
                    </span>
                    {r ? (
                      <VerificationStrengthDot
                        strength={r.verificationStrength}
                        passed={r.passes}
                        size="sm"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">
                      {c.label}
                    </div>
                    {r ? (
                      <div className="mt-0.5 text-xs text-zinc-400">
                        {r.rationale}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-zinc-600">
                        no result
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {tooStrict ? (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-200">
                This rubric may be too strict — your gold-standard expert only
                matched {result.passCount} of {total} criteria.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={regenerating}
                onClick={onRegenerate}
              >
                Regenerate rubric
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
