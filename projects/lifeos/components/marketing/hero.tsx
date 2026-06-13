"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Flame } from "lucide-react";
import { Button } from "@/components/base/button";
import { Badge } from "@/components/base/badge";
import { SplitText } from "@/components/reactbits/split-text";
import { GradientText } from "@/components/reactbits/gradient-text";
import { TextGenerate } from "@/components/aceternity/text-generate";
import { DotGrid } from "@/components/reactbits/dot-grid";
import { TiltCard } from "@/components/ui21/tilt-card";
import { Magnetic } from "@/components/ui21/magnetic";

const PREVIEW = [
  { lev: 95, title: "Rebuild the onboarding aha-moment", meta: "Deep Work · 90m · Career" },
  { lev: 88, title: "Tempo run — 8km @ 4:55/km", meta: "Body · 50m · Health" },
  { lev: 74, title: "Review weekly active-user funnel", meta: "Review · 30m · Career" },
  { lev: 70, title: "Call Dad", meta: "Connect · 20m · Relationships" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <DotGrid className="h-full w-full" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber/30 to-transparent" />

      <div className="relative mx-auto grid max-w-section items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* copy */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge tone="amber" className="mb-6">
              The operating system for a deliberate life
            </Badge>
          </motion.div>

          <h1 className="font-display text-[2.9rem] font-light leading-[1.02] tracking-tight text-head sm:text-[4rem]">
            <SplitText text="Stop managing tasks." />
            <span className="mt-1 block">
              Start running{" "}
              <GradientText className="font-normal italic">
                your life.
              </GradientText>
            </span>
          </h1>

          <p className="mt-6 max-w-lg text-[1.05rem] leading-relaxed text-muted">
            <TextGenerate
              text="LifeOS turns your identity, values, and goals into a daily plan you actually execute — a reasoning engine for better decisions and consistent action."
              delay={0.3}
            />
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic>
              <Link href="/demo">
                <Button size="lg">
                  Build yours in 60s <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Magnetic>
            <Link href="/sign-up">
              <Button size="lg" variant="secondary">
                Create free account
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-5 font-mono text-xs text-faint">
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber" /> No credit card
            </span>
            <span>·</span>
            <span>Aha before signup</span>
            <span>·</span>
            <span>Yours in one browser</span>
          </div>
        </div>

        {/* live preview */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <TiltCard max={6}>
            <div className="rounded-lg border border-hairline bg-ink-raised/80 p-5 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="eyebrow">Today · generated</p>
                  <p className="mt-1 font-display text-lg font-light text-head">
                    Good morning, Sam.
                  </p>
                </div>
                <Badge tone="live" dot>
                  12-day streak
                </Badge>
              </div>
              <div className="space-y-2">
                {PREVIEW.map((t, i) => (
                  <motion.div
                    key={t.title}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.12, duration: 0.5 }}
                    className="flex items-center gap-3 rounded-md border border-hairline bg-ink px-3.5 py-2.5"
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md font-mono text-[0.66rem] font-semibold text-ink-deep"
                      style={{ background: "var(--amber)", opacity: 0.4 + (t.lev / 100) * 0.6 }}
                    >
                      {t.lev}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.82rem] text-head">{t.title}</p>
                      <p className="font-mono text-[0.6rem] uppercase tracking-wider text-faint">
                        {t.meta}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3 font-mono text-[0.66rem] text-muted">
                <span>ordered by leverage</span>
                <span className="text-amber">3.2h focused</span>
              </div>
            </div>
          </TiltCard>
        </motion.div>
      </div>
    </section>
  );
}
