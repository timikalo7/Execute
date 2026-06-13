"use client";

import { Marquee } from "@/components/ui21/marquee";

const PRINCIPLES = [
  "Systems outperform motivation",
  "Outcomes over appearances",
  "Measure performance, not effort",
  "Goals without systems are wishes",
  "Distribution before optimization",
  "Higher values win conflicts",
  "What gets measured gets improved",
  "Knowledge → Principle → Playbook → Action",
];

export function Proof() {
  return (
    <section className="border-y border-hairline bg-ink-deep py-6">
      <div className="mx-auto max-w-section">
        <Marquee
          items={PRINCIPLES.map((p) => (
            <span
              key={p}
              className="flex items-center gap-3.5 font-mono text-[0.82rem] tracking-tight text-muted"
            >
              <span className="h-1 w-1 rounded-full bg-amber/70" aria-hidden /> {p}
            </span>
          ))}
        />
      </div>
    </section>
  );
}
