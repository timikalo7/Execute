// Circular progress ring — today's completion. Animated stroke.
"use client";

import { motion } from "framer-motion";

export function ProgressRing({
  value,
  size = 132,
  stroke = 8,
  label,
  sublabel,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ink-deep)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--amber)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - c * value }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-2xl font-medium tabular-nums text-head">{label}</div>
          {sublabel && (
            <div className="font-mono text-[0.6rem] uppercase tracking-wider text-muted">
              {sublabel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
