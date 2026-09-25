// @vitest-environment jsdom
/** Solves each hard widget task through the UI, and checks that the plausible mistakes fail. */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTask } from "./render.tsx";

const WAIT = { timeout: 2500 };

describe("pr-reviewers", () => {
  const add = async (t: ReturnType<typeof renderTask>, text: string, option: RegExp) => {
    await t.user.type(screen.getByRole("combobox", { name: "Reviewers" }), text);
    await t.user.click(await screen.findByRole("option", { name: option }, WAIT));
  };

  it("passes once the right people are chosen and the review is requested once", async () => {
    const t = renderTask("pr-reviewers");
    expect(t.verdict().pass).toBe(false);
    await t.user.click(screen.getByRole("button", { name: "Remove Alex Kim (@akim)" }));
    await add(t, "Sam Rivera", /Sam Rivera · Platform/);
    await add(t, "Jordan Lee", /^Jordan Lee · Security/);
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when Enter takes the pre-highlighted look-alike", async () => {
    const t = renderTask("pr-reviewers");
    await t.user.click(screen.getByRole("button", { name: "Remove Alex Kim (@akim)" }));
    const box = screen.getByRole("combobox", { name: "Reviewers" });
    await t.user.type(box, "Sam Rivera");
    await screen.findByRole("listbox", {}, WAIT);
    await t.user.keyboard("{Enter}");
    await add(t, "Jordan Lee", /^Jordan Lee · Security/);
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.state()).toMatchObject({ reviewers: ["akimura", "dwu", "jlee", "srivera"] });
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when Backspace in the empty field drops a reviewer, or the review is requested twice", async () => {
    const t = renderTask("pr-reviewers");
    await t.user.click(screen.getByRole("button", { name: "Remove Alex Kim (@akim)" }));
    await add(t, "Sam Rivera", /Sam Rivera · Platform/);
    await add(t, "Jordan Lee", /^Jordan Lee · Security/);
    await t.user.keyboard("{Backspace}");
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.verdict().pass).toBe(false);
    await add(t, "Jordan Lee", /^Jordan Lee · Security/);
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.state()).toMatchObject({ reviewers: ["akimura", "dwu", "jlee", "sam-rivera"] });
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when Alex Kimura is removed instead of Alex Kim", async () => {
    const t = renderTask("pr-reviewers");
    await t.user.click(screen.getByRole("button", { name: "Remove Alex Kimura (@akimura)" }));
    await add(t, "Sam Rivera", /Sam Rivera · Platform/);
    await add(t, "Jordan Lee", /^Jordan Lee · Security/);
    await t.user.click(screen.getByRole("button", { name: "Request review" }));
    expect(t.verdict().pass).toBe(false);
  });
});

