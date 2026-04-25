import type { HTMLAttributes, ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

export function Card({
  children,
  padded = true,
  className = "",
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      className={`rounded-xl border border-zinc-800 bg-zinc-900 ${
        padded ? "p-6" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
