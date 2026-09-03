"use client";

/**
 * ReceiptPrinter — an order confirmation that PRINTS.
 *
 * Port of `demo.html` (open that first; it is the runnable reference). Styling here
 * is deliberately plain CSS in a <style> tag rather than Tailwind, so it drops into
 * any project and is then adapted to that project's tokens — the UI-library ratio and
 * `owner-design-taste` still govern the surrounding page.
 *
 * The rules that are NOT cosmetic (see SKILL.md for why each one is here):
 *   1. `status` must come from the PAYMENT PROCESSOR, never a timer. Printing a
 *      receipt for a charge that has not settled is fraud-shaped, not delightful.
 *   2. The receipt is semantic TEXT. Not canvas, not an image. It has to be
 *      selectable, screen-readable, translatable and printable.
 *   3. `cardLast4` is the last four the processor returns. Never a PAN, never
 *      anything you had to store to know.
 *   4. It must also exist as a PAGE (order history / emailed receipt). An
 *      animation that plays once is not a record.
 */
import { useEffect, useRef, useState } from "react";

export type ReceiptLine = { label: string; sub?: string; amount: string };

export type ReceiptProps = {
  /** Drive this from the processor's confirmation, not from a setTimeout. */
  status: "processing" | "complete";
  planName: string;
  planSub?: string;
  total: string;
  lines: ReceiptLine[];
  subtotal?: string;
  tax?: string;
  orderId: string;
  /** Last four digits only. */
  cardBrand?: string;
  cardLast4?: string;
  dateLabel: string;
  /** A permanent URL for this receipt. Required — see rule 4. */
  receiptHref: string;
  mark?: React.ReactNode;
};

