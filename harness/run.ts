/**
 * Runs the benchmark. One Chrome window (its own profile, app mode) shows the bench app for the
 * whole session; each run points the page at a task through the server, so Chrome is launched and
 * brought up only once. Every run gets the same prompt, the pid and window id of that window, and
 * one MCP server. Success is decided by judge.ts on the state the page reports, nothing else.
 *
 *   tsx harness/run.ts [--reps N] [--agents opus-5.5,gpt-6-sol] [--tools cua-jev,cua-driver]
 *                      [--only task,task] [--timeout-min 15] [--out results/runs.jsonl]
 *
 * Records are appended to the output file, and a run already recorded there is skipped, so an
 * interrupted bench resumes where it stopped. While the screen is locked, the bench waits.
 */
import { execFile, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type BenchServer } from "../server/server.js";
import { DRIVER, runAgent, type AgentSpec, type ToolSet } from "./agents.js";
import { judge } from "./judge.js";
import { costUsd } from "./prices.js";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = join(ROOT, ".work");
const PROFILE = join(WORK, "chrome-profile");

export const AGENTS: AgentSpec[] = [
  { label: "opus-5.5", harness: "claude", model: "claude-opus-5-5" },
  { label: "gpt-6-astra", harness: "codex", model: "gpt-6-astra" },
  { label: "gpt-6-sol", harness: "codex", model: "gpt-6-sol" },
  { label: "gpt-6-luna", harness: "codex", model: "gpt-6-luna" },
];

interface Task {
  id: string;
  /** The page's document title, which is also its window title. */
  title: string;
  category: string;
  prompt: string;
  expected: Record<string, unknown>;
}

