"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    n: "01",
    t: "Define yourself",
    d: "Six quick steps — identity, values, domains, one goal, one system. Multiple-choice, no essays.",
  },
  {
    n: "02",
    t: "Get your day, generated",
    d: "The Daily Engine turns your inputs into a ranked, executable plan. The aha lands before you ever sign up.",
  },
  {
    n: "03",
    t: "Execute, review, compound",
    d: "Close the loop daily. Weekly and monthly reviews adjust the system so next week is sharper than this one.",
  },
];

export function How() {
  return (
    <section id="how" className="border-y border-hairline bg-ink-deep py-24">
      <div className="mx-auto max-w-section px-5 sm:px-8">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow mb-4">How it works</p>
          <h2 className="font-display text-[2.2rem] font-semibold leading-tight text-head sm:text-[2.9rem]">
            From scattered to systematic.
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="bg-ink-raised p-8"
            >
              <span className="font-mono text-sm text-amber">{s.n}</span>
              <h3 className="mt-4 font-display text-xl font-light text-head">{s.t}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
