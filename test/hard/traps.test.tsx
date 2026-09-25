// @vitest-environment jsdom
/** Solves every "traps" task through the UI, and checks that the tempting mistakes fail. */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTask } from "./render.tsx";

type T = ReturnType<typeof renderTask>;
const MSG = "Hi! I'm away until October 6 and won't check email. For urgent issues, contact Priya at priya@acme.test.";

async function replace(t: T, label: string, value: string) {
  const el = screen.getByLabelText(label);
  await t.user.clear(el);
  if (value) await t.user.type(el, value);
}

describe("profile-tabs-save", () => {
  async function edit(t: T, saveEach: boolean) {
    await replace(t, "Display name", "J. R. Okafor");
    await replace(t, "Job title", "Staff Engineer, Payments");
    if (saveEach) await t.user.click(screen.getByRole("button", { name: "Save changes" }));
    await t.user.click(screen.getByRole("tab", { name: "Contact" }));
    await replace(t, "Phone number", "+1 415 555 0142");
    await t.user.clear(screen.getByLabelText("Secondary email"));
    if (saveEach) await t.user.click(screen.getByRole("button", { name: "Save changes" }));
    await t.user.click(screen.getByRole("tab", { name: "Notifications" }));
    await t.user.click(screen.getByRole("switch", { name: "Weekly digest" }));
    await t.user.click(screen.getByRole("switch", { name: "Product announcements" }));
    await t.user.click(screen.getByRole("switch", { name: "Partner offers" }));
    await t.user.click(screen.getByRole("button", { name: "Save changes" }));
  }

  it("passes when every tab is saved", async () => {
    const t = renderTask("profile-tabs-save");
    expect(t.verdict().pass).toBe(false);
    await edit(t, true);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when Save is pressed only once at the end", async () => {
    const t = renderTask("profile-tabs-save");
    await edit(t, false);
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the new name is typed after the prefilled one", async () => {
    const t = renderTask("profile-tabs-save");
    await t.user.type(screen.getByLabelText("Display name"), "J. R. Okafor");
    await t.user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(t.state()).toMatchObject({ saved: { personal: { displayName: "JR OkaforJ. R. Okafor" } } });
    expect(t.verdict().pass).toBe(false);
  });
});

