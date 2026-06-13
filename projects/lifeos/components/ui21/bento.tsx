// TIER: 21st.dev (adapted) — ~35%
// 12-column bento grid + tiles with a shared cursor-spotlight surface.
"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoTile({
  span = 4,
  className,
  children,
  index = 0,
}: {
  span?: 4 | 5 | 6 | 7 | 8 | 12;
  className?: string;
  children: React.ReactNode;
  index?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState({ x: -300, y: -300, on: false });

  const spanClass: Record<number, string> = {
    4: "lg:col-span-4",
    5: "lg:col-span-5",
    6: "lg:col-span-6",
    7: "lg:col-span-7",
    8: "lg:col-span-8",
    12: "lg:col-span-12",
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setP({ x: e.clientX - r.left, y: e.clientY - r.top, on: true });
      }}
      onMouseLeave={() => setP((s) => ({ ...s, on: false }))}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-hairline bg-[var(--ink-raised)] p-6 transition-colors duration-300 ease-ks hover:border-hairline-strong",
        spanClass[span],
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: p.on ? 0.1 : 0,
          background: `radial-gradient(320px circle at ${p.x}px ${p.y}px, var(--amber), transparent 70%)`,
        }}
        aria-hidden
      />
      <div className="relative h-full">{children}</div>
    </motion.div>
  );
}
