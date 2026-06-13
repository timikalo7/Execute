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
        <div className="mb-16 grid items-end gap-5 lg:grid-cols-12">
          <h2 className="font-display text-[2.3rem] font-light leading-[1.04] tracking-[-0.015em] text-head sm:text-[3rem] lg:col-span-7">
            From scattered to <span className="italic font-normal">systematic</span>.
          </h2>
          <p className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-faint lg:col-span-5 lg:pb-2 lg:text-right">
            three beats · two minutes · one running system
          </p>
        </div>

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
              {/* the marker grows toward the live end — last beat is the open loop */}
              <span
                className={`absolute top-1.5 rounded-full bg-amber sm:-left-[3.72rem] ${
                  i === BEATS.length - 1
                    ? "-left-[2.72rem] h-3 w-3 ring-4 ring-amber/15"
                    : "-left-[2.6rem] h-2.5 w-2.5"
                }`}
              />
              <h3 className="font-display text-[1.55rem] font-light text-head sm:text-2xl">
                {b.t}
              </h3>
              <p className="mt-2 max-w-xl text-[1.02rem] leading-[1.7] text-muted text-pretty">
                {b.d}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
