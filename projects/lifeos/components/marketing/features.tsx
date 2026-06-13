"use client";

import { motion } from "framer-motion";
import { Scale } from "lucide-react";
import { BentoGrid, BentoTile } from "@/components/ui21/bento";

const MINI_BARS = [
  { name: "Health", v: 72 },
  { name: "Career", v: 64 },
  { name: "Relationships", v: 58 },
  { name: "Finance", v: 81 },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-section px-5 py-28 sm:px-8">
      <div className="mb-14 grid items-end gap-6 lg:grid-cols-12">
        <h2 className="font-display text-[2.4rem] font-light leading-[1.05] tracking-[-0.01em] text-head sm:text-[3.2rem] lg:col-span-8">
          Six engines. One loop that compounds.
        </h2>
        <p className="text-[1.02rem] leading-relaxed text-muted lg:col-span-4">
          Each part feeds the next. Capture, distill, decide, execute, measure,
          reflect — then again, sharper.
        </p>
      </div>

      <BentoGrid>
        {/* lead — text-led, with an inline ranked sliver */}
        <BentoTile span={7} index={0} className="min-h-[280px]">
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <h3 className="font-display text-2xl font-light text-head">
                The Daily Engine
              </h3>
              <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-muted">
                Goals, systems, calendar, and constraints go in. Out comes a
                ranked day: top priorities, focus blocks, review points — every
                task scored by leverage, so the next right move is never in
                question.
              </p>
            </div>
            <div className="space-y-1.5">
              {[95, 88, 74].map((lev, i) => (
                <div key={lev} className="flex items-center gap-2.5">
                  <span
                    className="h-1.5 rounded-full bg-amber"
                    style={{ width: `${lev}%`, opacity: 0.4 + (lev / 100) * 0.6 }}
                  />
                  <span className="font-mono text-[0.62rem] text-faint">{lev}</span>
                </div>
              ))}
            </div>
          </div>
        </BentoTile>

        {/* decision engine — quote-led, no icon */}
        <BentoTile span={5} index={1} className="min-h-[280px]">
          <div className="flex h-full flex-col justify-between">
            <p className="font-display text-[1.5rem] font-light leading-snug text-head">
              “Score the choice, not your mood.”
            </p>
            <div>
              <p className="text-[0.96rem] leading-relaxed text-muted">
                The Decision Engine weighs any option against your values,
                vision, impact, ROI, urgency, reversibility, and risk.
              </p>
              <p className="mt-3 font-mono text-[0.66rem] uppercase tracking-wider text-amber">
                Decision Engine
              </p>
            </div>
          </div>
        </BentoTile>

        {/* domain balance — with a real mini-viz */}
        <BentoTile span={4} index={2}>
          <div className="mb-5 flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber" />
            <h3 className="font-display text-lg font-light text-head">Domain Balance</h3>
          </div>
          <div className="space-y-2.5">
            {MINI_BARS.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[0.82rem] text-body">{d.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                  <motion.span
                    className="block h-full rounded-full bg-sage"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${d.v}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* systems + reviews — paired text tiles, different rhythm */}
        <BentoTile span={4} index={3}>
          <h3 className="font-display text-lg font-light text-head">
            Systems &amp; Playbooks
          </h3>
          <p className="mt-2.5 text-[0.94rem] leading-relaxed text-muted">
            Turn goals into repeatable processes and reusable playbooks. Wishes
            become machinery.
          </p>
        </BentoTile>

        <BentoTile span={4} index={4}>
          <h3 className="font-display text-lg font-light text-head">Reviews</h3>
          <p className="mt-2.5 text-[0.94rem] leading-relaxed text-muted">
            Weekly and monthly loops that adjust the system, not just the
            to-do list.
          </p>
        </BentoTile>

        {/* AI layer — committed full-width strip */}
        <BentoTile span={12} index={5} className="bg-ink-deep">
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div className="max-w-2xl">
              <h3 className="font-display text-xl font-light text-head">
                The reasoning layer sees everything — and reasons with you.
              </h3>
              <p className="mt-2 text-[0.96rem] leading-relaxed text-muted">
                Identity, values, goals, systems, constraints. Not generic
                advice. Your decisions, sharpened against your own context.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-amber/40 px-3 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-amber">
              context-aware
            </span>
          </div>
        </BentoTile>
      </BentoGrid>
    </section>
  );
}
