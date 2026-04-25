import Link from "next/link";

type Props = {
  size?: number;
  href?: string;
  withWord?: boolean;
};

// A minimal magnifier glyph: circle + handle. SVG-only, no emoji.
export function Logo({ size = 28, href = "/", withWord = true }: Props) {
  const inner = (
    <span className="inline-flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        className="text-amber-400"
      >
        <circle
          cx="11.5"
          cy="11.5"
          r="6.5"
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1="16.5"
          y1="16.5"
          x2="23"
          y2="23"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {withWord ? (
        <span className="font-semibold tracking-tight text-zinc-100">
          Loupe
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400/60"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