describe("roadmap-board", () => {
  const handle = (title: string) => screen.getByRole("button", { name: `Drag ${title}` });
  const move = async (t: ReturnType<typeof renderTask>, title: string, keys: string) => {
    handle(title).focus();
    await t.user.keyboard(`[Space]${keys}[Space]`);
  };

  it("passes after the four moves are made with the keyboard alternative", async () => {
    const t = renderTask("roadmap-board");
    expect(t.verdict().pass).toBe(false);
    // Audit log search: In progress #1 → Review; index 0 lands above Onboarding checklist, so one down.
    await move(t, "Audit log search", "{ArrowRight}{ArrowDown}");
    // SSO login: Backlog #1 → In progress #1 (now below the limit).
    await move(t, "SSO login", "{ArrowRight}");
    // Billing export v2: In progress #2 → Review #2 → Done #2 → last.
    await move(t, "Billing export v2", "{ArrowRight}{ArrowRight}{ArrowDown}");
    // Webhook retries: Backlog #3 → above Dark mode polish (#2).
    await move(t, "Webhook retries", "{ArrowUp}");
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("rejects moving into the full column, and a card left grabbed fails", async () => {
    const t = renderTask("roadmap-board");
    handle("SSO login").focus();
    await t.user.keyboard("[Space]{ArrowRight}");
    expect(screen.getByRole("status").textContent).toContain("In progress is at its limit of 3");
    expect(t.state()).toMatchObject({ grabbed: "SSO login", columns: { backlog: ["SSO login", "Billing export", "Dark mode polish", "Webhook retries"] } });
    await t.user.keyboard("{Escape}");
    await move(t, "Audit log search", "{ArrowRight}{ArrowDown}");
    await move(t, "SSO login", "{ArrowRight}");
    await move(t, "Billing export v2", "{ArrowRight}{ArrowRight}{ArrowDown}");
    handle("Webhook retries").focus();
    await t.user.keyboard("[Space]{ArrowUp}");
    expect(t.verdict().pass).toBe(false);
    await t.user.keyboard("[Space]");
    expect(t.verdict().pass).toBe(true);
  });

  it("fails when the look-alike Billing export is moved, or a card lands in the wrong slot", async () => {
    const t = renderTask("roadmap-board");
    await move(t, "Audit log search", "{ArrowRight}");
    await move(t, "SSO login", "{ArrowRight}");
    await move(t, "Billing export", "{ArrowRight}{ArrowRight}{ArrowRight}{ArrowDown}{ArrowDown}");
    await move(t, "Webhook retries", "{ArrowUp}");
    expect(t.verdict().pass).toBe(false);
  });

  it("also moves cards with mouse drag and drop", () => {
    const t = renderTask("roadmap-board");
    const card = (title: string) => screen.getByText(title, { selector: "span" }).closest("li")!;
    fireEvent.dragStart(card("Audit log search"));
    fireEvent.drop(screen.getByRole("list", { name: "Review cards" }));
    expect(t.state()).toMatchObject({ columns: { review: ["Onboarding checklist", "Audit log search"] } });
    fireEvent.dragStart(card("SSO login"));
    fireEvent.drop(card("Billing export v2"));
    expect(t.state()).toMatchObject({ columns: { progress: ["SSO login", "Billing export v2", "Mobile push"] } });
  });
});

describe("contract-files", () => {
  const item = (name: string, root: HTMLElement = document.body) => within(root).getByRole("treeitem", { name });
  const expand = async (t: ReturnType<typeof renderTask>, path: string[]) => {
    let node: HTMLElement = document.body;
    for (const name of path) {
      node = within(node).getAllByRole("treeitem", { name }).find((el) => el.getAttribute("aria-level") === String(path.indexOf(name) + 1))!;
      await t.user.click(node);
      await within(node).findByRole("group", {}, WAIT);
      await waitLoaded(node);
    }
    return within(node).getByRole("group");
  };
  const waitLoaded = async (node: HTMLElement) => {
    for (let i = 0; i < 60 && within(node).queryByText("Loading…"); i++) await new Promise((r) => setTimeout(r, 50));
  };

  it("passes after renaming, starring and trashing in the right folder", async () => {
    const t = renderTask("contract-files");
    expect(t.verdict().pass).toBe(false);
    const folder = await expand(t, ["Clients", "Northwind", "2026", "Contracts"]);

    // Rename with the mouse: right click → Rename…; only "Draft SOW" is selected, so type just the new stem.
    fireEvent.contextMenu(item("Draft SOW.docx", folder));
    await t.user.click(screen.getByRole("menuitem", { name: "Rename…" }));
    const input = screen.getByRole("textbox", { name: "Rename Draft SOW.docx" });
    expect(document.activeElement).toBe(input);
    await t.user.keyboard("SOW-04{Enter}");

    // Star with the keyboard: focus the item, Shift+F10, Add star.
    item("SOW-03.pdf", folder).focus();
    await t.user.keyboard("{Shift>}{F10}{/Shift}");
    expect(screen.getByRole("menu", { name: "Actions for SOW-03.pdf" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Open" }));
    await t.user.keyboard("{ArrowDown}{Enter}");

    fireEvent.contextMenu(item("MSA-signed.pdf", folder).querySelector(".trow")!);
    await t.user.click(screen.getByRole("menuitem", { name: "Move to trash" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("navigates and expands the tree with the keyboard alone", async () => {
    const t = renderTask("contract-files");
    item("Clients").focus();
    await t.user.keyboard("{ArrowRight}");
    await screen.findByRole("treeitem", { name: "Northwind" }, WAIT);
    await t.user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(item("Northwind"));
    await t.user.keyboard("{ArrowRight}");
    await screen.findByRole("treeitem", { name: "2026" }, WAIT);
    await t.user.keyboard("{ArrowRight}{ArrowDown}");
    expect(document.activeElement).toBe(item("2026"));
  });

  it("acts on the right item when a treeitem is pressed directly, even an expanded folder", async () => {
    const t = renderTask("contract-files");
    await expand(t, ["Clients", "Northwind"]);
    // A press dispatched on the expanded Clients treeitem (not on a nested row) collapses Clients only.
    fireEvent.click(item("Clients"));
    expect(item("Clients").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(item("Clients"));
    await screen.findByRole("treeitem", { name: "Northwind" }, WAIT);
    expect(item("Northwind").getAttribute("aria-expanded")).toBe("true");
    // A click on a nested row does not also toggle its ancestors.
    await t.user.click(item("Northwind").querySelector(".trow")!);
    expect(item("Northwind").getAttribute("aria-expanded")).toBe("false");
    expect(item("Clients").getAttribute("aria-expanded")).toBe("true");
  });

  it("fails when the look-alike Northwind Traders folder is used", async () => {
    const t = renderTask("contract-files");
    const folder = await expand(t, ["Clients", "Northwind Traders", "2026", "Contracts"]);
    fireEvent.contextMenu(item("MSA-signed.pdf", folder));
    await t.user.click(screen.getByRole("menuitem", { name: "Move to trash" }));
    fireEvent.contextMenu(item("SOW-03.pdf", folder));
    await t.user.click(screen.getByRole("menuitem", { name: "Add star" }));
    expect(t.state()).toMatchObject({ trash: ["Clients/Northwind Traders/2026/Contracts/MSA-signed.pdf"] });
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the existing 2025 star is removed", async () => {
    const t = renderTask("contract-files");
    const folder = await expand(t, ["Clients", "Northwind", "2025", "Contracts"]);
    fireEvent.contextMenu(item("SOW-02.pdf (starred)", folder));
    await t.user.click(screen.getByRole("menuitem", { name: "Remove star" }));
    expect((t.state() as { starred: string[] }).starred).not.toContain("Clients/Northwind/2025/Contracts/SOW-02.pdf");
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the full name is typed over the selected stem", async () => {
    const t = renderTask("contract-files");
    const folder = await expand(t, ["Clients", "Northwind", "2026", "Contracts"]);
    fireEvent.contextMenu(item("Draft SOW.docx", folder).querySelector(".trow")!);
    await t.user.click(screen.getByRole("menuitem", { name: "Rename…" }));
    await t.user.keyboard("SOW-04.docx{Enter}");
    expect(t.state()).toMatchObject({ files: expect.arrayContaining(["Clients/Northwind/2026/Contracts/SOW-04.docx.docx"]) });
    expect(t.verdict().pass).toBe(false);
  });

  it("fails on Delete forever instead of Move to trash, and on a stray copy", async () => {
    const t = renderTask("contract-files");
    const folder = await expand(t, ["Clients", "Northwind", "2026", "Contracts"]);
    fireEvent.contextMenu(item("MSA-signed.pdf", folder).querySelector(".trow")!);
    await t.user.click(screen.getByRole("menuitem", { name: "Delete forever" }));
    expect(t.state()).toMatchObject({ deletedForever: ["Clients/Northwind/2026/Contracts/MSA-signed.pdf"], trash: [] });
    fireEvent.contextMenu(item("SOW-03.pdf", folder).querySelector(".trow")!);
    await t.user.click(screen.getByRole("menuitem", { name: "Make a copy" }));
    expect(t.state()).toMatchObject({ files: expect.arrayContaining(["Clients/Northwind/2026/Contracts/Copy of SOW-03.pdf"]) });
    expect(t.verdict().pass).toBe(false);
  });
});

describe("studio-booking", () => {
  const pick = async (t: ReturnType<typeof renderTask>, field: RegExp, option: string) => {
    await t.user.click(screen.getByRole("button", { name: field }));
    await t.user.click(screen.getByRole("option", { name: option }));
  };
  const chooseDates = async (t: ReturnType<typeof renderTask>) => {
    await t.user.click(screen.getByRole("button", { name: /^Dates/ }));
    const dlg = screen.getByRole("dialog", { name: "Choose dates" });
    await t.user.click(within(dlg).getByRole("button", { name: "Next month" }));
    await t.user.click(within(dlg).getByRole("button", { name: "Monday, October 12, 2026" }));
    await t.user.click(within(dlg).getByRole("button", { name: "Friday, October 16, 2026" }));
    await t.user.click(within(dlg).getByRole("button", { name: "Apply" }));
  };

  it("passes once Studio B is booked for the right range and times, once", async () => {
    const t = renderTask("studio-booking");
    expect(t.verdict().pass).toBe(false);
    await pick(t, /^Room/, "Studio B — floor 3, seats 8");
    await chooseDates(t);
    await pick(t, /^Start time/, "8:30 AM");
    // End time with the keyboard: open the list, which starts at 10:00 AM, and step to 12:30 PM.
    await t.user.click(screen.getByRole("button", { name: /^End time/ }));
    expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "End time" }));
    await t.user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: /^End time/ }).textContent).toContain("12:30 PM");
    await t.user.click(screen.getByRole("button", { name: "Book studio" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails with 12:30 AM (rejected), the Annex, or a second booking", async () => {
    const t = renderTask("studio-booking");
    await chooseDates(t);
    await pick(t, /^Start time/, "8:30 AM");
    await pick(t, /^End time/, "12:30 AM");
    await t.user.click(screen.getByRole("button", { name: "Book studio" }));
    expect(screen.getByRole("alert").textContent).toContain("End time must be after start time.");
    await pick(t, /^End time/, "12:30 PM");
    await t.user.click(screen.getByRole("button", { name: "Book studio" }));
    expect(t.state()).toMatchObject({ bookings: [{ room: "Studio B Annex" }] });
    expect(t.verdict().pass).toBe(false);
    await pick(t, /^Room/, "Studio B — floor 3, seats 8");
    await t.user.click(screen.getByRole("button", { name: "Book studio" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("restarts the range when a date is clicked after a complete range, and keeps weekends closed", async () => {
    const t = renderTask("studio-booking");
    await t.user.click(screen.getByRole("button", { name: /^Dates/ }));
    const dlg = screen.getByRole("dialog", { name: "Choose dates" });
    expect((within(dlg).getByRole("button", { name: "Saturday, September 26, 2026 (closed)" }) as HTMLButtonElement).disabled).toBe(true);
    await t.user.click(within(dlg).getByRole("button", { name: "Next month" }));
    await t.user.click(within(dlg).getByRole("button", { name: "Friday, October 16, 2026" }));
    await t.user.click(within(dlg).getByRole("button", { name: "Monday, October 12, 2026" }));
    expect((within(dlg).getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
