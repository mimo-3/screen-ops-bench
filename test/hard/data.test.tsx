// @vitest-environment jsdom
/** Solves the large-data tasks (app/tasks/hard/data.tsx) through the UI, and checks that the likely mistakes fail. */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTask } from "./render.tsx";

type Task = ReturnType<typeof renderTask>;

/** Pages a virtualized grid down with the keyboard until a control with this name is rendered. */
async function scrollToControl(t: Task, grid: HTMLElement, role: "button" | "checkbox", name: string) {
  for (let i = 0; i < 500; i++) {
    const hit = within(grid).queryByRole(role, { name });
    if (hit) return hit;
    grid.focus();
    await t.user.keyboard("{PageDown}");
  }
  throw new Error(`never rendered: ${name}`);
}

describe("ledger-refund", () => {
  const refund = async (t: Task, id: string, reason: string, amount?: string) => {
    await t.user.click(screen.getByRole("button", { name: `Refund ${id}` }));
    const dialog = screen.getByRole("dialog");
    if (amount !== undefined) {
      await t.user.clear(within(dialog).getByLabelText("Refund amount (USD)"));
      await t.user.type(within(dialog).getByLabelText("Refund amount (USD)"), amount);
    }
    await t.user.selectOptions(within(dialog).getByLabelText("Reason"), reason);
    await t.user.click(within(dialog).getByRole("button", { name: "Issue refund" }));
  };

  it("passes once the largest settled August card payment of Harbor Freight Co. is refunded in full", async () => {
    const t = renderTask("ledger-refund");
    expect(t.verdict().pass).toBe(false);
    // Only the rows in view exist: the target is far down the list at first.
    expect(screen.queryByRole("button", { name: "Refund TX-30337" })).toBeNull();
    await t.user.type(screen.getByLabelText("Search by customer or ID"), "Harbor Freight Co.");
    await t.user.selectOptions(screen.getByLabelText("Payment method"), "Card");
    await t.user.click(screen.getByRole("button", { name: /Amount/ }));
    await t.user.click(screen.getByRole("button", { name: /Amount/ }));
    expect(screen.getByRole("columnheader", { name: /Amount/ }).getAttribute("aria-sort")).toBe("descending");
    // The punctuation-blind search also lists Harbor Freight Corp. From the top: 3,120 (Corp),
    // 2,310 (Sep 1), 1,875 (Jul 31), 1,540 (refunded), 1,299 (Corp), 1,290 (pending), then two
    // 1,284.50 payments on Aug 19: the Settled one and the Partially refunded one.
    expect(screen.getByText("15 of 492 transactions")).toBeTruthy();
    const settled = screen.getByRole("row", { name: /TX-30337/ });
    expect(within(settled).getByText("Settled")).toBeTruthy();
    expect(within(screen.getByRole("row", { name: /TX-30338/ })).getByText("Partially refunded")).toBeTruthy();
    await t.user.click(screen.getByRole("button", { name: "Refund TX-30337" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Refund amount (USD)"));
    await t.user.click(screen.getByRole("button", { name: "Issue refund" }));
    expect(screen.getByRole("alert").textContent).toMatch(/reason/);
    await t.user.selectOptions(screen.getByLabelText("Reason"), "Duplicate charge");
    await t.user.click(screen.getByRole("button", { name: "Issue refund" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("can reach the row by scrolling the full list with the keyboard", async () => {
    const t = renderTask("ledger-refund");
    await scrollToControl(t, screen.getByRole("grid", { name: "Transactions" }), "button", "Refund TX-30337");
    await refund(t, "TX-30337", "Duplicate charge");
    expect(t.verdict().pass).toBe(true);
  });

  it("fails when the look-alike Harbor Freight Corp payment is refunded", async () => {
    const t = renderTask("ledger-refund");
    await t.user.type(screen.getByLabelText("Search by customer or ID"), "Harbor Freight Co");
    await t.user.selectOptions(screen.getByLabelText("Payment method"), "Card");
    await t.user.click(screen.getByRole("button", { name: /Amount/ }));
    await t.user.click(screen.getByRole("button", { name: /Amount/ }));
    await refund(t, "TX-30311", "Duplicate charge"); // Harbor Freight Corp, $3,120.00
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the pending payment or the partially refunded look-alike is refunded instead", async () => {
    const t = renderTask("ledger-refund");
    await t.user.type(screen.getByLabelText("Search by customer or ID"), "TX-30348");
    await t.user.click(screen.getByRole("button", { name: "Refund TX-30348" }));
    expect(screen.getByText(/hasn't settled yet/)).toBeTruthy();
    await t.user.selectOptions(screen.getByLabelText("Reason"), "Duplicate charge");
    await t.user.click(screen.getByRole("button", { name: "Issue refund" }));
    expect(t.state()).toMatchObject({ refunds: [{ id: "TX-30338" }, { id: "TX-30348", amount: 1290 }] });
    expect(t.verdict().pass).toBe(false);
    t.unmount();

    const u = renderTask("ledger-refund");
    await u.user.type(screen.getByLabelText("Search by customer or ID"), "TX-30338");
    await u.user.click(screen.getByRole("button", { name: "Refund TX-30338" }));
    expect(screen.getByText(/Already refunded: \$200\.00/)).toBeTruthy();
    expect((screen.getByLabelText("Refund amount (USD)") as HTMLInputElement).value).toBe("1084.50");
    await u.user.selectOptions(screen.getByLabelText("Reason"), "Duplicate charge");
    await u.user.click(screen.getByRole("button", { name: "Issue refund" }));
    expect(u.verdict().pass).toBe(false);
  });

  it("keeps typed values when the Refund button is activated again, and Escape closes the dialog", async () => {
    const t = renderTask("ledger-refund");
    await t.user.type(screen.getByLabelText("Search by customer or ID"), "TX-30337");
    const button = screen.getByRole("button", { name: "Refund TX-30337" });
    await t.user.click(button);
    await t.user.selectOptions(screen.getByLabelText("Reason"), "Duplicate charge");
    fireEvent.click(button); // a second activation behind the modal
    expect((screen.getByLabelText("Reason") as HTMLSelectElement).value).toBe("Duplicate charge");
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(t.verdict().pass).toBe(false);
  });

  it("keeps the focused row mounted when the grid scrolls it out of view", async () => {
    const t = renderTask("ledger-refund");
    const grid = screen.getByRole("grid", { name: "Transactions" });
    const first = within(grid).getAllByRole("button", { name: /^Refund TX-/ })[0]!;
    first.focus();
    grid.scrollTop = 36 * 200;
    fireEvent.scroll(grid);
    expect(first.isConnected).toBe(true);
    expect(document.activeElement).toBe(first);
    // Once focus leaves the grid, the row is virtualized away as usual.
    await t.user.click(screen.getByLabelText("Search by customer or ID"));
    expect(first.isConnected).toBe(false);
  });

  it("fails for the September payment, the digit-swapped amount, a partial refund or the wrong reason", async () => {
    for (const [id, reason, amount] of [
      ["TX-30399", "Duplicate charge", undefined],
      ["TX-30264", "Duplicate charge", undefined],
      ["TX-30337", "Duplicate charge", "1248.50"],
      ["TX-30337", "Customer request", undefined],
    ] as const) {
      const t = renderTask("ledger-refund");
      await t.user.type(screen.getByLabelText("Search by customer or ID"), id);
      await refund(t, id, reason, amount);
      expect(t.verdict().pass).toBe(false);
      t.unmount();
    }
  });
});

describe("tickets-bulk-archive", () => {
  const filterBillingClosed = async (t: Task) => {
    await t.user.selectOptions(screen.getByLabelText("Queue"), "Billing");
    await t.user.selectOptions(screen.getByLabelText("Status"), "Closed");
  };
  const keepLegalHolds = async (t: Task) => {
    await t.user.click(screen.getByRole("checkbox", { name: "Select ticket #4119" }));
    await t.user.click(screen.getByRole("button", { name: "Page 2" }));
    await t.user.click(screen.getByRole("checkbox", { name: "Select ticket #4055" }));
    await t.user.click(screen.getByRole("button", { name: "Next" }));
    await t.user.click(screen.getByRole("checkbox", { name: "Select ticket #4012" }));
  };
  const archive = async (t: Task, count: number) => {
    await t.user.click(screen.getByRole("button", { name: "Archive selected" }));
    expect(screen.getByRole("dialog", { name: `Archive ${count} tickets?` })).toBeTruthy();
    await t.user.click(screen.getByRole("button", { name: "Archive" }));
  };

  it("passes once the 20 closed Billing tickets without legal hold are archived", async () => {
    const t = renderTask("tickets-bulk-archive");
    expect(t.verdict().pass).toBe(false);
    expect(screen.getByText("2 selected")).toBeTruthy();
    await t.user.click(screen.getByRole("button", { name: "Clear selection" }));
    await filterBillingClosed(t);
    await t.user.click(screen.getByRole("checkbox", { name: "Select all tickets on this page" }));
    await t.user.click(screen.getByRole("button", { name: "Select all 23 matching tickets" }));
    await keepLegalHolds(t);
    expect(screen.getByText("20 selected")).toBeTruthy();
    await archive(t, 20);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("moves focus into the archive dialog and closes it with Escape", async () => {
    const t = renderTask("tickets-bulk-archive");
    const trigger = screen.getByRole("button", { name: "Archive selected" });
    await t.user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await t.user.keyboard("{Enter}"); // Enter on the focused Cancel does not archive
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await t.user.click(trigger);
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(t.state()).toMatchObject({ archived: [], dialogOpen: false });
  });

  it("fails when the stale selection from other queues is archived too", async () => {
    const t = renderTask("tickets-bulk-archive");
    await filterBillingClosed(t);
    await t.user.click(screen.getByRole("checkbox", { name: "Select all tickets on this page" }));
    await t.user.click(screen.getByRole("button", { name: "Select all 23 matching tickets" }));
    await keepLegalHolds(t);
    await archive(t, 22);
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when only the first page is archived, or legal-review is treated like legal-hold", async () => {
    const t = renderTask("tickets-bulk-archive");
    await t.user.click(screen.getByRole("button", { name: "Clear selection" }));
    await filterBillingClosed(t);
    await t.user.click(screen.getByRole("checkbox", { name: "Select all tickets on this page" }));
    await t.user.click(screen.getByRole("checkbox", { name: "Select ticket #4119" }));
    await archive(t, 9);
    expect(t.verdict().pass).toBe(false);

    t.unmount();
    const u = renderTask("tickets-bulk-archive");
    await u.user.click(screen.getByRole("button", { name: "Clear selection" }));
    await filterBillingClosed(u);
    await u.user.selectOptions(screen.getByLabelText("Rows per page"), "25");
    await u.user.click(screen.getByRole("checkbox", { name: "Select all tickets on this page" }));
    for (const id of [4119, 4055, 4012, 4097, 4038]) await u.user.click(screen.getByRole("checkbox", { name: `Select ticket #${id}` }));
    await archive(u, 18);
    expect(u.verdict().pass).toBe(false);
  });
});

describe("stock-reorder", () => {
  const order = async (t: Task, sku: string, qty: string) => {
    const input = screen.getByRole("textbox", { name: `Order quantity for ${sku} at Rotterdam` });
    await t.user.clear(input);
    await t.user.type(input, qty);
  };
  const loadMore = async (t: Task, until: string) => {
    await t.user.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByRole("button", { name: "Loading…" })).toBeTruthy();
    await screen.findByRole("textbox", { name: `Order quantity for ${until} at Rotterdam` }, { timeout: 3000 });
  };

  it("passes once every active Rotterdam shortfall is ordered up to its reorder point in one PO", async () => {
    const t = renderTask("stock-reorder");
    expect(t.verdict().pass).toBe(false);
    await t.user.selectOptions(screen.getByLabelText("Warehouse"), "Rotterdam");
    expect(screen.getByText("Showing 15 of 40 products")).toBeTruthy();
    await order(t, "PK-1037", "83"); // 37 on hand, reorder point 120
    await order(t, "PK-1190", "31"); // 14 / 45
    await loadMore(t, "PK-1309");
    await order(t, "PK-1309", "32"); // 118 / 150
    await order(t, "PK-1411", "24"); // 0 / 24
    await loadMore(t, "PK-1564");
    await order(t, "PK-1564", "25"); // 71 / 96
    await order(t, "PK-1632", "1"); // 199 / 200
    await t.user.click(screen.getByRole("button", { name: "Create purchase order" }));
    expect(screen.getByRole("status").textContent).toBe("PO-7001 created with 6 lines.");
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when only the loaded rows are considered (sorted by On hand)", async () => {
    const t = renderTask("stock-reorder");
    await t.user.selectOptions(screen.getByLabelText("Warehouse"), "Rotterdam");
    await t.user.click(screen.getByRole("button", { name: /On hand/ }));
    await order(t, "PK-1190", "31");
    await order(t, "PK-1037", "83");
    await t.user.click(screen.getByRole("button", { name: "Create purchase order" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when a discontinued product or another warehouse is ordered, and blocks fractional quantities", async () => {
    const t = renderTask("stock-reorder");
    // A Hamburg shortfall typed in the all-warehouses view stays in the draft.
    const hamburg = screen.getAllByRole("textbox", { name: /at Hamburg$/ })[0]!;
    await t.user.type(hamburg, "10");
    await t.user.selectOptions(screen.getByLabelText("Warehouse"), "Rotterdam");
    await order(t, "PK-1037", "83.5");
    await t.user.click(screen.getByRole("button", { name: "Create purchase order" }));
    expect(screen.getByRole("status").textContent).toMatch(/invalid/);
    expect(t.state()).toMatchObject({ purchaseOrders: [] });
    await order(t, "PK-1037", "83");
    await order(t, "PK-1190", "31");
    await order(t, "PK-1224", "35"); // discontinued
    await loadMore(t, "PK-1309");
    await order(t, "PK-1309", "32");
    await order(t, "PK-1411", "24");
    await loadMore(t, "PK-1564");
    await order(t, "PK-1564", "25");
    await order(t, "PK-1632", "1");
    await t.user.click(screen.getByRole("button", { name: "Create purchase order" }));
    expect(t.verdict().pass).toBe(false);
  });
});

describe("logs-incident-link", () => {
  const filter = async (t: Task, service: string, level?: string) => {
    await t.user.selectOptions(screen.getByLabelText("Service"), service);
    if (level) await t.user.selectOptions(screen.getByLabelText("Level"), level);
  };
  const shiftClick = async (t: Task, el: HTMLElement) => {
    await t.user.keyboard("{Shift>}");
    await t.user.click(el);
    await t.user.keyboard("{/Shift}");
  };
  const linkTo = async (t: Task, incident: RegExp) => {
    await t.user.click(screen.getByRole("button", { name: "Link to incident…" }));
    await t.user.click(screen.getByRole("radio", { name: incident }));
    await t.user.click(screen.getByRole("button", { name: "Link" }));
  };

  it("passes once the eight payments-api errors in 14:02:00–14:05:59 UTC are linked to INC-2291", async () => {
    const t = renderTask("logs-incident-link");
    expect(t.verdict().pass).toBe(false);
    await t.user.click(screen.getByRole("checkbox", { name: "Show times in UTC" }));
    expect(screen.getByRole("columnheader", { name: "Time (UTC)" })).toBeTruthy();
    await filter(t, "payments-api", "ERROR");
    const grid = screen.getByRole("grid", { name: "Log lines" });
    // Newest first: 14:06:00 (L-2521) is just above the window, 14:01:57 (L-2440) just below it.
    await t.user.click(await scrollToControl(t, grid, "checkbox", "Select L-2520"));
    await shiftClick(t, await scrollToControl(t, grid, "checkbox", "Select L-2441"));
    expect(screen.getByText("8 selected")).toBeTruthy();
    await linkTo(t, /INC-2291/);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("keeps focus on a selected row while the grid scrolls, and the link dialog takes focus", async () => {
    const t = renderTask("logs-incident-link");
    const grid = screen.getByRole("grid", { name: "Log lines" });
    const box = within(grid).getAllByRole("checkbox", { name: /^Select L-/ })[0]!;
    await t.user.click(box);
    grid.scrollTop = 36 * 300;
    fireEvent.scroll(grid);
    expect(document.activeElement).toBe(box);
    await t.user.click(screen.getByRole("button", { name: "Link to incident…" }));
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /INC-2219/ }));
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(t.state()).toMatchObject({ links: {}, dialogOpen: false });
  });

  it("fails when the local-time window (12:02–12:05 UTC) is linked instead", async () => {
    const t = renderTask("logs-incident-link");
    await filter(t, "payments-api", "ERROR");
    const grid = screen.getByRole("grid", { name: "Log lines" });
    await t.user.click(await scrollToControl(t, grid, "checkbox", "Select L-0113")); // shows 14:05:36 in UTC+02:00
    await shiftClick(t, await scrollToControl(t, grid, "checkbox", "Select L-0045")); // shows 14:02:12
    await linkTo(t, /INC-2291/);
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the range is taken without the level filter, or includes a boundary line", async () => {
    const t = renderTask("logs-incident-link");
    await t.user.click(screen.getByRole("checkbox", { name: "Show times in UTC" }));
    await filter(t, "payments-api");
    const grid = screen.getByRole("grid", { name: "Log lines" });
    await t.user.click(await scrollToControl(t, grid, "checkbox", "Select L-2520"));
    await shiftClick(t, await scrollToControl(t, grid, "checkbox", "Select L-2441"));
    await linkTo(t, /INC-2291/);
    expect(t.verdict().pass).toBe(false); // WARN lines and others in between came along
    t.unmount();

    const u = renderTask("logs-incident-link");
    await u.user.click(screen.getByRole("checkbox", { name: "Show times in UTC" }));
    await filter(u, "payments-api", "ERROR");
    const grid2 = screen.getByRole("grid", { name: "Log lines" });
    await u.user.click(await scrollToControl(u, grid2, "checkbox", "Select L-2521")); // 14:06:00
    await shiftClick(u, await scrollToControl(u, grid2, "checkbox", "Select L-2441"));
    await linkTo(u, /INC-2291/);
    expect(u.verdict().pass).toBe(false);
    // Unlinking the boundary line fixes it.
    grid2.focus();
    await u.user.keyboard("{Home}");
    await u.user.click(await scrollToControl(u, grid2, "button", "Unlink L-2521 from INC-2291"));
    expect(u.verdict().pass).toBe(true);
  });
});
