"use client";

import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { Badge } from "@/components/base/badge";
import { ImageFrame } from "@/components/aceternity/image-frame";

const TASKS = [
  { lev: 95, title: "Rebuild the onboarding aha-moment", meta: "Deep Work · 90m · Career", on: true },
  { lev: 88, title: "Tempo run — 8km @ 4:55/km", meta: "Body · 50m · Health" },
  { lev: 74, title: "Review weekly active-user funnel", meta: "Review · 30m · Career" },
  { lev: 70, title: "Call Dad", meta: "Connect · 20m · Relationships" },
];

export function TodayPreview() {
  return (
    <div className="relative">
      {/* reserved photographic slot — drop a Higgsfield asset at /public/hero.jpg.
          Renders a deep ink field until then, so the layout holds. */}
      <ImageFrame
        src={undefined}
        alt="Pre-dawn, the day not yet begun"
        caption="05:50 · the day, compiled"
        priority
        className="mb-[-2.5rem] ml-auto aspect-[16/7] w-[78%]"
      />

      {/* the real product surface — border-only, no ghost shadow */}
      <div className="relative rounded-lg border border-hairline-strong bg-ink-raised p-5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--hairline-strong)] to-transparent" />
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-faint">
              Thursday · June 13
            </p>
            <p className="mt-1 font-display text-xl font-light text-head">
              Good morning, Sam.
            </p>
          </div>
          <Badge tone="amber">
            <Flame className="h-3 w-3" /> 12
          </Badge>
        </div>

        <div className="space-y-2">
          {TASKS.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 rounded-md border border-hairline bg-ink px-3.5 py-2.5"
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md font-mono text-[0.66rem] font-semibold text-ink-deep"
                style={{ background: "var(--amber)", opacity: 0.45 + (t.lev / 100) * 0.55 }}
              >
                {t.lev}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.85rem] text-head">{t.title}</p>
                <p className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">
                  {t.meta}
                </p>
              </div>
              {t.on && (
                <span className="ml-auto hidden shrink-0 rounded-full border border-amber/40 px-2 py-0.5 font-mono text-[0.58rem] uppercase tracking-wider text-amber sm:inline">
                  Start here
                </span>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 font-mono text-[0.66rem] text-muted">
          <span>ordered by leverage</span>
          <span className="text-amber">3.2h of focus</span>
        </div>
      </div>
    </div>
  );
}
