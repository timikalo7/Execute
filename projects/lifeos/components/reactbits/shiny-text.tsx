// TIER: React Bits (adapted) — ~35%
// Text with a slow specular sweep. Warm, not rainbow.
"use client";

import { cn } from "@/lib/utils";

export function ShinyText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block animate-shimmer bg-clip-text text-transparent",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(110deg, var(--text-muted) 35%, var(--amber) 50%, var(--text-muted) 65%)",
        backgroundSize: "200% 100%",
      }}
    >
      {text}
    </span>
  );
}
