/**
 * The only judge of success: the page's final reported state against the task's `expected`, key by
 * key, by deep equality. Nothing is trimmed or normalized, and the agent's own claim is not used.
 */
export interface Verdict {
  pass: boolean;
  /** Keys of `expected` that match exactly, out of all of them. */
  checks: { passed: number; total: number };
  mismatches: string[];
}

export function judge(expected: Record<string, unknown>, actual: unknown): Verdict {
  const got = (actual && typeof actual === "object" ? actual : {}) as Record<string, unknown>;
  const keys = Object.keys(expected);
  const mismatches = keys.filter((k) => !deepEqual(expected[k], got[k])).map((k) => `${k}: expected ${JSON.stringify(expected[k])}, got ${JSON.stringify(got[k])}`);
  return { pass: mismatches.length === 0 && actual != null, checks: { passed: keys.length - mismatches.length, total: keys.length }, mismatches };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
