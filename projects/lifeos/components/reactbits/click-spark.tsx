// TIER: React Bits (adapted) — ~35%
// Emits a small radial spark burst on click, anywhere it wraps. Amber sparks.
"use client";

import { useCallback, useRef } from "react";

export function ClickSpark({ children }: { children: React.ReactNode }) {
  const layerRef = useRef<HTMLDivElement>(null);

  const spark = useCallback((e: React.MouseEvent) => {
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const s = document.createElement("span");
      const angle = (Math.PI * 2 * i) / count;
      const dist = 16 + Math.random() * 12;
      s.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:4px;height:4px;border-radius:9999px;background:var(--amber);pointer-events:none;transform:translate(-50%,-50%);transition:transform .5s cubic-bezier(0.22,1,0.36,1),opacity .5s;`;
      layer.appendChild(s);
      requestAnimationFrame(() => {
        s.style.transform = `translate(${Math.cos(angle) * dist - 2}px, ${
          Math.sin(angle) * dist - 2
        }px) scale(0.2)`;
        s.style.opacity = "0";
      });
      setTimeout(() => s.remove(), 520);
    }
  }, []);

  return (
    <div ref={layerRef} onClick={spark} className="relative">
      {children}
    </div>
  );
}
