import type { VerificationStrength } from "@/lib/types";

type Props = {
  strength?: VerificationStrength | null;
  passed?: boolean;
  size?: "sm" | "md";
  title?: string;
};

const sizeClasses = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
};

const colorClasses: Record<VerificationStrength, string> = {
  verified: "bg-emerald-500 ring-emerald-500/30",
  indirect: "bg-amber-400 ring-amber-400/30",
  claimed: "bg-red-500 ring-red-500/30",
};

const labelByStrength: Record<VerificationStrength, string> = {
  verified: "Verified by external sources",
  indirect: "Indirect — twitter signal only",
  claimed: "Claimed — self-asserted",
};

export function VerificationStrengthDot({
  strength,
  passed,
  size = "md",
  title,
}: Props) {
  if (passed === false) {
    return (
      <span
        title={title ?? "Did not pass"}
        aria-label={title ?? "Did not pass"}
        className={`inline-block rounded-full bg-zinc-700 ${sizeClasses[size]}`}
      />
    );
  }

  const s = strength ?? "claimed";
  return (
    <span
      title={title ?? labelByStrength[s]}
      aria-label={title ?? labelByStrength[s]}
      className={`inline-block rounded-full ring-2 ${colorClasses[s]} ${sizeClasses[size]}`}
    />
  );
}
