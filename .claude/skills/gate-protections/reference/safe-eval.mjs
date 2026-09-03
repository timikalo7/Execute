/**
 * Protection for `security-gate: eval-usage`.
 *
 * `eval` and `new Function` execute whatever string you hand them with the privileges of
 * the surrounding code. If any part of that string came from outside, so did the code.
 *
 * The real need behind almost every eval is one of three, and none of them requires it.
 */
export class EvalError2 extends Error {
  constructor(reason) { super(reason); this.name = "EvalError"; this.reason = reason; }
}

/** Need 1: "parse this data" → it was always JSON.parse. */
export function parseData(text) {
  try { return JSON.parse(text); }
  catch { throw new EvalError2("not valid JSON — do not fall back to eval"); }
}

/** Need 2: "call the function named in this string" → an allow-listed dispatch table.
 *  The string selects; it never becomes code. */
export function dispatch(name, table) {
  if (!Object.prototype.hasOwnProperty.call(table, name)) throw new EvalError2(`not an allowed action: ${name}`);
  return table[name];
}

/**
 * Need 3: "evaluate this arithmetic expression a user typed" (a calculator field, a
 * spreadsheet cell). A tiny recursive-descent parser over numbers, + - * / % ^ and
 * parentheses. No identifiers, so nothing can reference anything in scope.
 */
export function evalArithmetic(expr) {
  const src = String(expr);
  if (src.length > 200) throw new EvalError2("expression too long");
  const tokens = src.match(/\d+\.?\d*|[+\-*/%^()]|\s+/g) || [];
  if (tokens.join("") !== src) throw new EvalError2("expression contains characters that are not arithmetic");
  const t = tokens.filter((x) => !/^\s+$/.test(x));
  let i = 0;
  const peek = () => t[i];
  const eat = (x) => { if (t[i] !== x) throw new EvalError2(`expected ${x}`); i++; };

  const primary = () => {
    if (peek() === "(") { eat("("); const v = expr2(); eat(")"); return v; }
    if (peek() === "-") { eat("-"); return -primary(); }
    const n = Number(t[i++]);
    if (!Number.isFinite(n)) throw new EvalError2("expected a number");
    return n;
  };
  const power = () => { let a = primary(); if (peek() === "^") { eat("^"); a = a ** power(); } return a; };
  const term = () => {
    let a = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = t[i++]; const b = power();
      if ((op === "/" || op === "%") && b === 0) throw new EvalError2("division by zero");
      a = op === "*" ? a * b : op === "/" ? a / b : a % b;
    }
    return a;
  };
  const expr2 = () => {
    let a = term();
    while (peek() === "+" || peek() === "-") { const op = t[i++]; const b = term(); a = op === "+" ? a + b : a - b; }
    return a;
  };
  const out = expr2();
  if (i !== t.length) throw new EvalError2("trailing input");
  return out;
}