describe("project-delete-confirm", () => {
  async function deleteLegacy(t: T, keepRepo: boolean) {
    await t.user.click(screen.getByRole("button", { name: "Delete mobile-app-legacy" }));
    const dlg = screen.getByRole("dialog", { name: "Delete mobile-app-legacy?" });
    const confirm = within(dlg).getByRole("button", { name: "Delete project" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    // The session dialog interrupts shortly after the delete dialog opens.
    const alert = await screen.findByRole("alertdialog", { name: "Your session is about to expire" }, { timeout: 3000 });
    await t.user.click(within(alert).getByRole("button", { name: "Stay signed in" }));
    await t.user.type(within(dlg).getByLabelText("Type the project name to confirm"), "mobile-app-legacy");
    if (keepRepo) await t.user.click(within(dlg).getByRole("checkbox", { name: /Also delete the GitHub repository/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await t.user.click(confirm);
  }

  it("passes after deleting the right project, keeping its repo, and archiving the other", async () => {
    const t = renderTask("project-delete-confirm");
    expect(t.verdict().pass).toBe(false);
    await deleteLegacy(t, true);
    await t.user.click(screen.getByRole("button", { name: "Archive web-dashboard-old" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when the default-on repository deletion is left on", async () => {
    const t = renderTask("project-delete-confirm");
    await deleteLegacy(t, false);
    await t.user.click(screen.getByRole("button", { name: "Archive web-dashboard-old" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("keeps the confirm button disabled for a look-alike name, and fails on the wrong row", async () => {
    const t = renderTask("project-delete-confirm");
    await t.user.click(screen.getByRole("button", { name: "Delete mobile-app-legacy-v2" }));
    const dlg = screen.getByRole("dialog");
    await t.user.type(within(dlg).getByLabelText("Type the project name to confirm"), "mobile-app-legacy");
    expect((within(dlg).getByRole("button", { name: "Delete project" }) as HTMLButtonElement).disabled).toBe(true);
    await t.user.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await t.user.click(screen.getByRole("button", { name: "Delete web-dashboard-old" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the delete finishes before the session prompt and the prompt is left unanswered", async () => {
    const t = renderTask("project-delete-confirm");
    await t.user.click(screen.getByRole("button", { name: "Delete mobile-app-legacy" }));
    const dlg = screen.getByRole("dialog", { name: "Delete mobile-app-legacy?" });
    await t.user.type(within(dlg).getByLabelText("Type the project name to confirm"), "mobile-app-legacy");
    await t.user.click(within(dlg).getByRole("checkbox", { name: /Also delete the GitHub repository/ }));
    await t.user.click(within(dlg).getByRole("button", { name: "Delete project" }));
    await t.user.click(screen.getByRole("button", { name: "Archive web-dashboard-old" }));
    await screen.findByRole("alertdialog", { name: "Your session is about to expire" }, { timeout: 3000 });
    expect(t.state()).toMatchObject({ sessionPrompt: "shown", signedOut: false, repositoriesDeleted: [] });
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the session dialog is answered with Sign out", async () => {
    const t = renderTask("project-delete-confirm");
    await t.user.click(screen.getByRole("button", { name: "Delete mobile-app-legacy" }));
    const alert = await screen.findByRole("alertdialog", {}, { timeout: 3000 });
    await t.user.click(within(alert).getByRole("button", { name: "Sign out" }));
    expect(t.state()).toMatchObject({ signedOut: true });
    expect(t.verdict().pass).toBe(false);
  });
});

describe("checkout-country-reset", () => {
  async function address(t: T) {
    await replace(t, "Street address", "120 Bremner Blvd, Unit 4");
    await t.user.selectOptions(screen.getByLabelText("Province"), "Ontario");
    await replace(t, "Postal code", "M5V 3L9");
  }

  it("passes when the country is changed first and the add-ons are set afterwards", async () => {
    const t = renderTask("checkout-country-reset");
    expect(t.verdict().pass).toBe(false);
    await t.user.selectOptions(screen.getByLabelText("Country"), "Canada");
    const place = screen.getByRole("button", { name: "Place order" });
    expect((place as HTMLButtonElement).disabled).toBe(true);
    await address(t);
    expect((place as HTMLButtonElement).disabled).toBe(false);
    await t.user.click(screen.getByRole("radio", { name: /Express/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /shipping protection/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /Save this address/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /deals and product news/ }));
    await t.user.click(place);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when the add-ons are set before the country change, which resets them", async () => {
    const t = renderTask("checkout-country-reset");
    await t.user.click(screen.getByRole("checkbox", { name: /shipping protection/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /Save this address/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /deals and product news/ }));
    expect((screen.getByRole("radio", { name: /Express/ }) as HTMLInputElement).checked).toBe(true);
    await t.user.selectOptions(screen.getByLabelText("Country"), "Canada");
    expect((screen.getByRole("radio", { name: /Standard/ }) as HTMLInputElement).checked).toBe(true);
    await address(t);
    await t.user.click(screen.getByRole("button", { name: "Place order" }));
    expect(t.verdict().pass).toBe(false);
  });

  it("fails when the order is placed twice", async () => {
    const t = renderTask("checkout-country-reset");
    await t.user.selectOptions(screen.getByLabelText("Country"), "Canada");
    await address(t);
    await t.user.click(screen.getByRole("radio", { name: /Express/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /shipping protection/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /Save this address/ }));
    await t.user.click(screen.getByRole("checkbox", { name: /deals and product news/ }));
    await t.user.dblClick(screen.getByRole("button", { name: "Place order" }));
    expect(t.verdict().pass).toBe(false);
  });
});

describe("vacation-responder", () => {
  async function fill(t: T, turnOffSmart: boolean) {
    await t.user.click(screen.getByRole("switch", { name: "Automatic replies" }));
    const upsell = await screen.findByRole("dialog", { name: "Let AI write your replies?" }, { timeout: 3000 });
    await t.user.click(within(upsell).getByRole("button", { name: "Not now" }));
    if (turnOffSmart) await t.user.click(screen.getByRole("switch", { name: /Smart punctuation/ }));
    await replace(t, "First day (YYYY-MM-DD)", "2026-09-28");
    expect(screen.getByRole("alert").textContent).toContain("on or after");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    await replace(t, "Last day (YYYY-MM-DD)", "2026-10-06");
    await replace(t, "Subject", "Out of office: back Oct 7");
    await replace(t, "Message", MSG);
    await t.user.click(screen.getByRole("checkbox", { name: /outside Acme/ }));
    await t.user.click(screen.getByRole("button", { name: "Save" }));
  }

  it("passes with smart punctuation off and the upsell declined", async () => {
    const t = renderTask("vacation-responder");
    expect(t.verdict().pass).toBe(false);
    await fill(t, true);
    expect(t.verdict()).toMatchObject({ pass: true });
  });

  it("fails when smart punctuation curls the apostrophes", async () => {
    const t = renderTask("vacation-responder");
    await fill(t, false);
    expect(t.state()).toMatchObject({ saved: { message: MSG.replace(/'/g, "’") } });
    expect(t.verdict().pass).toBe(false);
  });

  it("curls apostrophes as the value changes, even without the field losing focus", async () => {
    const t = renderTask("vacation-responder");
    const msg = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(msg, { target: { value: MSG } });
    expect(msg.value).toBe(MSG.replace(/'/g, "’"));
    expect(t.state()).toMatchObject({ draft: { message: MSG.replace(/'/g, "’") } });
  });

  it("fails when the subject keeps the prefilled capital O", async () => {
    const t = renderTask("vacation-responder");
    await t.user.click(screen.getByRole("switch", { name: /Smart punctuation/ }));
    await t.user.type(screen.getByLabelText("Subject"), ": back Oct 7");
    const upsell = await screen.findByRole("dialog", {}, { timeout: 3000 });
    await t.user.click(within(upsell).getByRole("button", { name: "Turn on AI replies" }));
    expect(t.state()).toMatchObject({ aiReplies: true, draft: { subject: "Out of Office: back Oct 7" } });
    expect(t.verdict().pass).toBe(false);
  });
});
