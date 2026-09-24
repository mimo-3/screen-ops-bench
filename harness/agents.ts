/**
 * The agents under test, run headless with nothing but one MCP server for the screen:
 *   claude: `claude -p` (Claude Code), built-in tools off (`--tools ""`), no user or project settings.
 *   codex:  `codex exec` in its own CODEX_HOME, shell and plugins off, read-only sandbox.
 * Both stream JSON events; each run's stream is kept under results/raw.
 */
import { spawn } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Harness = "claude" | "codex";
export type ToolSet = "cua-jev" | "cua-driver";

export interface AgentSpec {
  /** Label used in results, e.g. "opus-5.5". */
  label: string;
  harness: Harness;
  model: string;
}

export interface Usage {
  /** Uncached input tokens. */
  input: number;
  cacheRead: number;
  cacheWrite: number;
  /** Output tokens, reasoning included. */
  output: number;
  reasoning: number;
}

export interface AgentRun {
  toolCalls: number;
  toolNames: Record<string, number>;
  /** Calls to anything but the screen's MCP server (should stay 0). */
  otherTools: number;
  finalText: string;
  usage: Usage;
  reportedCostUsd?: number;
  jev: { calls: number; inputTokens: number };
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

export const DRIVER = join(homedir(), ".local/bin/cua-driver");
export const CUA_JEV = join(homedir(), "organizations/open-source/cua-jev/dist/cli.js");

/** cua-driver tools the agent may not use: they raise apps, move the real cursor, kill processes or read the whole desktop. */
export const DRIVER_DENY = ["bring_to_front", "move_cursor", "kill_app", "get_desktop_state", "page", "replay_trajectory", "set_config", "install_ffmpeg", "start_recording", "stop_recording", "launch_app"];

const server = (t: ToolSet) => (t === "cua-jev" ? { command: process.execPath, args: [CUA_JEV] } : { command: DRIVER, args: ["mcp"] });

export async function runAgent(spec: AgentSpec, tools: ToolSet, prompt: string, work: string, streamPath: string, timeoutMs: number): Promise<AgentRun> {
  const r: AgentRun = { toolCalls: 0, toolNames: {}, otherTools: 0, finalText: "", usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: 0 }, jev: { calls: 0, inputTokens: 0 }, exitCode: null, timedOut: false };
  const { cmd, argv, env } = spec.harness === "claude" ? claudeCommand(spec, tools, prompt, work) : codexCommand(spec, tools, prompt, work);
  const child = spawn(cmd, argv, { cwd: work, env, stdio: ["ignore", "pipe", "pipe"] });
  const timer = setTimeout(() => {
    r.timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5000).unref();
  }, timeoutMs);
  let buf = "";
  let err = "";
  const take = spec.harness === "claude" ? takeClaude : takeCodex;
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      appendFileSync(streamPath, `${line}\n`);
      take(r, line);
    }
  });
  child.stderr.on("data", (d: Buffer) => void (err = (err + d.toString("utf8")).slice(-4000)));
  r.exitCode = await new Promise<number | null>((ok) => child.on("close", (code) => ok(code)));
  clearTimeout(timer);
  if (buf.trim()) take(r, buf);
  if (r.exitCode !== 0 && !r.error) r.error = err.trim().split("\n").slice(-3).join(" | ");
  return r;
}

function claudeCommand(spec: AgentSpec, tools: ToolSet, prompt: string, work: string) {
  const config = join(work, `mcp-claude-${tools}.json`);
  writeFileSync(config, JSON.stringify({ mcpServers: { [tools]: server(tools) } }));
  const argv = [
    "-p", prompt,
    "--model", spec.model,
    "--tools", "",
    "--mcp-config", config,
    "--strict-mcp-config",
    "--allowedTools", `mcp__${tools}`,
    ...(tools === "cua-driver" ? ["--disallowedTools", ...DRIVER_DENY.map((t) => `mcp__cua-driver__${t}`)] : []),
    "--output-format", "stream-json",
    "--verbose",
    "--no-session-persistence",
    // No user or project settings: no CLAUDE.md, hooks or plugins of whoever runs the bench.
    "--setting-sources", "",
  ];
  // Nothing of a Claude Code session running the bench (its effort level, session, sockets) leaks in.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_EFFORT|CLAUDE_PID)/.test(k)));
  return { cmd: "claude", argv, env };
}

