"use client";

import { motion } from "framer-motion";
import { TextGenerate } from "@/components/aceternity/text-generate";

const CHAIN = [
  { k: "Identity", d: "Who you're becoming" },
  { k: "Values", d: "What wins conflicts" },
  { k: "Goals", d: "Measurable destinations" },
  { k: "Systems", d: "Repeatable processes" },
  { k: "Today", d: "An executable plan" },
];

export function ModelFlow() {
  return (
    <section id="model" className="relative mx-auto max-w-section px-5 py-24 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow mb-4">The model</p>
        <h2 className="font-display text-[2.2rem] font-semibold leading-tight text-head sm:text-[2.9rem]">
          <TextGenerate text="A universal framework. Your personal context." />
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[1rem] text-muted">
          LifeOS isn't a note app. It's a chain that compounds — each link turns
          the one before it into action.
        </p>
      </div>

      <div className="mt-14 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        {CHAIN.map((c, i) => (
          <motion.div
            key={c.k}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 items-center gap-3 md:flex-col"
          >
            <div className="flex w-full flex-1 flex-col rounded-lg border border-hairline bg-ink-raised p-5 text-center">
              <span className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-full border border-amber/40 font-mono text-xs font-semibold text-amber">
                {i + 1}
              </span>
              <span className="font-display text-xl font-light text-head">{c.k}</span>
              <span className="mt-1 text-sm text-muted">{c.d}</span>
            </div>
            {i < CHAIN.length - 1 && (
              <span className="text-amber/50 md:rotate-0">→</span>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
