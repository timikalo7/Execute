// TIER: Base (shadcn/ui pattern) — ~5%
import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "amber" | "sage" | "live";

const tones: Record<Tone, string> = {
  neutral: "border-hairline-strong text-[var(--text-muted)]",
  amber: "border-amber/40 text-amber bg-amber/[0.06]",
  sage: "border-sage/40 text-sage bg-sage/[0.06]",
  live: "border-sage/50 text-sage",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.14em]",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {tone === "live" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
