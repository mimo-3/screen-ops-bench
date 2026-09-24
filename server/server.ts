/**
 * Serves the built app and the two endpoints the page and the harness share:
 *   GET/POST /api/control   which task and run the page should show ({} = idle)
 *   GET/POST /api/state     the page's latest reported state for a run (highest seq wins)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../dist/app", import.meta.url)));
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

export interface Reported {
  seq: number;
  task: string;
  state: unknown;
  at: number;
}

export interface BenchServer {
  url: string;
  setControl(c: { task?: string; run?: string }): void;
  state(run: string): Reported | undefined;
  close(): Promise<void>;
}

async function body(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const chunk of req) s += chunk;
  return s;
}

export async function startServer(port = 5174): Promise<BenchServer> {
  let control: { task?: string; run?: string } = {};
  const states = new Map<string, Reported>();
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (code: number, v: unknown) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(v));
    };
    if (url.pathname === "/api/control") {
      if (req.method === "POST") control = JSON.parse(await body(req)) as typeof control;
      return json(200, control);
    }
    if (url.pathname === "/api/state") {
      const run = url.searchParams.get("run") ?? "";
      if (req.method === "POST") {
        const r = JSON.parse(await body(req)) as Omit<Reported, "at">;
        const prev = states.get(run);
        if (!prev || r.seq > prev.seq) states.set(run, { ...r, at: Date.now() });
        return json(200, { ok: true });
      }
      return json(200, states.get(run) ?? null);
    }
    const path = normalize(join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
    const file = path.startsWith(ROOT) && existsSync(path) && statSync(path).isFile() ? path : join(ROOT, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${port}/`,
    setControl: (c) => void (control = c),
    state: (run) => states.get(run),
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startServer(Number(process.env.PORT ?? 5174));
  const task = process.argv[2];
  if (task) s.setControl({ task, run: `manual-${Date.now()}` });
  process.stdout.write(`serving ${s.url}${task ? ` (task ${task})` : ""}\n`);
}
