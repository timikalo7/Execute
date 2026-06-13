"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/base/button";
import { Magnetic } from "@/components/ui21/magnetic";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto mt-4 flex max-w-section items-center justify-between rounded-full border border-hairline bg-ink-raised/70 px-5 py-2.5 backdrop-blur-md sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-7 md:flex">
          {[
            ["Model", "#model"],
            ["Features", "#features"],
            ["How it works", "#how"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-muted transition-colors hover:text-head"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            href="/sign-in"
            className="hidden text-sm text-muted transition-colors hover:text-head sm:block"
          >
            Sign in
          </Link>
          <Magnetic strength={0.25}>
            <Link href="/demo">
              <Button size="sm">Try the demo</Button>
            </Link>
          </Magnetic>
        </div>
      </div>
    </header>
  );
}
