// TIER: Aceternity UI (adapted) — ~25%
// Restrained, warm aurora — amber/sage on ink, very low opacity, slow drift.
// Deliberately NOT the neon-purple AI-glow tell.
"use client";

import { cn } from "@/lib/utils";

export function AuroraBackground({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div
          className="absolute -top-1/3 left-1/4 h-[60vh] w-[60vh] rounded-full opacity-[0.18] blur-[90px] animate-aurora"
          style={{
            background:
              "radial-gradient(circle at center, var(--amber) 0%, transparent 65%)",
            backgroundSize: "200% 200%",
          }}
        />
        <div
          className="absolute top-1/4 right-1/5 h-[50vh] w-[50vh] rounded-full opacity-[0.12] blur-[90px] animate-aurora"
          style={{
            background:
              "radial-gradient(circle at center, var(--sage) 0%, transparent 65%)",
            backgroundSize: "200% 200%",
            animationDelay: "-6s",
          }}
        />
      </div>
      {children}
    </div>
  );
}
