import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deepEqual, judge } from "../harness/judge.js";
import { wilson } from "../harness/summarize.js";

const tasks = (JSON.parse(readFileSync(new URL("../tasks/tasks.json", import.meta.url), "utf8")) as { tasks: Array<{ id: string; expected: Record<string, unknown> }> }).tasks;

describe("judge", () => {
  it("passes only on exact equality of every expected key", () => {
    expect(judge({ a: "x", b: [1, 2] }, { a: "x", b: [1, 2], extra: true }).pass).toBe(true);
    expect(judge({ a: "x" }, { a: "x " }).pass).toBe(false);
    expect(judge({ b: [1, 2] }, { b: [2, 1] }).pass).toBe(false);
    expect(judge({ a: 1 }, null).pass).toBe(false);
  });

  it("counts matching keys for partial credit", () => {
    expect(judge({ a: 1, b: 2, c: 3 }, { a: 1, b: 0, c: 3 }).checks).toEqual({ passed: 2, total: 3 });
  });

  it("compares objects regardless of key order, and arrays in order", () => {
    expect(deepEqual({ x: 1, y: { z: [1] } }, { y: { z: [1] }, x: 1 })).toBe(true);
    expect(deepEqual({ x: 1 }, { x: 1, y: undefined })).toBe(false);
  });

  it("has a unique id and a non-empty expected state for every task", () => {
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    for (const t of tasks) expect(Object.keys(t.expected).length).toBeGreaterThan(0);
  });
});

describe("wilson", () => {
  it("gives a 95% interval around the pass rate", () => {
    const [lo, hi] = wilson(30, 36);
    expect(lo).toBeLessThan(30 / 36);
    expect(hi).toBeGreaterThan(30 / 36);
    expect(wilson(0, 0)).toEqual([0, 0]);
  });
});
