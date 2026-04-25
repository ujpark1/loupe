"use client";

import type { ReactNode } from "react";

export type TabSpec = {
  id: string;
  label: ReactNode;
  count?: number;
};

type Props = {
  tabs: TabSpec[];
  active: string;
  onChange: (id: string) => void;
};

export function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div role="tablist" className="flex border-b border-zinc-800">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
              isActive
                ? "border-amber-400 text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-mono ${
                  isActive
                    ? "bg-amber-400/15 text-amber-300"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
