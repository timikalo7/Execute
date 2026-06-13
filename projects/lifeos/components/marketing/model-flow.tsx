"use client";

import { motion } from "framer-motion";
import { ScrollReveal } from "@/components/reactbits/scroll-reveal";

const CHAIN = ["Identity", "Values", "Goals", "Systems", "Today"];

export function ModelFlow() {
  return (
    <section id="model" className="relative mx-auto max-w-section px-5 py-28 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <h2 className="font-display text-[2.6rem] font-light leading-[1.02] tracking-[-0.02em] text-head sm:text-[3.5rem]">
            It isn’t a notes app.
            <br />
            It’s a <span className="italic font-normal">compiler</span>.
          </h2>
          <ScrollReveal
            text="A universal framework meets your personal context. Each layer turns the one before it into something executable — until what comes out the other end is simply: do this, now, and here's why."
            className="mt-6 max-w-[52ch] text-[1.12rem] leading-[1.7] text-muted"
          />
        </div>

        {/* the chain as an editorial pipeline, not boxed cards */}
        <div className="lg:col-span-5 lg:pt-3">
          <ol className="relative">
            {CHAIN.map((c, i) => {
              const last = i === CHAIN.length - 1;
              // type grows down the chain — each layer carries more weight,
              // ending on the committed ember "Today".
              const size = [
                "text-[1.55rem] sm:text-[1.75rem]",
                "text-[1.7rem] sm:text-[1.95rem]",
                "text-[1.9rem] sm:text-[2.2rem]",
                "text-[2.15rem] sm:text-[2.55rem]",
                "text-[2.7rem] sm:text-[3.3rem]",
              ][i];
              return (
                <motion.li
                  key={c}
                  initial={{ opacity: 0, x: 14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-baseline gap-4 py-1.5"
                >
                  <span
                    className={`font-display leading-none tracking-[-0.02em] ${size} ${
                      last ? "font-normal text-amber" : "font-light text-head"
                    }`}
                  >
                    {c}
                  </span>
                  {!last && (
                    <span className="flex-1 translate-y-[-0.35em] border-b border-dashed border-hairline-strong" />
                  )}
                  {/* the "compiles to" verb stated once, as a legend, not on every row */}
                  {i === 0 && (
                    <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-faint">
                      compiles to
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
