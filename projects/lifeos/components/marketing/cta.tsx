"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/base/button";
import { Magnetic } from "@/components/ui21/magnetic";

export function CTA() {
  return (
    <section className="relative overflow-hidden bg-ink-deep py-32">
      <div className="grid-field pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <h2 className="font-display text-[2.8rem] font-light leading-[1.02] tracking-[-0.02em] text-head sm:text-[4rem]">
          Your next day is
          <span className="block font-normal text-amber">already designed.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[44ch] text-[1.08rem] leading-[1.7] text-muted">
          Walk the real onboarding, watch your plan compile, and open your
          dashboard — all before you decide anything.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <Link href="/demo">
              <Button size="lg">
                Build your LifeOS <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Magnetic>
          <Link href="/sign-up">
            <Button size="lg" variant="secondary">
              Create free account
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
