"use client";

import {
  Gauge,
  Scale,
  Layers,
  RefreshCw,
  Brain,
  Target,
} from "lucide-react";
import { BentoGrid, BentoTile } from "@/components/ui21/bento";
import { AnimatedNumber } from "@/components/ui21/animated-number";
import { ShinyText } from "@/components/reactbits/shiny-text";

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-section px-5 py-24 sm:px-8">
      <div className="mb-12 max-w-2xl">
        <p className="eyebrow mb-4">What's inside</p>
        <h2 className="font-display text-[2.2rem] font-semibold leading-tight text-head sm:text-[2.9rem]">
          Six engines, one loop.
        </h2>
      </div>

      <BentoGrid>
        {/* big: daily engine */}
        <BentoTile span={8} index={0} className="min-h-[260px]">
          <div className="flex h-full flex-col justify-between">
            <div>
              <Gauge className="h-6 w-6 text-amber" />
              <h3 className="mt-4 font-display text-2xl font-light text-head">
                The Daily Engine
              </h3>
              <p className="mt-2 max-w-md text-[0.97rem] text-muted">
                Goals, systems, calendar, and constraints in — top priorities,
                focus blocks, and review points out. Every task ranked by
                leverage so you always know the next right move.
              </p>
            </div>
            <div className="mt-6 flex items-end gap-8">
              <Metric value={3} suffix="x" label="more done on day one" />
              <Metric value={94} suffix="" label="avg leverage on top task" />
              <Metric value={6} suffix=" steps" label="to your first plan" />
            </div>
          </div>
        </BentoTile>

        {/* decision engine */}
        <BentoTile span={4} index={1} className="min-h-[260px]">
          <Brain className="h-6 w-6 text-sage" />
          <h3 className="mt-4 font-display text-xl font-light text-head">
            Decision Engine
          </h3>
          <p className="mt-2 text-[0.92rem] text-muted">
            Score any choice against values, vision, impact, ROI, urgency,
            reversibility, and risk. Act on leverage, not noise.
          </p>
        </BentoTile>

        {/* domain balance */}
        <BentoTile span={4} index={2}>
          <Scale className="h-6 w-6 text-amber" />
          <h3 className="mt-4 font-display text-xl font-light text-head">
            Domain Balance
          </h3>
          <p className="mt-2 text-[0.92rem] text-muted">
            Health, Career, Relationships, Finance — kept in view so one win
            never quietly costs you another.
          </p>
        </BentoTile>

        {/* systems */}
        <BentoTile span={4} index={3}>
          <Layers className="h-6 w-6 text-sage" />
          <h3 className="mt-4 font-display text-xl font-light text-head">
            Systems &amp; Playbooks
          </h3>
          <p className="mt-2 text-[0.92rem] text-muted">
            Turn goals into repeatable processes and reusable playbooks. Wishes
            become machinery.
          </p>
        </BentoTile>

        {/* reviews */}
        <BentoTile span={4} index={4}>
          <RefreshCw className="h-6 w-6 text-amber" />
          <h3 className="mt-4 font-display text-xl font-light text-head">
            Weekly &amp; Monthly Reviews
          </h3>
          <p className="mt-2 text-[0.92rem] text-muted">
            Capture → Distill → Decide → Measure → Reflect → Improve. The loop
            that compounds.
          </p>
        </BentoTile>

        {/* AI layer — full width */}
        <BentoTile span={12} index={5}>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <Target className="mt-1 h-6 w-6 shrink-0 text-amber" />
              <div>
                <h3 className="font-display text-xl font-light text-head">
                  <ShinyText text="The AI Reasoning Layer" />
                </h3>
                <p className="mt-1 max-w-xl text-[0.92rem] text-muted">
                  It sees your whole context — identity, values, goals, systems,
                  constraints — and reasons with you. Not generic advice. Your
                  decisions, sharpened.
                </p>
              </div>
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

function Metric({
  value,
  suffix,
  label,
}: {
  value: number;
  suffix: string;
  label: string;
}) {
  return (
    <div>
      <div className="font-display text-3xl font-light text-amber">
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      <div className="mt-1 max-w-[7rem] font-mono text-[0.62rem] uppercase leading-tight tracking-wider text-faint">
        {label}
      </div>
    </div>
  );
}
