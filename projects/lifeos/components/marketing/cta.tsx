"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/base/button";
import { Magnetic } from "@/components/ui21/magnetic";
import { CTA_IMAGE } from "@/lib/assets";

export function CTA() {
  return (
    <section className="relative overflow-hidden bg-ink-deep py-32">
      {/* Ambient closing scene. Wired to CTA_IMAGE — a photo drops in later via
          a one-line lib/assets.ts change. Until then the shipped state is a
          deliberate pre-dawn ember wash, not an empty block. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {CTA_IMAGE ? (
          <Image
            src={CTA_IMAGE}
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-40"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 130%, oklch(30% 0.055 62) 0%, transparent 60%)",
            }}
          />
        )}
        <div className="grid-field absolute inset-0 opacity-50" />
        {/* settle into ink so type stays crisp */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 70% at 50% 40%, var(--ink-deep) 30%, transparent 100%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <h2 className="font-display text-[2.8rem] font-light leading-[1.0] tracking-[-0.025em] text-head sm:text-[4.1rem]">
          Your next day is
          <span className="block font-normal italic text-amber">already designed.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[44ch] text-[1.08rem] leading-[1.7] text-muted text-pretty">
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
