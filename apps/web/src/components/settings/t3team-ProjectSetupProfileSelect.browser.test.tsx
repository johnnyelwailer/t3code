import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { T3TeamProjectSetupProfileSelect } from "./t3team-ProjectSetupProfileSelect";

const packProfiles: readonly EnvironmentSetupProfile[] = [
  {
    id: "requirements-product",
    title: "Requirements Partner",
    description: "Shapes requirements with the team.",
    badge: "REQ",
    bullets: ["Refine scope"],
    category: "product",
    default: true,
  },
  {
    id: "engineer",
    title: "Developer",
    description: "Implementation guidance with diff-first defaults.",
    badge: "DEV",
    bullets: ["Plan changes"],
    category: "engineering",
  },
];

vi.mock(import("../../t3team/t3team-packSetupProfiles"), async (importOriginal) => ({
  ...(await importOriginal()),
  useT3TeamPackSetupProfiles: () => packProfiles,
  readT3TeamPackSetupProfiles: () => packProfiles,
}));

vi.mock(import("../../t3team/t3team-workProfileChooser"), async (importOriginal) => ({
  ...(await importOriginal()),
  useT3TeamWorkProfileChooserEnabled: () => true,
  readT3TeamWorkProfileChooserEnabled: () => true,
}));

const STORAGE_KEY = "t3team:project-setup-profile";

describe("T3TeamProjectSetupProfileSelect", () => {
  it("opens the carousel on the saved role, saves the choice, closes and returns focus", async () => {
    window.localStorage.setItem(STORAGE_KEY, "requirements-product");
    // The picker is a settings control and needs no router.
    await using screen = await render(<T3TeamProjectSetupProfileSelect />, { router: false });
    const trigger = screen.container.querySelector<HTMLButtonElement>(
      '[aria-label="Default project setup profile"]',
    )!;
    expect(trigger.textContent).toContain("Requirements Partner");
    await act(() => trigger.click());
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await expect.element(page.getByRole("group", { name: "Choose your role" })).toBeVisible();
    await act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-option-id="engineer"] button[aria-label^="Show"]')!
        .click(),
    );
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-option-id="engineer"]')?.getAttribute("data-front"),
      ).toBe("true"),
    );
    await act(() => document.querySelector<HTMLButtonElement>("[data-rc-action]")!.click());
    await vi.waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe("engineer"));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
