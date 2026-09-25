// @vitest-environment jsdom
/** Solves every multi-screen flow task through the UI, and checks that the likely mistakes fail. */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTask } from "./render.tsx";

type T = ReturnType<typeof renderTask>;
const go = (t: T, label: string, name: string) => t.user.click(within(screen.getByRole("navigation", { name: label })).getByRole("button", { name }));
const replace = async (t: T, el: HTMLElement, text: string) => {
  await t.user.clear(el);
  if (text) await t.user.type(el, text);
};

describe("support-refund", () => {
  async function refund(t: T, email: string, order: string, opts: { qty?: string; item?: string; method?: string } = {}) {
    await go(t, "Helpdesk", "Orders");
    await t.user.type(screen.getByRole("textbox", { name: "Search orders" }), email);
    await t.user.click(screen.getByRole("button", { name: "Search" }));
    await t.user.click(await screen.findByRole("button", { name: order }, { timeout: 3000 }));
    await t.user.type(screen.getByRole("spinbutton", { name: `Refund quantity for ${opts.item ?? "Ceramic Teapot"}` }), opts.qty ?? "1");
    if (opts.method !== "Store credit") await t.user.click(screen.getByRole("radio", { name: opts.method ?? "Original payment method" }));
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Reason" }), "Damaged on arrival");
    await t.user.click(screen.getByRole("button", { name: "Issue refund" }));
    await screen.findByText(/Refund of \$[\d.]+ issued/, undefined, { timeout: 3000 });
  }
  async function reply(t: T) {
    await go(t, "Helpdesk", "Tickets");
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Status after sending" }), "Solved");
    await t.user.click(screen.getByRole("button", { name: "Send reply" }));
  }

  it("passes after refunding one teapot on the right order and solving the right ticket", async () => {
    const t = renderTask("support-refund");
    expect(t.verdict().pass).toBe(false);
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    expect(screen.getByText(/mei\.chen@northwind\.io/)).toBeTruthy();
    await refund(t, "mei.chen@northwind.io", "ORD-58231");
    await reply(t);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("validates a refund without a reason", async () => {
    const t = renderTask("support-refund");
    await go(t, "Helpdesk", "Orders");
    await t.user.click(screen.getByRole("button", { name: "ORD-58288" }));
    await t.user.click(screen.getByRole("button", { name: "Issue refund" }));
    expect(screen.getByRole("alert").textContent).toMatch(/at least one item.*Choose a refund reason/);
    expect(t.state()).toMatchObject({ refunds: [] });
  });

  it("fails on the other Mei Chen's look-alike order", async () => {
    const t = renderTask("support-refund");
    await refund(t, "Mei Chen", "ORD-58213");
    await reply(t);
    expect(t.verdict().pass).toBe(false);
  });

  it("fails with the default store credit, or both teapots", async () => {
    const t = renderTask("support-refund");
    await refund(t, "mei.chen@northwind.io", "ORD-58231", { method: "Store credit" });
    await reply(t);
    expect(t.verdict().pass).toBe(false);
    t.unmount();
    const u = renderTask("support-refund");
    await refund(u, "mei.chen@northwind.io", "ORD-58231", { qty: "2" });
    await reply(u);
    expect(u.verdict().pass).toBe(false);
  });

  it("loses a reply typed before going to Orders", async () => {
    const t = renderTask("support-refund");
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await refund(t, "mei.chen@northwind.io", "ORD-58231");
    await go(t, "Helpdesk", "Tickets");
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    expect((screen.getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement).value).toBe("");
    expect(t.verdict().pass).toBe(false);
  });

  it("recovers a reply sent while still Open by updating the status alone", async () => {
    const t = renderTask("support-refund");
    await refund(t, "mei.chen@northwind.io", "ORD-58231");
    await go(t, "Helpdesk", "Tickets");
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await t.user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(t.verdict().pass).toBe(false);
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Status after sending" }), "Solved");
    await t.user.click(screen.getByRole("button", { name: "Update status" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when the reply is sent a second time to change the status", async () => {
    const t = renderTask("support-refund");
    await refund(t, "mei.chen@northwind.io", "ORD-58231");
    await go(t, "Helpdesk", "Tickets");
    await t.user.click(screen.getByRole("button", { name: "Broken teapot" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await t.user.click(screen.getByRole("button", { name: "Send reply" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Status after sending" }), "Solved");
    await t.user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the other Mei Chen's ticket is solved", async () => {
    const t = renderTask("support-refund");
    await refund(t, "mei.chen@northwind.io", "ORD-58231");
    await go(t, "Helpdesk", "Tickets");
    await t.user.click(screen.getByRole("button", { name: "Teapot on induction?" }));
    await t.user.type(screen.getByRole("textbox", { name: "Reply" }), "Your refund is on its way.");
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Status after sending" }), "Solved");
    await t.user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(t.verdict().pass).toBe(false);
  });
});

describe("payout-setup", () => {
  async function fill(t: T, v: { holder: string; iban: string; bic: string; vat: string; currency: string; threshold: string }) {
    await go(t, "Supplier portal", "Payout details");
    await replace(t, screen.getByRole("textbox", { name: "Account holder" }), v.holder);
    await replace(t, screen.getByRole("textbox", { name: "IBAN" }), v.iban);
    await replace(t, screen.getByRole("textbox", { name: "BIC" }), v.bic);
    await replace(t, screen.getByRole("textbox", { name: "VAT ID" }), v.vat);
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Payout currency" }), v.currency);
    await replace(t, screen.getByRole("textbox", { name: "Payout threshold" }), v.threshold);
  }
  const submit = async (t: T) => {
    await t.user.click(screen.getByRole("button", { name: "Submit for verification" }));
    await screen.findByText(/All changes saved/, undefined, { timeout: 3000 });
  };
  const good = { holder: "Brightwave Solutions GmbH", iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", vat: "DE 318 442 907", currency: "EUR", threshold: "50" };

  it("passes after reading the documents, fixing the threshold from the server error and resubmitting", async () => {
    const t = renderTask("payout-setup");
    expect(t.verdict().pass).toBe(false);
    await go(t, "Supplier portal", "Company documents");
    const docs = screen.getAllByRole("article");
    expect(within(docs[2]!).getByText(/Current/)).toBeTruthy();
    await fill(t, good);
    await submit(t);
    const alert = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(alert.textContent).toContain("at least 100 EUR");
    expect(t.verdict().pass).toBe(false);
    await replace(t, screen.getByRole("textbox", { name: "Payout threshold" }), "100");
    await t.user.click(screen.getByRole("button", { name: "Submit for verification" }));
    await screen.findByText(/pending verification\./, undefined, { timeout: 3000 });
    expect(t.verdict().mismatches).toEqual([]);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("rejects the superseded letter and the trading name", async () => {
    const t = renderTask("payout-setup");
    await fill(t, { ...good, holder: "Brightwave GmbH", iban: "DE44 5001 0517 5407 3249 31", bic: "INGDDEFFXXX", threshold: "100" });
    await t.user.click(screen.getByRole("button", { name: "Submit for verification" }));
    const alert = await screen.findByText(/not confirmed by a current bank/, undefined, { timeout: 3000 });
    expect(alert.closest("[role=alert]")!.textContent).toMatch(/legal name/);
    expect(t.verdict().pass).toBe(false);
  });

  it("guards unsaved edits when leaving; discarding loses them", async () => {
    const t = renderTask("payout-setup");
    await go(t, "Supplier portal", "Payout details");
    await replace(t, screen.getByRole("textbox", { name: "VAT ID" }), "DE318442907");
    await go(t, "Supplier portal", "Company documents");
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    await t.user.click(within(dialog).getByRole("button", { name: "Discard changes" }));
    await go(t, "Supplier portal", "Payout details");
    expect((screen.getByRole("textbox", { name: "VAT ID" }) as HTMLInputElement).value).toBe("");
    expect(t.state()).toMatchObject({ discards: 1 });
  });

  it("focuses Stay in the leave dialog, and Escape keeps the edits", async () => {
    const t = renderTask("payout-setup");
    await go(t, "Supplier portal", "Payout details");
    await replace(t, screen.getByRole("textbox", { name: "VAT ID" }), "DE318442907");
    await go(t, "Supplier portal", "Company documents");
    const dialog = screen.getByRole("dialog", { name: "Leave without saving?" });
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Stay on this page" }));
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("textbox", { name: "VAT ID" }) as HTMLInputElement).value).toBe("DE318442907");
    expect(t.state()).toMatchObject({ discards: 0 });
  });

  it("fails when submitted twice after acceptance", async () => {
    const t = renderTask("payout-setup");
    await fill(t, { ...good, threshold: "100" });
    await t.user.click(screen.getByRole("button", { name: "Submit for verification" }));
    await screen.findByText(/pending verification\./, undefined, { timeout: 3000 });
    expect(t.verdict().pass).toBe(true);
    await t.user.click(screen.getByRole("button", { name: "Submit for verification" }));
    await new Promise((r) => setTimeout(r, 1700));
    expect(t.verdict().pass).toBe(false);
  });
});

describe("drive-cleanup", () => {
  const openFolder = (t: T, name: string) => t.user.click(screen.getByRole("button", { name: `📁 ${name}` }));
  const select = (t: T, file: string) => t.user.click(screen.getByRole("checkbox", { name: `Select ${file}` }));
  async function moveTo(t: T, path: string[]) {
    await t.user.click(screen.getByRole("button", { name: "Move to…" }));
    const dialog = screen.getByRole("dialog");
    for (const p of path) await t.user.click(await within(dialog).findByRole("button", { name: `📁 ${p}` }, { timeout: 3000 }));
    await within(dialog).findByText(/No folders/, undefined, { timeout: 3000 });
    await t.user.click(within(dialog).getByRole("button", { name: "Move here" }));
  }
  async function restoreV3(t: T, deletedOn: string) {
    await go(t, "Drive", "Trash");
    const row = screen.getByRole("row", { name: new RegExp(`Brand guidelines v3\\.pdf.*${deletedOn}`) });
    await t.user.click(within(row).getByRole("button", { name: "Restore" }));
  }

  it("passes after checking invoice dates, deleting the duplicate, moving the Q3 invoices and restoring yesterday's copy", async () => {
    const t = renderTask("drive-cleanup");
    expect(t.verdict().pass).toBe(false);
    await openFolder(t, "Inbox uploads");
    await t.user.click(screen.getByRole("button", { name: "Invoice-0935.pdf" }));
    const details = screen.getByRole("complementary", { name: "Details" });
    await within(details).findByText("2026-06-30", undefined, { timeout: 3000 });
    await t.user.click(screen.getByRole("button", { name: "Invoice-0829.pdf" }));
    await within(screen.getByRole("complementary", { name: "Details" })).findByText("2026-09-03", undefined, { timeout: 3000 });

    await select(t, "Invoice-0932 (1).pdf");
    await t.user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("status").textContent).toContain("1 item moved to Trash");

    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932.pdf"]) await select(t, f);
    await moveTo(t, ["Finance", "2026", "Q3"]);
    await restoreV3(t, "2026-09-24");
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("passes when the duplicate is moved with the others and deleted from the destination", async () => {
    const t = renderTask("drive-cleanup");
    await openFolder(t, "Inbox uploads");
    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932 (1).pdf", "Invoice-0932.pdf"]) await select(t, f);
    await moveTo(t, ["Finance", "2026", "Q3"]);
    await t.user.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("button", { name: "My Drive" }));
    await openFolder(t, "Finance");
    await openFolder(t, "2026");
    await openFolder(t, "Q3");
    await select(t, "Invoice-0932 (1).pdf");
    await t.user.click(screen.getByRole("button", { name: "Delete" }));
    await restoreV3(t, "2026-09-24");
    expect(t.verdict().mismatches).toEqual([]);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when the duplicate is deleted forever", async () => {
    const t = renderTask("drive-cleanup");
    await openFolder(t, "Inbox uploads");
    await select(t, "Invoice-0932 (1).pdf");
    await t.user.click(screen.getByRole("button", { name: "Delete" }));
    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932.pdf"]) await select(t, f);
    await moveTo(t, ["Finance", "2026", "Q3"]);
    await restoreV3(t, "2026-09-24");
    const row = screen.getByRole("row", { name: /Invoice-0932 \(1\)\.pdf/ });
    await t.user.click(within(row).getByRole("button", { name: "Delete forever" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("move dialog focuses Cancel and closes on Escape", async () => {
    const t = renderTask("drive-cleanup");
    await openFolder(t, "Inbox uploads");
    await select(t, "Invoice-0829.pdf");
    await t.user.click(screen.getByRole("button", { name: "Move to…" }));
    expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await t.user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("undo brings back a wrongly deleted file", async () => {
    const t = renderTask("drive-cleanup");
    await openFolder(t, "Inbox uploads");
    await select(t, "Invoice-0932.pdf");
    await t.user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("checkbox", { name: "Select Invoice-0932.pdf" })).toBeNull();
    await t.user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("checkbox", { name: "Select Invoice-0932.pdf" })).toBeTruthy();
    expect((t.state() as { trash: unknown[] }).trash).toHaveLength(3);
  });

  it("fails when moving by the Modified column, into 2025 Q3, or restoring the older copy", async () => {
    const byModified = renderTask("drive-cleanup");
    await openFolder(byModified, "Inbox uploads");
    await select(byModified, "Invoice-0932 (1).pdf");
    await byModified.user.click(screen.getByRole("button", { name: "Delete" }));
    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932.pdf", "Invoice-0935.pdf"]) await select(byModified, f);
    await moveTo(byModified, ["Finance", "2026", "Q3"]);
    await restoreV3(byModified, "2026-09-24");
    expect(byModified.verdict().pass).toBe(false);
    byModified.unmount();

    const lookAlike = renderTask("drive-cleanup");
    await openFolder(lookAlike, "Inbox uploads");
    await select(lookAlike, "Invoice-0932 (1).pdf");
    await lookAlike.user.click(screen.getByRole("button", { name: "Delete" }));
    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932.pdf"]) await select(lookAlike, f);
    await moveTo(lookAlike, ["Finance", "2025", "Q3"]);
    await restoreV3(lookAlike, "2026-09-24");
    expect(lookAlike.verdict().pass).toBe(false);
    lookAlike.unmount();

    const older = renderTask("drive-cleanup");
    await openFolder(older, "Inbox uploads");
    await select(older, "Invoice-0932 (1).pdf");
    await older.user.click(screen.getByRole("button", { name: "Delete" }));
    for (const f of ["Invoice-0829.pdf", "Invoice-0931.pdf", "Invoice-0932.pdf"]) await select(older, f);
    await moveTo(older, ["Finance", "2026", "Q3"]);
    await restoreV3(older, "2026-09-02");
    expect(older.verdict().pass).toBe(false);
  });
});

describe("event-update", () => {
  const tab = (t: T, name: string) => t.user.click(screen.getByRole("tab", { name: new RegExp(`^${name}`) }));
  const openEvent = (t: T) => t.user.click(screen.getByRole("button", { name: "Autumn Dev Summit" }));
  async function lookUpRooms(t: T) {
    await go(t, "Planner", "Venues");
    await t.user.click(screen.getByRole("button", { name: "View rooms at Harbor Hall" }));
    const rooms = screen.getByRole("region", { name: "Rooms at Harbor Hall" });
    await within(rooms).findByRole("table", undefined, { timeout: 3000 });
    expect(within(rooms).getByRole("row", { name: /Room B 240 Yes/ })).toBeTruthy();
    await go(t, "Planner", "Events");
  }
  async function saveVenue(t: T) {
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Venue" }), "Harbor Hall — Room B");
    await t.user.click(screen.getByRole("button", { name: "Save details" }));
  }
  async function saveTickets(t: T, ga = "190") {
    await tab(t, "Tickets");
    await replace(t, screen.getByRole("textbox", { name: "General admission" }), ga);
    await t.user.click(screen.getByRole("button", { name: "Save tickets" }));
  }
  async function saveSchedule(t: T, qa = "11:15") {
    await tab(t, "Schedule");
    await replace(t, screen.getByRole("textbox", { name: "Start time for Keynote" }), "10:30");
    await replace(t, screen.getByRole("textbox", { name: "Start time for Keynote Q&A" }), qa);
    await t.user.click(screen.getByRole("button", { name: "Save schedule" }));
  }

  it("passes after looking up the room, saving the venue first, then tickets and schedule", async () => {
    const t = renderTask("event-update");
    expect(t.verdict().pass).toBe(false);
    await lookUpRooms(t);
    await openEvent(t);
    await saveVenue(t);
    await saveTickets(t);
    await saveSchedule(t);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("rejects tickets over the saved venue's capacity until the venue is saved", async () => {
    const t = renderTask("event-update");
    await openEvent(t);
    await saveTickets(t);
    expect(screen.getByRole("alert").textContent).toContain("exceed the capacity of Main Street Loft (150 seats)");
    expect(t.state()).toMatchObject({ events: { "ev-ads": { ga: 120 } } });
  });

  it("discards an unsaved tab on switch, and Restore brings it back", async () => {
    const t = renderTask("event-update");
    await openEvent(t);
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Venue" }), "Harbor Hall — Room B");
    await tab(t, "Tickets");
    expect(screen.getByRole("status").textContent).toContain("Unsaved changes to Details");
    expect(t.state()).toMatchObject({ events: { "ev-ads": { venue: "Main Street Loft" } } });
    await t.user.click(screen.getByRole("button", { name: "Restore" }));
    expect((screen.getByRole("combobox", { name: "Venue" }) as HTMLSelectElement).value).toBe("Harbor Hall — Room B");
    await t.user.click(screen.getByRole("button", { name: "Save details" }));
    expect(t.state()).toMatchObject({ events: { "ev-ads": { venue: "Harbor Hall — Room B" } } });
  });

  it("rejects an overlapping schedule, and fails when the Q&A is simply moved an hour", async () => {
    const t = renderTask("event-update");
    await openEvent(t);
    await saveVenue(t);
    await saveTickets(t);
    await tab(t, "Schedule");
    await replace(t, screen.getByRole("textbox", { name: "Start time for Keynote" }), "10:30");
    await t.user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Keynote Q&A \(10:15–10:45\) overlaps Keynote/);
    await saveSchedule(t, "11:30");
    expect(t.verdict().pass).toBe(false);
  });

  it("fails on the Annex room or on the Workshop Day event", async () => {
    const t = renderTask("event-update");
    await openEvent(t);
    await t.user.selectOptions(screen.getByRole("combobox", { name: "Venue" }), "Harbor Hall Annex — Room B");
    await t.user.click(screen.getByRole("button", { name: "Save details" }));
    await saveTickets(t, "250");
    await saveSchedule(t);
    expect(t.verdict().pass).toBe(false);
    t.unmount();
    const u = renderTask("event-update");
    await u.user.click(screen.getByRole("button", { name: "Autumn Dev Summit — Workshop Day" }));
    await tab(u, "Schedule");
    await replace(u, screen.getByRole("textbox", { name: "Start time for Keynote" }), "10:00");
    await u.user.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(u.verdict().pass).toBe(false);
  });
});
