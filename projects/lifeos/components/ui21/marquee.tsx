// TIER: 21st.dev (adapted) — ~35%
// Seamless marquee with edge fade. Pauses on hover.
"use client";

import { cn } from "@/lib/utils";

export function Marquee({
  items,
  className,
}: {
  items: React.ReactNode[];
  className?: string;
}) {
  const doubled = [...items, ...items];
  return (
    <div
      className={cn(
        "group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10 group-hover:[animation-play-state:paused]">
        {doubled.map((it, i) => (
          <div key={i} className="flex items-center">
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}
