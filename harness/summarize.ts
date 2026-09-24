/**
 * Aggregates results/runs.jsonl into results/summary.json and results/summary.md.
 *
 *   tsx harness/summarize.ts [--in results/runs.jsonl]
 *
 * Score = runs that pass the judge / runs. Partial = the share of `expected` keys that match,
 * averaged over runs. Time is wall-clock from starting the agent to its exit. Tokens are everything
 * the model read or wrote (uncached input + cache reads + cache writes + output). Cost is computed
 * from the tokens with harness/prices.ts; Jev's usage is counted apart and is not in it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jevCostUsd } from "./prices.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const IN = resolve(ROOT, args.includes("--in") ? args[args.indexOf("--in") + 1]! : "results/runs.jsonl");

export interface RunRecord {
  task: string;
  category: string;
  agent: string;
  tools: string;
  rep: number;
  pass: boolean;
  checks: { passed: number; total: number };
  claimed: string;
  falseSuccess: boolean;
  toolCalls: number;
  otherTools: number;
  wallMs: number;
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning: number };
  costUsd: number;
  reportedCostUsd?: number;
  jev: { calls: number; inputTokens: number };
  focusSteals: number;
  timedOut: boolean;
  error?: string;
}

export interface Group {
  agent: string;
  tools: string;
  task?: string;
  runs: number;
  passes: number;
  score: number;
  ci95: [number, number];
  partial: number;
  falseSuccess: number;
  successClaims: number;
  medianSec: number;
  meanSec: number;
  medianToolCalls: number;
  tokens: { total: number; meanPerRun: number; medianPerRun: number; output: number; uncachedInput: number; cacheRead: number; cacheWrite: number };
  costUsd: { total: number; meanPerRun: number; perSuccess: number | null };
  jev: { calls: number; inputTokens: number; costUsd: number };
  focusSteals: number;
  timeouts: number;
  errors: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const tokensOf = (r: RunRecord) => r.usage.input + r.usage.cacheRead + r.usage.cacheWrite + r.usage.output;

/** Wilson score interval for a pass rate. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const r = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [round((c - r) / d), round((c + r) / d)];
}

export function group(rs: RunRecord[], key: { agent: string; tools: string; task?: string }): Group {
  const passes = rs.filter((r) => r.pass).length;
  const cost = sum(rs.map((r) => r.costUsd));
  return {
    ...key,
    runs: rs.length,
    passes,
    score: round(passes / rs.length),
    ci95: wilson(passes, rs.length),
    partial: round(sum(rs.map((r) => r.checks.passed / r.checks.total)) / rs.length),
    falseSuccess: rs.filter((r) => r.falseSuccess).length,
    successClaims: rs.filter((r) => r.claimed === "success").length,
    medianSec: round(median(rs.map((r) => r.wallMs / 1000)), 1),
    meanSec: round(sum(rs.map((r) => r.wallMs / 1000)) / rs.length, 1),
    medianToolCalls: median(rs.map((r) => r.toolCalls)),
    tokens: {
      total: sum(rs.map(tokensOf)),
      meanPerRun: Math.round(sum(rs.map(tokensOf)) / rs.length),
      medianPerRun: median(rs.map(tokensOf)),
      output: sum(rs.map((r) => r.usage.output)),
      uncachedInput: sum(rs.map((r) => r.usage.input)),
      cacheRead: sum(rs.map((r) => r.usage.cacheRead)),
      cacheWrite: sum(rs.map((r) => r.usage.cacheWrite)),
    },
    costUsd: { total: round(cost, 4), meanPerRun: round(cost / rs.length, 4), perSuccess: passes ? round(cost / passes, 4) : null },
    jev: { calls: sum(rs.map((r) => r.jev.calls)), inputTokens: sum(rs.map((r) => r.jev.inputTokens)), costUsd: round(jevCostUsd(sum(rs.map((r) => r.jev.inputTokens))), 4) },
    focusSteals: sum(rs.map((r) => r.focusSteals)),
    timeouts: rs.filter((r) => r.timedOut).length,
    errors: rs.filter((r) => r.error).length,
  };
}

function main(): void {
  const runs = readFileSync(IN, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunRecord);
  const combos = [...new Set(runs.map((r) => `${r.agent}|${r.tools}`))].map((k) => k.split("|") as [string, string]);
  const tasks = [...new Set(runs.map((r) => r.task))];
  const overall = combos.map(([agent, tools]) => group(runs.filter((r) => r.agent === agent && r.tools === tools), { agent, tools }));
  const perTask = tasks.flatMap((task) => combos.map(([agent, tools]) => ({ agent, tools, task, rs: runs.filter((r) => r.agent === agent && r.tools === tools && r.task === task) }))).filter((x) => x.rs.length).map((x) => group(x.rs, x));
  writeFileSync(join(dirname(IN), "summary.json"), `${JSON.stringify({ generatedFrom: IN.replace(`${ROOT}/`, ""), runs: runs.length, overall, perTask }, null, 2)}\n`);

  const row = (g: Group) =>
    `| ${g.task ? `${g.task} · ` : ""}${g.agent} · ${g.tools} | ${g.passes}/${g.runs} (${Math.round(g.score * 100)}%) | ${Math.round(g.partial * 100)}% | ${g.falseSuccess}/${g.successClaims} | ${g.medianSec} | ${g.medianToolCalls} | ${(g.tokens.medianPerRun / 1000).toFixed(1)}k | ${(g.tokens.output / g.runs).toFixed(0)} | $${g.costUsd.meanPerRun.toFixed(3)} | $${g.costUsd.total.toFixed(2)} | ${g.jev.calls} | ${g.focusSteals} |`;
  const head = "| agent · tools | pass | partial | false success / claims | time s (median) | tool calls (median) | tokens/run (median) | output tokens/run (mean) | USD/run | USD total | Jev calls | focus steals |\n|---|---|---|---|---|---|---|---|---|---|---|---|";
  const md = [`# Summary (${runs.length} runs)`, "", "## Overall", "", head, ...overall.map(row), "", "## Per task", "", head, ...perTask.map(row), ""].join("\n");
  writeFileSync(join(dirname(IN), "summary.md"), md);
  process.stdout.write(`${md}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
