"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/base/button";
import { Magnetic } from "@/components/ui21/magnetic";
import { ClickSpark } from "@/components/reactbits/click-spark";
import { SplitText } from "@/components/reactbits/split-text";
import { AuroraBackground } from "@/components/aceternity/aurora-background";

export function CTA() {
  return (
    <section className="relative overflow-hidden py-28">
      <AuroraBackground className="absolute inset-0" />
      <div className="relative mx-auto max-w-2xl px-5 text-center">
        <h2 className="font-display text-[2.6rem] font-light leading-[1.05] text-head sm:text-[3.6rem]">
          <SplitText text="Your next day is" />
          <span className="block italic text-amber">already designed.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-md text-[1.02rem] text-muted">
          Walk the real onboarding, watch your plan generate, and open your
          dashboard — all before you decide anything.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <ClickSpark>
            <Magnetic>
              <Link href="/demo">
                <Button size="lg">
                  Build your LifeOS <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Magnetic>
          </ClickSpark>
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
