/**
 * The page's side of the protocol. Every task reports its whole model (not the events that led to
 * it) after each change, so the judge sees what the app holds, whatever route the agent took.
 */
import { useEffect, useRef } from "react";

const params = new URLSearchParams(location.search);
export const TASK = params.get("task") ?? "";
export const RUN = params.get("run") ?? "";

let seq = 0;

export function report(state: unknown): void {
  if (!RUN) return;
  const body = JSON.stringify({ seq: ++seq, task: TASK, state });
  void fetch(`/api/state?run=${encodeURIComponent(RUN)}`, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
}

/** Reports `state` on mount and whenever its JSON changes. */
export function useReport(state: unknown): void {
  const json = JSON.stringify(state);
  const last = useRef<string>("");
  useEffect(() => {
    if (json === last.current) return;
    last.current = json;
    report(state);
  }, [json]);
}

/** Follows the harness: a new run id on /api/control loads that task; none shows the idle page. */
export function followControl(): void {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const c = (await (await fetch("/api/control", { cache: "no-store" })).json()) as { task?: string; run?: string };
      const want = c.run && c.task ? `?task=${encodeURIComponent(c.task)}&run=${encodeURIComponent(c.run)}` : "";
      if ((c.run ?? "") !== RUN) location.replace(`/${want}`);
    } catch {
      // The server is restarting; try again on the next tick.
    } finally {
      busy = false;
    }
  }, 250);
}
