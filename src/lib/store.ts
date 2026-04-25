"use client";

import { useSyncExternalStore } from "react";
import type { Rubric, ScoredCandidate, RunMode } from "./types";

// ---------------------------------------------------------------------------
// Simple sessionStorage-backed client state.
// React 19: we use `useSyncExternalStore` to subscribe to a tiny pub/sub layered
// on top of sessionStorage. Avoids the "setState in effect" lint warning and
// gives correct SSR snapshots.
// ---------------------------------------------------------------------------

const RUBRIC_KEY = "loupe.rubric";
const RESULTS_KEY = "loupe.results";
const MODES_KEY = "loupe.modes";
const USER_HANDLE_KEY = "loupe.userHandle";

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
// Cache the parsed value so getSnapshot returns referentially-stable results
// across calls until the data actually changes.
const cache = new Map<string, { raw: string | null; parsed: unknown }>();

function subscribe(key: string, fn: Listener) {
  let bucket = listeners.get(key);
  if (!bucket) {
    bucket = new Set();
    listeners.set(key, bucket);
  }
  bucket.add(fn);
  return () => {
    bucket?.delete(fn);
  };
}

function emit(key: string) {
  cache.delete(key);
  listeners.get(key)?.forEach((fn) => fn());
}

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.parsed as T | null;
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  cache.set(key, { raw, parsed });
  return parsed as T | null;
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    if (value === undefined || value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // ignore quota errors
  }
  emit(key);
}

function useStored<T>(key: string, fallback: T): T {
  return useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => (readJSON<T>(key) ?? fallback) as T,
    () => fallback,
  );
}

// ----- Rubric --------------------------------------------------------------

export function getRubric(): Rubric | null {
  return readJSON<Rubric>(RUBRIC_KEY);
}

export function setRubric(r: Rubric | null) {
  writeJSON(RUBRIC_KEY, r);
}

export function useRubric(): [Rubric | null, (r: Rubric | null) => void] {
  const value = useStored<Rubric | null>(RUBRIC_KEY, null);
  return [value, setRubric];
}

// ----- Results -------------------------------------------------------------

export type ResultsBundle = {
  discover?: ScoredCandidate[];
  follows?: ScoredCandidate[];
};

const EMPTY_RESULTS: ResultsBundle = Object.freeze({});

export function getResults(): ResultsBundle {
  return readJSON<ResultsBundle>(RESULTS_KEY) ?? EMPTY_RESULTS;
}

export function setResults(r: ResultsBundle | null) {
  writeJSON(RESULTS_KEY, r);
}

export function useResults(): [ResultsBundle, (r: ResultsBundle | null) => void] {
  const value = useStored<ResultsBundle>(RESULTS_KEY, EMPTY_RESULTS);
  return [value, setResults];
}

// ----- Run preferences (mode + handle) -------------------------------------

const DEFAULT_MODES: RunMode[] = ["discover"];

export function getModes(): RunMode[] {
  return readJSON<RunMode[]>(MODES_KEY) ?? DEFAULT_MODES;
}

export function setModes(m: RunMode[]) {
  writeJSON(MODES_KEY, m);
}

export function getUserHandle(): string {
  return readJSON<string>(USER_HANDLE_KEY) ?? "";
}

export function setUserHandle(h: string) {
  writeJSON(USER_HANDLE_KEY, h);
}