const args = process.argv.slice(2);
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const reps = Number(opt("--reps") ?? 1);
const agentLabels = opt("--agents")?.split(",");
const agents = AGENTS.filter((a) => !agentLabels || agentLabels.includes(a.label));
const toolSets = (opt("--tools")?.split(",") ?? ["cua-jev", "cua-driver"]) as ToolSet[];
const only = opt("--only")?.split(",");
const timeoutMs = Number(opt("--timeout-min") ?? 15) * 60_000;
const OUT = resolve(ROOT, opt("--out") ?? "results/runs.jsonl");
const RAW = join(dirname(OUT), "raw");
const tasks = (JSON.parse(readFileSync(join(ROOT, "tasks/tasks.json"), "utf8")) as { tasks: Task[] }).tasks.filter((t) => !only || only.includes(t.id));

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function driverCall<T>(tool: string, a: Record<string, unknown>): Promise<T> {
  const { stdout } = await run(DRIVER, ["call", tool, JSON.stringify(a)], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

async function frontPid(): Promise<number | undefined> {
  try {
    const asn = (await run("lsappinfo", ["front"])).stdout.trim();
    const { stdout } = await run("lsappinfo", ["info", "-only", "pid", asn]);
    return Number(/"pid"\s*=\s*(\d+)/.exec(stdout)?.[1]) || undefined;
  } catch {
    return undefined;
  }
}

/** The app to hand the front back to: the last one seen in front that is not the bench's Chrome (by pid, as the user's own Chrome shares its bundle id). */
let homePid: number | undefined;

async function noteFront(chrome?: number): Promise<void> {
  const pid = await frontPid();
  if (pid && pid !== chrome) homePid = pid;
}

/** Chrome must start every run in the background; if it is in front, the front goes back home. */
async function handBackFront(chrome: number): Promise<boolean> {
  for (let i = 0; i < 3 && (await frontPid()) === chrome; i++) {
    const home = homePid ?? Number((await run("pgrep", ["-x", "Finder"])).stdout.trim());
    await run("osascript", ["-e", `tell application "System Events" to set frontmost of (first process whose unix id is ${home}) to true`]).catch(() => undefined);
    await pause(800);
  }
  return (await frontPid()) !== chrome;
}

async function screenLocked(): Promise<boolean> {
  try {
    const { stdout } = await run("ioreg", ["-n", "Root", "-d1", "-a"], { maxBuffer: 8 * 1024 * 1024 });
    return /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/.test(stdout);
  } catch {
    return false;
  }
}

/** The bench's own Chrome: a separate profile, so the user's Chrome and its tabs are never touched. */
async function chromePid(): Promise<number | undefined> {
  const { stdout } = await run("pgrep", ["-f", "--", `--user-data-dir=${PROFILE}`]).catch(() => ({ stdout: "" }));
  const pids = stdout.split(/\s+/).filter(Boolean).map(Number);
  for (const pid of pids) {
    const { stdout: cmd } = await run("ps", ["-o", "command=", "-p", String(pid)]).catch(() => ({ stdout: "" }));
    if (!cmd.includes("--type=")) return pid; // the browser process, not a renderer or helper
  }
  return undefined;
}

async function ensureChrome(url: string): Promise<number> {
  const existing = await chromePid();
  if (existing) return existing;
  await noteFront();
  mkdirSync(PROFILE, { recursive: true });
  await run("open", ["-g", "-n", "-a", "Google Chrome", "--args", `--user-data-dir=${PROFILE}`, "--no-first-run", "--no-default-browser-check", "--force-renderer-accessibility", "--disable-features=Translate", "--window-size=1100,860", `--app=${url}`]);
  for (let i = 0; i < 60; i++) {
    const pid = await chromePid();
    if (pid) {
      await pause(2000);
      // Launching raises Chrome once; the front goes back to whatever had it.
      await handBackFront(pid);
      return pid;
    }
    await pause(250);
  }
  throw new Error("Chrome did not start");
}

type Win = { window_id: number; title?: string; is_on_screen?: boolean };
const windowsOf = async (pid: number) => ((await driverCall<{ windows?: Win[] }>("list_windows", { pid })).windows ?? []).filter((w) => w.is_on_screen !== false && (w.title ?? "") !== "");

/** Points the page at the task and waits until its window, and only that one, shows the task's title. */
async function loadTask(srv: BenchServer, pid: number, task: Task, runId: string): Promise<{ windowId: number; initial: unknown }> {
  srv.setControl({ task: task.id, run: runId });
  for (let i = 0; i < 120; i++) {
    if (srv.state(runId)) {
      const wins = await windowsOf(pid);
      const win = wins.find((w) => w.title === task.title);
      if (win && wins.length === 1) {
        await pause(400);
        return { windowId: win.window_id, initial: srv.state(runId)!.state };
      }
    }
    await pause(250);
  }
  throw new Error(`task ${task.id} did not load in a single window titled "${task.title}"`);
}

/** The bench's Chrome must show exactly one window; anything else (a stray new tab or window) means a fresh start. */
async function ensureSingleWindow(srv: BenchServer): Promise<number> {
  let pid = await ensureChrome(srv.url);
  if ((await windowsOf(pid)).length > 1) {
    process.stderr.write("the bench's Chrome has more than one window: restarting it\n");
    await run("kill", [String(pid)]).catch(() => undefined);
    for (let i = 0; i < 40 && (await chromePid()); i++) await pause(250);
    pid = await ensureChrome(srv.url);
  }
  return pid;
}

function promptFor(task: Task, pid: number, windowId: number): string {
  return [
    `You are operating a web app shown in a Google Chrome window on macOS, using the tools you have. The target is the "Google Chrome" app running as pid ${pid}, window id ${windowId}. Use only that window, and do not navigate away from the page.`,
    "Work in the background: never bring the app to the front and never activate it.",
    "",
    `Task: ${task.prompt}`,
    "",
    "When you have finished, end your final message with exactly one line: `RESULT: success` if the task is done, or `RESULT: failure` if it is not.",
  ].join("\n");
}

/** Samples the frontmost app every 200 ms; the bench's Chrome in front counts as a focus steal. */
function watchFront(pid: number): { stop: () => Promise<number> } {
  let steals = 0;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    if ((await frontPid()) === pid) steals++;
    busy = false;
  }, 200);
  return {
    stop: async () => {
      clearInterval(timer);
      while (busy) await pause(20);
      return steals;
    },
  };
}

