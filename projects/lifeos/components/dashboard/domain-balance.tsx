// Domain balance — horizontal bars showing self-assessed health per domain.
"use client";

import { motion } from "framer-motion";
import { Domain, DOMAIN_META } from "@/lib/types";

export function DomainBalance({ domains }: { domains: Domain[] }) {
  return (
    <div className="space-y-3">
      {domains.map((d, i) => (
        <div key={d.key} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm text-body">{d.name}</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-deep">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: DOMAIN_META[d.key].tint }}
              initial={{ width: 0 }}
              animate={{ width: `${d.health}%` }}
              transition={{ delay: i * 0.06, duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-xs text-muted">
            {d.health}
          </span>
        </div>
      ))}
    </div>
  );
}
