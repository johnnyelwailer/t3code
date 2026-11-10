import { resolveEnvironmentFilter } from "@t3tools/client-runtime/t3team-environmentFilter";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { T3TeamSidebarEnvironmentFilter } from "./t3team-SidebarEnvironmentFilter";

const THIS_COMPUTER = { id: "local", label: "This computer", isPrimary: true };
const CLOUD = { id: "cloud", label: "Cloud session" };

function pills(
  environments: Array<{ id: string; label: string; isPrimary?: boolean }>,
  id: string | null = null,
) {
  return resolveEnvironmentFilter({ environments, selectedId: id }).pills;
}

describe("T3TeamSidebarEnvironmentFilter", () => {
  it("draws nothing while there is nothing to choose", async () => {
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter pills={pills([THIS_COMPUTER])} onSelect={vi.fn()} />,
      { router: false },
    );
    expect(screen.container.querySelector('[role="group"]')).toBeNull();
    expect(screen.container.textContent).toBe("");
  });

  it("offers real buttons in a labelled group and marks the selection", async () => {
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD], "cloud")}
        onSelect={vi.fn()}
      />,
      { router: false },
    );
    await expect.element(screen.getByRole("group", { name: "Environment" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cloud session" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "This computer" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect
      .element(screen.getByRole("button", { name: "All" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("selects on click and on keyboard, All resets to null", async () => {
    const onSelect = vi.fn();
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD], "cloud")}
        onSelect={onSelect}
      />,
      { router: false },
    );
    await userEvent.click(screen.getByRole("button", { name: "This computer" }));
    expect(onSelect).toHaveBeenLastCalledWith("local");

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onSelect.mock.calls.length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("collapses onto one row with a +N pill at a narrow width", async () => {
    const container = document.createElement("div");
    container.style.width = "150px";
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD, { id: "srv", label: "Build server" }])}
        onSelect={vi.fn()}
      />,
      { container, router: false },
    );
    const visible = [...screen.container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].filter(
      (button) => !button.closest('[aria-hidden="true"]'),
    );
    const rows = new Set(visible.map((button) => button.offsetTop));
    expect(rows.size).toBe(1);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    const overflow = visible.find((button) =>
      /^\d+ more environments?$/.test(button.getAttribute("aria-label") ?? ""),
    );
    expect(overflow).toBeDefined();
    const total = 4; // All + three environments
    const shownButtons = visible.filter((button) => button !== overflow);
    expect(shownButtons.length).toBeGreaterThanOrEqual(1);
    expect(shownButtons.length).toBeLessThan(total);
    expect(overflow!.textContent).toBe(`+${total - shownButtons.length}`);
    expect(shownButtons[0]!.textContent).toBe("All");
    expect(shownButtons.every((button) => !/Build server/.test(button.textContent ?? ""))).toBe(true);
  });

  it("opens the +N pill and selects a hidden environment from the list", async () => {
    const onSelect = vi.fn();
    const container = document.createElement("div");
    container.style.width = "150px";
    await using screen = await render(
      <T3TeamSidebarEnvironmentFilter
        pills={pills([THIS_COMPUTER, CLOUD, { id: "srv", label: "Build server" }])}
        onSelect={onSelect}
      />,
      { container, router: false },
    );
    const overflow = screen.container.querySelector<HTMLButtonElement>(
      '[role="group"] button[aria-label*="more environment"]',
    );
    expect(overflow).toBeDefined();
    await userEvent.click(overflow!);
    const option = page.getByRole("option", { name: "Build server" });
    await expect.element(option).toBeVisible();
    await userEvent.click(option);
    expect(onSelect).toHaveBeenLastCalledWith("srv");
  });
});
