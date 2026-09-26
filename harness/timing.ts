/**
 * Splits each run's wall time into startup, model and tool time from the arrival times the harness stamps on every event.
 *   tsx harness/timing.ts results/speed/baseline.jsonl [more.jsonl...]
 * First call: until the first tool call starts. Tool: from a tool call's start to its end. Model: the rest.
 * Codex streams only: Claude's events are shaped differently and are skipped. Codex runs the calls of one reply one after another,
 * so their spans do not overlap.
 * Turns: model responses that led to a tool call. A call that starts within 500 ms of the previous one's end came out of the same response.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : NaN;
};
const sec = (ms: number) => (ms / 1000).toFixed(1);

for (const file of process.argv.slice(2)) {
  const byAgent = new Map<string, { wall: number[]; start: number[]; tool: number[]; model: number[]; calls: number[]; steps: number[]; pass: number; n: number; tokens: number[] }>();
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.harness !== "codex") continue;
    const stream = join(dirname(file), "raw", `${r.runId}.stream.jsonl`);
    if (!existsSync(stream)) continue;
    const ev = readFileSync(stream, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (ev[0]?._ms === undefined) continue; // recorded before the harness stamped arrival times
    const open = new Map<string, number>();
    let tool = 0;
    let calls = 0;
    let steps = 0;
    let first: number | undefined;
    let lastEnd: number | undefined;
    for (const e of ev) {
      if (e.type === "item.started" && e.item?.type === "mcp_tool_call") {
        open.set(e.item.id, e._ms);
        first ??= e._ms;
        if (lastEnd === undefined || e._ms - lastEnd >= 500) steps++;
      }
      if (e.type === "item.completed" && e.item?.type === "mcp_tool_call" && open.has(e.item.id)) {
        tool += e._ms - open.get(e.item.id)!;
        calls++;
        lastEnd = e._ms;
      }
    }
    const a = byAgent.get(r.agent) ?? { wall: [], start: [], tool: [], model: [], calls: [], steps: [], pass: 0, n: 0, tokens: [] };
    a.wall.push(r.wallMs);
    a.start.push(first ?? 0);
    a.tool.push(tool);
    a.model.push(r.wallMs - tool);
    a.calls.push(calls);
    a.steps.push(steps);
    a.tokens.push(r.usage.input + r.usage.cacheRead + r.usage.cacheWrite + r.usage.output);
    a.pass += r.pass ? 1 : 0;
    a.n++;
    byAgent.set(r.agent, a);
  }
  console.log(`# ${file}`);
  console.log("| agent | pass | wall s | first call s | model s | tool s | calls | turns | tokens k |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const [k, a] of byAgent)
    console.log(`| ${k} | ${a.pass}/${a.n} | ${sec(median(a.wall))} | ${sec(median(a.start))} | ${sec(median(a.model))} | ${sec(median(a.tool))} | ${median(a.calls)} | ${median(a.steps)} | ${Math.round(median(a.tokens) / 1000)} |`);
}
