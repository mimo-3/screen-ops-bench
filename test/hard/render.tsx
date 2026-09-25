/**
 * Renders one task page in jsdom, as the bench shows it, so a test can solve the task the way a
 * user would and check that the page then reports exactly the task's expected state.
 */
import { cleanup, render } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach } from "vitest";
import { lastReported } from "../../app/report.ts";
import { TASKS } from "../../app/tasks/index.ts";
import { judge } from "../../harness/judge.js";
import { loadTasks } from "../../harness/tasks.js";

afterEach(cleanup);

export function renderTask(id: string) {
  const page = TASKS[id];
  const spec = loadTasks().find((t) => t.id === id);
  if (!page || !spec) throw new Error(`no task ${id}`);
  const Page = page.component;
  const user = userEvent.setup();
  const view = render(<Page />);
  return {
    user,
    ...view,
    spec,
    state: lastReported,
    /** The judge's verdict on what the page reports now. */
    verdict: () => judge(spec.expected, lastReported()),
  };
}