/** A CODEX_HOME of its own: the user's login, and a config with only the screen's MCP server. */
function codexCommand(spec: AgentSpec, tools: ToolSet, prompt: string, work: string) {
  const home = join(work, `codex-home-${tools}`);
  mkdirSync(home, { recursive: true });
  copyFileSync(join(homedir(), ".codex/auth.json"), join(home, "auth.json"));
  const s = server(tools);
  writeFileSync(
    join(home, "config.toml"),
    [
      'sandbox_mode = "read-only"',
      'approval_policy = "never"',
      'web_search = "disabled"',
      'model_reasoning_effort = "medium"',
      "",
      `[mcp_servers.${tools}]`,
      `command = ${JSON.stringify(s.command)}`,
      `args = ${JSON.stringify(s.args)}`,
      "startup_timeout_sec = 60",
      "tool_timeout_sec = 3600",
      'default_tools_approval_mode = "approve"',
      ...(tools === "cua-driver" ? [`disabled_tools = ${JSON.stringify(DRIVER_DENY)}`] : []),
      "",
      "[features]",
      ...["shell_tool", "unified_exec", "apps", "plugins", "computer_use", "browser_use", "in_app_browser", "image_generation", "multi_agent", "goals", "sleep_tool", "memories"].map((f) => `${f} = false`),
      "",
    ].join("\n"),
  );
  const argv = ["exec", "--skip-git-repo-check", "--json", "-m", spec.model, "--ephemeral", prompt];
  return { cmd: "codex", argv, env: { ...process.env, CODEX_HOME: home } };
}

function jevOf(r: AgentRun, text: string): void {
  const m = /"jev":\{"calls":(\d+),"inputTokens":(\d+)/.exec(text);
  if (m) {
    r.jev.calls += Number(m[1]);
    r.jev.inputTokens += Number(m[2]);
  }
}

function count(r: AgentRun, server: string, tool: string): void {
  if (server === "cua-jev" || server === "cua-driver") {
    r.toolCalls++;
    r.toolNames[tool] = (r.toolNames[tool] ?? 0) + 1;
  } else r.otherTools++;
}

function takeClaude(r: AgentRun, line: string): void {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return;
  }
  const content = ((ev.message as { content?: unknown[] } | undefined)?.content ?? []) as Array<Record<string, unknown>>;
  if (ev.type === "assistant") {
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const m = /^mcp__(cua-jev|cua-driver)__(.+)$/.exec(String(b.name));
      count(r, m?.[1] ?? "other", m?.[2] ?? String(b.name));
    }
  }
  if (ev.type === "user") {
    for (const b of content) {
      if (b.type !== "tool_result") continue;
      jevOf(r, Array.isArray(b.content) ? (b.content as Array<{ text?: string }>).map((x) => x.text ?? "").join("") : String(b.content ?? ""));
    }
  }
  if (ev.type === "result") {
    const u = (ev.usage ?? {}) as Record<string, number>;
    r.finalText = String(ev.result ?? "");
    r.reportedCostUsd = ev.total_cost_usd as number;
    r.usage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, reasoning: 0 };
    if (ev.is_error === true) r.error = String(ev.result ?? "error");
  }
}

function takeCodex(r: AgentRun, line: string): void {
  let ev: { type?: string; item?: Record<string, unknown>; usage?: Record<string, number>; message?: string; error?: { message?: string } };
  try {
    ev = JSON.parse(line) as typeof ev;
  } catch {
    return;
  }
  if (ev.type === "item.completed" && ev.item) {
    const it = ev.item;
    if (it.type === "mcp_tool_call") {
      count(r, String(it.server), String(it.tool));
      const content = ((it.result as { content?: Array<{ text?: string }> } | undefined)?.content ?? []).map((x) => x.text ?? "").join("");
      jevOf(r, content);
    } else if (it.type === "agent_message") r.finalText = String(it.text ?? "");
    else if (it.type === "command_execution" || it.type === "web_search" || it.type === "file_change") r.otherTools++;
  }
  if (ev.type === "turn.completed" && ev.usage) {
    const u = ev.usage;
    const cached = u.cached_input_tokens ?? 0;
    r.usage.input += (u.input_tokens ?? 0) - cached;
    r.usage.cacheRead += cached;
    r.usage.cacheWrite += u.cache_write_input_tokens ?? 0;
    r.usage.output += u.output_tokens ?? 0;
    r.usage.reasoning += u.reasoning_output_tokens ?? 0;
  }
  if (ev.type === "turn.failed" || ev.type === "error") r.error = ev.error?.message ?? ev.message ?? "error";
}
