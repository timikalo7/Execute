// TIER: Aceternity (adapted) — editorial image frame.
// A real photographic slot with an ink duotone wash + hairline frame and a
// corner caption. Image-ready: drop a Higgsfield asset at `src`.
//
// IMPORTANT: the no-image state is treated as the *shipped* state, not a
// placeholder. When `src` is null it renders a composed "pre-dawn" ink field —
// a low horizon of warm light bleeding up from one corner, a faint window-grid
// cast, and a single ember filament — so the layout reads as intentional art.
// A photo drops in later via a one-line lib/assets.ts change.
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
        <>
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
          {/* ink duotone wash — unifies any photo into the brand */}
          <div
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{ background: "linear-gradient(180deg, transparent 30%, var(--ink-deep) 100%)" }}
            aria-hidden
          />
        </>
      ) : (
        <InkField alt={alt} />
      )}

      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[var(--hairline)]" />
      {caption && (
        <figcaption className="absolute bottom-3 left-4 z-10 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-faint">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* The composed no-image field. Off-centre warm horizon (the desk lamp), a cool
   pre-dawn cast from the opposite top corner, and a faint cast window grid —
   asymmetric on purpose so it never reads as an empty centred placeholder. */
function InkField({ alt }: { alt?: string }) {
  return (
    <div className="absolute inset-0" role="img" aria-label={alt || undefined}>
      {/* deep cool base, pre-dawn */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 90% at 12% 6%, oklch(22% 0.018 250) 0%, transparent 55%), var(--ink-deep)",
        }}
      />
      {/* warm low horizon — the lamp, bleeding up from the right baseline */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 70% at 88% 116%, oklch(34% 0.06 64) 0%, transparent 58%)",
        }}
      />
      {/* faint window-light grid, cast and skewed across the lower third */}
      <div
        className="absolute inset-x-0 bottom-0 h-[58%] opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "38px 30px",
          transform: "perspective(420px) rotateX(58deg)",
          transformOrigin: "bottom",
          maskImage: "linear-gradient(to top, black, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent)",
        }}
      />
      {/* a single ember filament — the one committed warm mark */}
      <div
        className="absolute bottom-0 right-[18%] h-[42%] w-px"
        style={{
          background:
            "linear-gradient(to top, var(--amber) 0%, var(--amber-deep) 30%, transparent 100%)",
          opacity: 0.5,
        }}
      />
      {/* settle the whole thing into ink at the base so captions stay legible */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, transparent 45%, var(--ink-deep) 100%)" }}
      />
    </div>
  );
}
