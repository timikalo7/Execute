// TIER: Aceternity UI (adapted) — ~25%
// Card with a cursor-tracking radial light. Subtle, hairline-first.
"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function SpotlightCard({
  className,
  children,
  tint = "var(--amber)",
}: {
  className?: string;
  children: React.ReactNode;
  tint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -200, y: -200 });
  const [active, setActive] = useState(false);

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-hairline bg-[var(--paper-raised)] transition-colors duration-300 ease-ks hover:border-hairline-strong",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity: active ? 0.12 : 0,
          background: `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, ${tint}, transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}
