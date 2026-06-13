"use client";

import { motion } from "framer-motion";

const BEATS = [
  {
    t: "You define the shape",
    d: "Six quick steps — identity, values, domains, one goal, one system. Multiple-choice, no essays. Two minutes, tops.",
  },
  {
    t: "It compiles your day",
    d: "The Daily Engine turns those inputs into a ranked, executable plan. The aha lands before you ever create an account.",
  },
  {
    t: "The loop sharpens it",
    d: "Close the day. Weekly and monthly reviews adjust the system itself — so next week runs on better machinery than this one.",
  },
];

export function How() {
  return (
    <section id="how" className="border-y border-hairline bg-ink-deep py-28">
      <div className="mx-auto max-w-section px-5 sm:px-8">
        <h2 className="mb-16 max-w-2xl font-display text-[2.4rem] font-light leading-[1.05] tracking-[-0.01em] text-head sm:text-[3.2rem]">
          From scattered to systematic.
        </h2>

        <div className="relative ml-1 border-l border-hairline-strong pl-8 sm:pl-12">
          {BEATS.map((b, i) => (
            <motion.div
              key={b.t}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative pb-14 last:pb-0"
            >
              <span className="absolute -left-[2.6rem] top-1 h-2.5 w-2.5 rounded-full bg-amber sm:-left-[3.65rem]" />
              <h3 className="font-display text-[1.6rem] font-light text-head sm:text-2xl">
                {b.t}
              </h3>
              <p className="mt-2 max-w-xl text-[1.02rem] leading-[1.7] text-muted">
                {b.d}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
