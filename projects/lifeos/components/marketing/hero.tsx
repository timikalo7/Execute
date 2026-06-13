"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/base/button";
import { Magnetic } from "@/components/ui21/magnetic";
import { TodayPreview } from "@/components/marketing/today-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-36 sm:pt-44">
      {/* structural backdrop — fine rule grid, masked. No glow, no grain. */}
      <div className="grid-field pointer-events-none absolute inset-x-0 top-0 h-[70vh]" aria-hidden />

      <div className="relative mx-auto grid max-w-section items-end gap-14 px-5 sm:px-8 lg:grid-cols-12">
        {/* copy — asymmetric, left-weighted */}
        <div className="lg:col-span-6 lg:pb-4">
          <p className="kicker mb-7">An operating system for a deliberate life</p>

          {/* Static, confident headline — no entrance gating, no gradient text. */}
          <h1 className="font-display text-[3.1rem] font-light leading-[0.98] tracking-[-0.025em] text-head sm:text-[4.4rem]">
            Most apps hold
            <br />
            your tasks.
            <span className="mt-2 block font-normal text-head">
              LifeOS runs
              <span className="italic text-amber"> your life.</span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 max-w-[46ch] text-[1.06rem] leading-[1.7] text-muted"
          >
            It takes your identity, values, and goals and compiles them into the
            one thing that matters each morning: a ranked, executable day — and
            the reasoning behind it.
          </motion.p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
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

          <p className="mt-7 font-mono text-xs text-faint">
            No credit card · the aha lands before you sign up
          </p>
        </div>

        {/* product is the visual — the real "today", not a glow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-6"
        >
          <TodayPreview />
        </motion.div>
      </div>
    </section>
  );
}
