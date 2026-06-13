// TIER: Aceternity (adapted) — editorial image frame.
// A real photographic slot with an ink duotone wash + hairline frame and a
// corner caption. Image-ready: drop a Higgsfield asset at `src`. When no image
// is supplied it renders a deep ink field with the same frame, so layouts hold.
"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function ImageFrame({
  src,
  alt = "",
  caption,
  className,
  priority,
}: {
  src?: string;
  alt?: string;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-lg border border-hairline bg-ink-deep",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 120% at 70% 10%, oklch(24% 0.02 64) 0%, var(--ink-deep) 60%)",
          }}
          aria-hidden
        />
      )}
      {/* ink duotone wash — unifies any photo into the brand */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-multiply"
        style={{ background: "linear-gradient(180deg, transparent 30%, var(--ink-deep) 100%)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[var(--hairline)]" />
      {caption && (
        <figcaption className="absolute bottom-3 left-4 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-faint">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