function done(): Set<string> {
  if (!existsSync(OUT)) return new Set();
  return new Set(
    readFileSync(OUT, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { agent: string; tools: string; task: string; rep: number })
      .map((r) => `${r.agent}|${r.tools}|${r.task}|${r.rep}`),
  );
}

async function main(): Promise<void> {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(RAW, { recursive: true });
  // Keep the display awake, so a long bench does not lock the screen under itself.
  const awake = spawn("caffeinate", ["-d", "-i", "-w", String(process.pid)], { stdio: "ignore" });
  awake.unref();
  const srv = await startServer();
  const recorded = done();
  const total = reps * tasks.length * agents.length * toolSets.length;
  let n = 0;
  try {
    for (let rep = 1; rep <= reps; rep++) {
      for (const task of tasks) {
        for (const [ai, agent] of agents.entries()) {
          // Alternate which tool set goes first, so neither always meets a freshly loaded page first.
          const order = (rep + ai) % 2 === 0 ? toolSets : [...toolSets].reverse();
          for (const tools of order) {
            n++;
            if (recorded.has(`${agent.label}|${tools}|${task.id}|${rep}`)) continue;
            while (await screenLocked()) {
              process.stderr.write("the screen is locked: waiting\n");
              await pause(30_000);
            }
            const pid = await ensureSingleWindow(srv);
            const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${agent.label}-${tools}-${task.id}`;
            const { windowId, initial } = await loadTask(srv, pid, task, runId);
            if (judge(task.expected, initial).pass) throw new Error(`${task.id}: the initial state already passes`);
            await noteFront(pid);
            const background = await handBackFront(pid);
            const watch = watchFront(pid);
            const t0 = Date.now();
            const a = await runAgent(agent, tools, promptFor(task, pid, windowId), WORK, join(RAW, `${runId}.stream.jsonl`), timeoutMs);
            const wallMs = Date.now() - t0;
            const steals = await watch.stop();
            const windowsAfter = (await windowsOf(pid)).map((w) => w.title ?? "");
            await pause(500); // the page's last report is in flight
            const final = srv.state(runId)?.state;
            const v = judge(task.expected, final);
            const claimed = /RESULT:\s*success/i.test(a.finalText) ? "success" : /RESULT:\s*failure/i.test(a.finalText) ? "failure" : "none";
            const record = {
              runId, rep, task: task.id, category: task.category, agent: agent.label, harness: agent.harness, model: agent.model, tools,
              pass: v.pass, checks: v.checks, mismatches: v.mismatches, final,
              claimed, falseSuccess: claimed === "success" && !v.pass,
              toolCalls: a.toolCalls, toolNames: a.toolNames, otherTools: a.otherTools,
              wallMs, usage: a.usage, costUsd: costUsd(agent.model, a.usage), reportedCostUsd: a.reportedCostUsd,
              jev: a.jev, focusSteals: steals, startedInBackground: background, windowId, windowsAfter, timedOut: a.timedOut, exitCode: a.exitCode, error: a.error,
            };
            appendFileSync(OUT, `${JSON.stringify(record)}\n`);
            process.stderr.write(`[${n}/${total}] ${task.id} ${agent.label} ${tools} rep ${rep}: ${v.pass ? "PASS" : "FAIL"} claimed=${claimed} tools=${a.toolCalls} ${Math.round(wallMs / 1000)}s $${record.costUsd.toFixed(3)}${a.error ? ` error=${a.error.slice(0, 120)}` : ""}\n`);
            srv.setControl({});
            await pause(800);
          }
        }
      }
    }
  } finally {
    srv.setControl({});
    await pause(500);
    await srv.close();
    awake.kill();
  }
}

await main();
