"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/Button";
import { generateCriteria } from "@/lib/api";
import { setRubric } from "@/lib/store";
import { SAMPLE_RUBRIC } from "@/lib/mock";

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const rubric = await generateCriteria({
        topic: topic.trim(),
        hint: hint.trim() || undefined,
      });
      setRubric(rubric);
      router.push("/criteria");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // TODO: dev-only fallback so the rest of the UI is demoable without /api routes.
  const useSample = () => {
    setRubric({
      ...SAMPLE_RUBRIC,
      topic: topic.trim() || SAMPLE_RUBRIC.topic,
      hint: hint.trim() || SAMPLE_RUBRIC.hint,
    });
    router.push("/criteria");
  };

  return (
    <main className="relative flex min-h-screen flex-col bg-zinc-950">
      <header className="px-6 py-5 sm:px-10">
        <Logo />
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16 sm:py-24">
        <div className="w-full max-w-xl">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-100 sm:text-5xl">
            Find experts on X —{" "}
            <span className="text-amber-400">on your terms.</span>
          </h1>
          <p className="mt-4 text-balance text-zinc-400">
            Loupe writes a rubric for any topic, lets you edit it, then finds
            the X accounts that actually meet it — with cited evidence.
          </p>

          <form onSubmit={submit} className="mt-10 space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-zinc-300">
                What expertise do you want to find on X?
              </span>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., AI product design"
                autoFocus
                spellCheck={false}
                className="mt-2 block w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3.5 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-zinc-300">
                Anything to narrow it down?{" "}
                <span className="text-zinc-500">(optional)</span>
              </span>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={2}
                placeholder="e.g., focused on practical builders, not academics"
                className="mt-2 block w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
              />
            </label>

            {error ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={useSample}
                  className="mt-2 text-xs text-red-200 underline underline-offset-2 hover:text-red-100"
                >
                  Continue with sample rubric instead →
                </button>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-4 pt-2">
              <Button
                type="submit"
                size="lg"
                loading={loading}
                disabled={!topic.trim()}
              >
                Generate criteria
              </Button>
              <p className="text-xs text-zinc-500">
                ~15 seconds. Loupe writes a rubric for your topic.
              </p>
            </div>
          </form>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-xs text-zinc-600 sm:px-10">
        Loupe scores public web activity, not absolute expertise.
      </footer>
    </main>
  );
}
