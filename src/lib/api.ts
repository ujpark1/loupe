"use client";

import type {
  CalibrationTestRequest,
  CalibrationTestResponse,
  GenerateCriteriaRequest,
  GenerateCriteriaResponse,
  Rubric,
  RunEvent,
  RunRequest,
} from "./types";

// ---------------------------------------------------------------------------
// Thin typed wrappers around the API routes.
// All functions throw a normal Error on transport / 4xx / 5xx so callers can
// surface a graceful "backend not ready yet" message.
// ---------------------------------------------------------------------------

export async function generateCriteria(
  req: GenerateCriteriaRequest,
): Promise<Rubric> {
  const res = await fetch("/api/generate-criteria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Backend not ready yet (404). Try again once the API route is wired up."
        : `generate-criteria failed (${res.status})`,
    );
  }
  const json = (await res.json()) as GenerateCriteriaResponse;
  if (!json.ok) throw new Error(json.error || "generate-criteria failed");
  return json.rubric;
}

export async function calibrationTest(
  req: CalibrationTestRequest,
): Promise<CalibrationTestResponse> {
  const res = await fetch("/api/calibration-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        "Backend not ready yet (404). Try again once the API route is wired up.",
      );
    }
    throw new Error(`calibration-test failed (${res.status})`);
  }
  return (await res.json()) as CalibrationTestResponse;
}

// ---------------------------------------------------------------------------
// streamRun — POSTs to /api/run and parses an SSE-formatted body.
// We don't use EventSource because it doesn't support POST + JSON body.
// Returns { close } so callers can abort.
// ---------------------------------------------------------------------------

export function streamRun(
  req: RunRequest,
  onEvent: (e: RunEvent) => void,
  onError?: (err: Error) => void,
): { close: () => void } {
  const ctrl = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(
          res.status === 404
            ? "Backend not ready yet (404). The /api/run route isn't live."
            : `run failed (${res.status})`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // SSE: events separated by blank lines.
        let idx = buf.indexOf("\n\n");
        while (idx !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          parseAndEmit(block, onEvent);
          idx = buf.indexOf("\n\n");
        }
      }
      if (buf.trim()) parseAndEmit(buf, onEvent);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return { close: () => ctrl.abort() };
}

function parseAndEmit(block: string, onEvent: (e: RunEvent) => void) {
  // Concatenate every "data: ..." line in the block.
  const dataLines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trimStart());
  if (dataLines.length === 0) return;
  const payload = dataLines.join("\n");
  if (!payload || payload === "[DONE]") return;
  try {
    const obj = JSON.parse(payload) as RunEvent;
    onEvent(obj);
  } catch {
    // ignore non-JSON keepalives
  }
}