export function ReceiptPrinter(props: ReceiptProps) {
  const paper = useRef<HTMLElement>(null);
  const [paperH, setPaperH] = useState(0);
  const done = props.status === "complete";

  // Measure the paper so the slot opens to its real height. A hard-coded height
  // clips a long receipt and leaves a gap under a short one. Re-measured on resize
  // because the line items wrap differently at different widths.
  useEffect(() => {
    const measure = () => setPaperH(paper.current ? paper.current.offsetHeight + 12 : 0);
    measure();
    const ro = new ResizeObserver(measure);
    if (paper.current) ro.observe(paper.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="rp">
      <style>{CSS}</style>

      <div className={`rp__card${done ? " is-done" : ""}`}>
        <div className="rp__head">
          <div>
            <div className="rp__title">{props.planName}</div>
            {props.planSub && <div className="rp__sub">{props.planSub}</div>}
          </div>
          <div>
            <div className="rp__sub">Total</div>
            <div className="rp__total">{props.total}</div>
          </div>
        </div>
        {/* role=status announces the change once, without stealing focus. */}
        <p className="rp__status" role="status">
          <span className="rp__dot" aria-hidden="true" />
          {done ? "Order complete" : "Processing your order"}
        </p>
      </div>

      <div className="rp__slot" style={{ height: done ? paperH : 0 }}>
        <div className="rp__wrap" style={{ transform: done ? "translateY(0)" : "translateY(-100%)" }}>
          <article className="rp__paper" ref={paper} aria-label={`Receipt for order ${props.orderId}`}>
            {props.mark && <div className="rp__mark" aria-hidden="true">{props.mark}</div>}

            {props.lines.map((l) => (
              <div key={l.label}>
                <div className="rp__row"><span>{l.label}</span><span>{l.amount}</span></div>
                {l.sub && <div className="rp__row rp__faint"><span>{l.sub}</span><span /></div>}
              </div>
            ))}

            {(props.subtotal || props.tax) && <hr className="rp__rule" />}
            {props.subtotal && <div className="rp__row rp__faint"><span>Subtotal</span><span>{props.subtotal}</span></div>}
            {props.tax && <div className="rp__row rp__faint"><span>Tax</span><span>{props.tax}</span></div>}

            <hr className="rp__rule" />
            <div className="rp__row rp__totalrow"><span>TOTAL PAID</span><span>{props.total}</span></div>
            <hr className="rp__rule" />

            <div className="rp__row rp__meta"><span className="rp__faint">Order</span><span>{props.orderId}</span></div>
            {props.cardLast4 && (
              <div className="rp__row rp__meta">
                <span className="rp__faint">Paid with</span>
                <span>{props.cardBrand} •••• {props.cardLast4}</span>
              </div>
            )}
            <div className="rp__row rp__meta"><span className="rp__faint">Date</span><span>{props.dateLabel}</span></div>

            {/* Decorative only — it encodes nothing, so it is hidden rather than
                pretending to be a scannable code. */}
            <div className="rp__barcode" aria-hidden="true" />
            <div className="rp__barcodeno rp__faint" aria-hidden="true">{props.orderId}</div>

            {/* Rule 4: the record outlives the animation. */}
            <a className="rp__permalink" href={props.receiptHref}>View or download this receipt</a>
          </article>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.rp { width: min(420px, 100%); }
.rp__card { background:#17171a; border:1px solid #2a2a30; border-radius:16px; padding:14px; color:#f2f2f4;
  font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; }
.rp__head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.rp__title { font-weight:600; }
.rp__sub { color:#9a9aa4; font-size:13px; }
.rp__total { font-size:20px; font-weight:600; text-align:right; }
.rp__status { display:flex; align-items:center; gap:8px; margin:14px 0 0; font-size:14px; color:#9a9aa4; }
.rp__dot { width:14px; height:14px; border-radius:50%; border:2px solid #9a9aa4; border-top-color:transparent;
  animation: rp-spin .8s linear infinite; }
@keyframes rp-spin { to { transform: rotate(360deg); } }
.rp__card.is-done .rp__dot { animation:none; border:0; background:#4ade80; }
.rp__card.is-done .rp__status { color:#f2f2f4; }

/* overflow:hidden on a growing box is what makes the paper emerge from INSIDE
   the card rather than slide in from off-screen. */
.rp__slot { overflow:hidden; transition: height 1500ms cubic-bezier(.22,.61,.36,1); }
.rp__wrap { margin:0 10px; filter: drop-shadow(0 18px 34px rgba(0,0,0,.45));
  transition: transform 1500ms cubic-bezier(.22,.61,.36,1); }
.rp__paper { --tear:9px; position:relative; padding:20px 18px calc(26px + var(--tear));
  background:#fbfbf9; color:#1a1a1c; font-family: ui-monospace, Menlo, Consolas, monospace; font-size:12px;
  -webkit-mask: linear-gradient(#000 0 0) top/100% calc(100% - var(--tear)) no-repeat,
    conic-gradient(from -45deg at bottom,#0000 0 90deg,#000 0) bottom/14px var(--tear) repeat-x;
  mask: linear-gradient(#000 0 0) top/100% calc(100% - var(--tear)) no-repeat,
    conic-gradient(from -45deg at bottom,#0000 0 90deg,#000 0) bottom/14px var(--tear) repeat-x; }
.rp__mark { width:26px; height:26px; background:#1a1a1c; color:#fbfbf9; display:grid; place-items:center;
  margin:0 auto 16px; font-size:13px; }
.rp__rule { border:0; border-top:1px dashed #cfcfd2; margin:12px 0; }
.rp__row { display:flex; justify-content:space-between; gap:12px; }
.rp__row + .rp__row { margin-top:5px; }
.rp__faint { color:#8b8b90; }
.rp__totalrow { font-weight:700; font-size:14px; }
.rp__meta { font-size:10.5px; }
.rp__barcode { margin-top:16px; height:42px; width:100%;
  background: repeating-linear-gradient(90deg,#1a1a1c 0 2px,transparent 2px 4px,#1a1a1c 4px 5px,transparent 5px 9px,#1a1a1c 9px 12px,transparent 12px 14px); }
.rp__barcodeno { text-align:center; letter-spacing:.2em; font-size:10px; margin-top:5px; }
.rp__permalink { display:block; margin-top:14px; text-align:center; font-size:10.5px; color:#1a1a1c; }

@media print {
  .rp__card { display:none; }
  .rp__slot { height:auto !important; overflow:visible; }
  .rp__wrap { transform:none !important; filter:none; margin:0; }
}
@media (prefers-reduced-motion: reduce) {
  .rp__slot, .rp__wrap { transition:none !important; }
  .rp__dot { animation:none !important; }
}
`;
