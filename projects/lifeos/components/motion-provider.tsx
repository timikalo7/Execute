// Honors the OS "reduce motion" setting across every Framer Motion surface at
// once. With reducedMotion="user", transform/layout animations are dropped for
// users who ask for less motion, while opacity reveals still resolve to their
// visible end state — so nothing stays hidden. Canonical accessibility rule.
"use client";

import { MotionConfig } from "framer-motion";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
