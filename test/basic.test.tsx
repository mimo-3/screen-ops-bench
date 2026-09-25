// @vitest-environment jsdom
/** Solves a basic task in jsdom, the way every hard task's test does (see test/hard/render.tsx). */
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderTask } from "./hard/render.tsx";

describe("signup-form", () => {
  it("starts failing, and passes once filled in and submitted once", async () => {
    const t = renderTask("signup-form");
    expect(t.verdict().pass).toBe(false);
    await t.user.type(screen.getByLabelText("Full name"), "Grace Hopper");
    await t.user.type(screen.getByLabelText("Email"), "grace@navy.mil");
    await t.user.selectOptions(screen.getByLabelText("Country"), "Germany");
    await t.user.click(screen.getByRole("radio", { name: "Pro" }));
    await t.user.click(screen.getByRole("checkbox", { name: /agree/ }));
    await t.user.click(screen.getByRole("button", { name: "Create account" }));
    expect(t.verdict()).toMatchObject({ pass: true });
  });
});
